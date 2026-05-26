import { generatePodcastScriptPayload } from "@/lib/ai";
import { numberEnv } from "@/lib/config";
import { getSql } from "@/lib/db";
import { weeklyDigestSchema } from "@/lib/digests/schemas";
import { loadPrompt } from "@/lib/prompts";
import { uploadGeneratedAsset } from "@/lib/supabase/storage";
import { isWeeklyPodcastReady } from "@/lib/weekly/week-range";
import {
  buildTwoHostPodcastLines,
  formatTwoHostPodcastScript,
  getPodcastCastForWeek,
  type PodcastHostCast,
  type PodcastHostKey,
  type PodcastLine,
} from "./two-host";
import { getPodcastAudioConfig, getPodcastScriptConfig } from "./config";

type WeeklyDigestRow = {
  id: string;
  creator_id: string;
  week_start: string;
  week_end: string;
  title: string;
  full_digest_json: unknown;
  podcast_script: string | null;
  podcast_audio_asset_id: string | null;
  podcast_status: string | null;
};

type PodcastAudioQa = {
  status: "passed" | "failed";
  duration_seconds: number | null;
  target_minutes: number;
  actual_wpm: number | null;
  file_bytes: number;
  codec: string | null;
  sample_rate: number | null;
  channels: number | null;
  bitrate: number | null;
  qa_errors: string[];
};

type WavData = {
  audioFormat: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  data: Buffer;
};

const audioConfig = getPodcastAudioConfig();
const scriptConfig = getPodcastScriptConfig();

export async function generateDueWeeklyPodcasts(input: {
  force?: boolean;
  includeNotReady?: boolean;
  limit?: number;
  week?: string | null;
} = {}) {
  const apiKey = optionalEnv("GEMINI_API_KEY");
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required for scheduled podcast audio generation.");
  }
  if (audioConfig.provider !== "gemini_flash") {
    throw new Error("Scheduled podcast audio currently supports PODCAST_TTS_PROVIDER=gemini_flash.");
  }

  const rows = await getWeeklyDigests(input);
  let generated = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await generatePodcastForWeek({ apiKey, row });
      generated += 1;
    } catch (error) {
      failed += 1;
      await markPodcastFailed(row.id, (error as Error).message);
      console.error("[podcast-cron:week-failed]", {
        weeklyDigestId: row.id,
        weekStart: row.week_start,
        message: (error as Error).message,
      });
    }
  }

  return {
    checked: rows.length,
    generated,
    failed,
    limit: input.limit ?? numberEnv("PODCASTS_PER_CRON_RUN", 1),
  };
}

async function getWeeklyDigests(input: {
  force?: boolean;
  includeNotReady?: boolean;
  limit?: number;
  week?: string | null;
}) {
  const sql = getSql();
  const limit = input.limit ?? numberEnv("PODCASTS_PER_CRON_RUN", 1);
  const rows = await sql<WeeklyDigestRow[]>`
    select
      id,
      creator_id,
      week_start::text,
      week_end::text,
      title,
      full_digest_json,
      podcast_script,
      podcast_audio_asset_id,
      podcast_status
    from weekly_digests
    where (${input.week ?? null}::date is null or week_start = ${input.week ?? null}::date)
      and grounding_status = 'grounded'
      and processing_status = 'digest_generated'
      and coalesce(source_digest_count, 0) > 0
      and generation_model is not null
      and generated_at is not null
    order by week_start desc
  `;
  return rows
    .filter((row) => input.force || !row.podcast_audio_asset_id || row.podcast_status === "failed")
    .filter((row) =>
      input.includeNotReady
        ? true
        : isWeeklyPodcastReady({ weekStart: row.week_start, weekEnd: row.week_end }),
    )
    .slice(0, limit);
}

async function generatePodcastForWeek(input: { apiKey: string; row: WeeklyDigestRow }) {
  const digest = weeklyDigestSchema.parse(input.row.full_digest_json);
  const cast = getPodcastCastForWeek(input.row.week_start);
  const sourceText = JSON.stringify(digest.source_references ?? digest.source_notes);
  const script = input.row.podcast_script?.trim() || await generatePodcastScript({
    creatorId: input.row.creator_id,
    weekStart: input.row.week_start,
    weekEnd: input.row.week_end,
    weeklyDigest: digest,
    sourceText,
    hostNames: cast.label,
  });
  const lines = parsePodcastScript(script, cast, digest);
  const wordCount = countWords(script);
  const sourceReferences = digest.source_references.length
    ? digest.source_references
    : digest.source_notes.map((note) => ({
        date: note.date,
        label: note.label,
        url: note.url,
        note: note.note,
      }));
  const ttsChunks = groupPodcastLinesForTts(
    splitPodcastLinesForTts(lines, audioConfig.geminiLineMaxCharacters),
    audioConfig.geminiChunkMaxCharacters,
  );
  const wavSegments: Buffer[] = [];

  for (let index = 0; index < ttsChunks.length; index += 1) {
    const chunk = ttsChunks[index];
    const lastLine = chunk[chunk.length - 1];
    const nextLine = ttsChunks[index + 1]?.[0];
    wavSegments.push(await synthesizeGeminiPodcast({
      apiKey: input.apiKey,
      cast,
      script: formatTwoHostPodcastScript(chunk),
    }));
    if (nextLine) {
      wavSegments.push(createSilenceWav(
        lastLine.pauseAfterMs ?? defaultPauseAfterLine(lastLine.section, nextLine.section),
      ));
    }
  }

  const audio = concatenateWavSegments(wavSegments);
  const audioQa = buildWavAudioQa({
    audio,
    wordCount,
  });
  assertPodcastAudioQa(audioQa);

  const characterCount = lines.reduce((sum, line) => sum + line.text.length, 0);
  const storagePath = `podcasts/${input.row.creator_id}/${input.row.week_start}-gemini-${cast.id}.wav`;
  const publicUrl = await uploadGeneratedAsset({
    path: storagePath,
    contentType: "audio/wav",
    body: audio,
  });
  await savePodcastAsset({
    row: input.row,
    script,
    storagePath,
    publicUrl,
    characterCount,
    wordCount,
    model: audioConfig.ttsModel,
    cast,
    sourceReferences,
    audioQa,
    estimatedCostUsd: estimateAudioCostUsd(characterCount),
  });
  console.info("[podcast-cron:week-generated]", {
    weeklyDigestId: input.row.id,
    weekStart: input.row.week_start,
    model: audioConfig.ttsModel,
    castId: cast.id,
  });
}

async function generatePodcastScript(input: {
  creatorId: string;
  weekStart: string;
  weekEnd: string;
  weeklyDigest: ReturnType<typeof weeklyDigestSchema.parse>;
  sourceText: string;
  hostNames: string;
}) {
  if (scriptConfig.generationMode !== "provider_script") {
    const cast = getPodcastCastForWeek(input.weekStart);
    return formatTwoHostPodcastScript(buildTwoHostPodcastLines(input.weeklyDigest, scriptConfig, cast));
  }
  const prompt = await loadPrompt("podcast_script");
  const providerScript = await generatePodcastScriptPayload({
    creatorId: input.creatorId,
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
    weeklyDigest: input.weeklyDigest,
    sourceText: input.sourceText,
    prompt,
    hostNames: input.hostNames,
  });
  return providerScript.podcast_script;
}

function parsePodcastScript(
  script: string,
  cast: PodcastHostCast,
  digest: ReturnType<typeof weeklyDigestSchema.parse>,
) {
  const parsed = parseStoredPodcastScript(script, cast);
  return parsed.length ? parsed : buildTwoHostPodcastLines(digest, scriptConfig, cast);
}

function parseStoredPodcastScript(script: string, cast: PodcastHostCast): PodcastLine[] {
  const hostByName = new Map<string, PodcastHostKey>([
    [cast.hosts.primary.name.toLowerCase(), "primary"],
    [cast.hosts.secondary.name.toLowerCase(), "secondary"],
  ]);
  const paragraphs = script
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  let fallbackHost: PodcastHostKey = "primary";
  return paragraphs.map((paragraph, index) => {
    const match = paragraph.match(/^(?:\*\*)?([A-Za-z][A-Za-z\s'-]{0,40})(?:\*\*)?:\s*([\s\S]+)$/);
    const parsedHost = match ? hostByName.get(match[1].trim().toLowerCase()) : undefined;
    const host = parsedHost ?? fallbackHost;
    const text = (match?.[2] ?? paragraph).trim();
    fallbackHost = host === "primary" ? "secondary" : "primary";
    return {
      host,
      hostName: cast.hosts[host].name,
      section: inferPodcastSection(text, index, paragraphs.length),
      pauseAfterMs: text.includes("[pause]") || text.includes("[beat]") ? 900 : undefined,
      text,
    };
  });
}

function splitPodcastLinesForTts(lines: PodcastLine[], maxCharacters: number) {
  const splitLines: PodcastLine[] = [];
  for (const line of lines) {
    if (line.text.length <= maxCharacters) {
      splitLines.push(line);
      continue;
    }
    const chunks = splitTextForTts(line.text, maxCharacters);
    for (const [index, text] of chunks.entries()) {
      splitLines.push({
        ...line,
        text,
        pauseAfterMs: index === chunks.length - 1 ? line.pauseAfterMs : 250,
      });
    }
  }
  return splitLines;
}

function groupPodcastLinesForTts(lines: PodcastLine[], maxCharacters: number) {
  const chunks: PodcastLine[][] = [];
  let current: PodcastLine[] = [];
  let currentCharacters = 0;
  for (const line of lines) {
    const lineCharacters = line.hostName.length + line.text.length + 4;
    if (current.length && currentCharacters + lineCharacters > maxCharacters) {
      chunks.push(current);
      current = [line];
      currentCharacters = lineCharacters;
    } else {
      current.push(line);
      currentCharacters += lineCharacters;
    }
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function splitTextForTts(text: string, maxCharacters: number) {
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences.map((item) => item.trim()).filter(Boolean)) {
    if (!current) {
      current = sentence;
    } else if (`${current} ${sentence}`.length <= maxCharacters) {
      current = `${current} ${sentence}`;
    } else {
      chunks.push(current);
      current = sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks.flatMap((chunk) => {
    if (chunk.length <= maxCharacters) return [chunk];
    const fallback = chunk.match(new RegExp(`.{1,${maxCharacters}}(?:\\s|$)`, "g"));
    return fallback?.map((part) => part.trim()).filter(Boolean) ?? [chunk];
  });
}

async function synthesizeGeminiPodcast(input: {
  apiKey: string;
  cast: PodcastHostCast;
  script: string;
}) {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${audioConfig.ttsModel}:generateContent`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": input.apiKey,
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text:
                      "Read this as a natural two-host weekly technology podcast. " +
                      "Use the speaker labels only to assign voices; do not read the labels aloud. " +
                      "Keep the tone conversational, source-grounded, lightly skeptical, and paced like hosts thinking together.\n\n" +
                      input.script,
                  },
                ],
              },
            ],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                multiSpeakerVoiceConfig: {
                  speakerVoiceConfigs: [
                    {
                      speaker: input.cast.hosts.primary.name,
                      voiceConfig: {
                        prebuiltVoiceConfig: {
                          voiceName: input.cast.hosts.primary.geminiVoice,
                        },
                      },
                    },
                    {
                      speaker: input.cast.hosts.secondary.name,
                      voiceConfig: {
                        prebuiltVoiceConfig: {
                          voiceName: input.cast.hosts.secondary.geminiVoice,
                        },
                      },
                    },
                  ],
                },
              },
            },
            model: audioConfig.ttsModel,
          }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
        candidates?: Array<{
          content?: { parts?: Array<{ inlineData?: { data?: string } }> };
        }>;
      };
      const data = body.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (response.ok && data) {
        return createWav(Buffer.from(data, "base64"));
      }
      const message = body.error?.message;
      lastError = new Error(
        `Gemini TTS failed with status ${response.status}${message ? `: ${message}` : ""}.`,
      );
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Gemini TTS failed.");
    }
    if (attempt < 3) {
      await sleep(1_500 * attempt);
    }
  }

  throw lastError ?? new Error("Gemini TTS failed.");
}

function createWav(pcm: Buffer, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

function createSilenceWav(durationMs: number) {
  const sampleRate = 24000;
  const channels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = channels * (bitsPerSample / 8);
  const samples = Math.max(1, Math.round((sampleRate * durationMs) / 1000));
  return createWav(Buffer.alloc(samples * bytesPerSample), sampleRate, channels, bitsPerSample);
}

function concatenateWavSegments(segments: Buffer[]) {
  const wavs = segments.map(parseWav);
  const [first] = wavs;
  for (const wav of wavs) {
    if (
      wav.audioFormat !== first.audioFormat ||
      wav.channels !== first.channels ||
      wav.sampleRate !== first.sampleRate ||
      wav.bitsPerSample !== first.bitsPerSample
    ) {
      throw new Error("Podcast audio segments do not share the same WAV format.");
    }
  }
  return createWav(
    Buffer.concat(wavs.map((wav) => wav.data)),
    first.sampleRate,
    first.channels,
    first.bitsPerSample,
  );
}

function parseWav(buffer: Buffer): WavData {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Provider did not return WAV audio.");
  }

  let offset = 12;
  let audioFormat = 1;
  let channels = 1;
  let sampleRate = 24000;
  let bitsPerSample = 16;
  let data: Buffer | null = null;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    if (chunkId === "fmt ") {
      audioFormat = buffer.readUInt16LE(chunkStart);
      channels = buffer.readUInt16LE(chunkStart + 2);
      sampleRate = buffer.readUInt32LE(chunkStart + 4);
      bitsPerSample = buffer.readUInt16LE(chunkStart + 14);
    } else if (chunkId === "data") {
      data = buffer.subarray(chunkStart, chunkStart + chunkSize);
    }
    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  if (!data) throw new Error("Provider WAV audio did not include a data chunk.");
  return { audioFormat, channels, sampleRate, bitsPerSample, data };
}

function buildWavAudioQa(input: { audio: Buffer; wordCount: number }): PodcastAudioQa {
  const wav = parseWav(input.audio);
  const byteRate = wav.sampleRate * wav.channels * (wav.bitsPerSample / 8);
  const durationSeconds = Number((wav.data.length / byteRate).toFixed(2));
  const actualWpm = durationSeconds > 0
    ? Number((input.wordCount / (durationSeconds / 60)).toFixed(1))
    : null;
  const qa: PodcastAudioQa = {
    status: "passed",
    duration_seconds: durationSeconds,
    target_minutes: scriptConfig.targetMinutes,
    actual_wpm: actualWpm,
    file_bytes: input.audio.byteLength,
    codec: "pcm_s16le",
    sample_rate: wav.sampleRate,
    channels: wav.channels,
    bitrate: byteRate * 8,
    qa_errors: [],
  };
  const targetSeconds = scriptConfig.targetMinutes * 60;
  const minDuration = Math.max(300, targetSeconds * 0.55);
  const maxDuration = targetSeconds * 1.65;
  if (durationSeconds < minDuration) {
    qa.qa_errors.push(`Audio duration ${durationSeconds}s is shorter than minimum ${Math.round(minDuration)}s.`);
  }
  if (durationSeconds > maxDuration) {
    qa.qa_errors.push(`Audio duration ${Math.round(durationSeconds)}s is longer than maximum ${Math.round(maxDuration)}s.`);
  }
  if (actualWpm && (actualWpm < 70 || actualWpm > 230)) {
    qa.qa_errors.push(`Actual pacing ${actualWpm} WPM is outside the expected range.`);
  }
  if (input.audio.byteLength < 100_000) {
    qa.qa_errors.push("Audio file is too small to be a complete podcast asset.");
  }
  if (qa.qa_errors.length) qa.status = "failed";
  return qa;
}

function assertPodcastAudioQa(audioQa: PodcastAudioQa) {
  if (audioQa.status === "failed") {
    throw new Error(`Podcast audio QA failed: ${audioQa.qa_errors.join(" ")}`);
  }
}

async function savePodcastAsset(input: {
  row: WeeklyDigestRow;
  script: string;
  storagePath: string;
  publicUrl: string;
  characterCount: number;
  wordCount: number;
  model: string;
  cast: PodcastHostCast;
  sourceReferences: Array<Record<string, unknown>>;
  audioQa: PodcastAudioQa;
  estimatedCostUsd: number;
}) {
  const sql = getSql();
  const voiceConfig = buildVoiceConfig(input.cast);
  const generationMetadata = {
    status: "podcast_generated",
    target_minutes: scriptConfig.targetMinutes,
    words_per_minute: scriptConfig.wordsPerMinute,
    word_count: input.wordCount,
    provider: "gemini",
    model: input.model,
    cast_id: input.cast.id,
    generated_at: new Date().toISOString(),
    voice_config: voiceConfig,
    audio_qa: input.audioQa,
    source_references: input.sourceReferences,
  };
  const assets = await sql<{ id: string }[]>`
    insert into assets (
      creator_id,
      weekly_digest_id,
      asset_type,
      provider,
      model,
      prompt,
      storage_path,
      public_url,
      generation_status,
      generation_metadata,
      source_references
    )
    values (
      ${input.row.creator_id},
      ${input.row.id},
      'podcast_audio',
      'gemini',
      ${input.model},
      ${input.script.slice(0, 2000)},
      ${input.storagePath},
      ${input.publicUrl},
      'podcast_generated',
      ${sql.json(toJsonParameter(generationMetadata))},
      ${sql.json(toJsonParameter(input.sourceReferences))}
    )
    on conflict (storage_path) do update set
      creator_id = excluded.creator_id,
      weekly_digest_id = excluded.weekly_digest_id,
      asset_type = excluded.asset_type,
      provider = excluded.provider,
      model = excluded.model,
      prompt = excluded.prompt,
      public_url = excluded.public_url,
      generation_status = excluded.generation_status,
      generation_metadata = excluded.generation_metadata,
      source_references = excluded.source_references,
      created_at = now()
    returning id
  `;
  await sql`
    update weekly_digests
    set
      podcast_script = ${input.script},
      podcast_audio_asset_id = ${assets[0].id},
      podcast_status = 'podcast_generated',
      podcast_generation_metadata = ${sql.json(toJsonParameter(generationMetadata))},
      podcast_generated_at = now(),
      podcast_model = ${input.model},
      podcast_voice_config = ${sql.json(toJsonParameter(voiceConfig))},
      source_references = ${sql.json(toJsonParameter(input.sourceReferences))},
      updated_at = now()
    where id = ${input.row.id}
  `;
  await sql`
    insert into model_usage (
      provider,
      model,
      task_type,
      creator_id,
      weekly_digest_id,
      input_tokens,
      output_tokens,
      estimated_cost_usd
    )
    values (
      'gemini',
      ${input.model},
      'podcast_audio',
      ${input.row.creator_id},
      ${input.row.id},
      ${Math.ceil(input.characterCount / 4)},
      0,
      ${input.estimatedCostUsd}
    )
  `;
}

async function markPodcastFailed(weeklyDigestId: string, message: string) {
  const sql = getSql();
  await sql`
    update weekly_digests
    set
      podcast_audio_asset_id = null,
      podcast_status = 'failed',
      podcast_generated_at = null,
      podcast_model = null,
      podcast_generation_metadata = coalesce(podcast_generation_metadata, '{}'::jsonb) ||
        ${sql.json(toJsonParameter({
          status: "failed",
          error_message: message,
          failed_at: new Date().toISOString(),
        }))}::jsonb,
      updated_at = now()
    where id = ${weeklyDigestId}
  `;
}

function inferPodcastSection(
  text: string,
  index: number,
  total: number,
): PodcastLine["section"] {
  const lower = text.toLowerCase();
  if (index <= 1) return "cold_open";
  if (lower.includes("source") || lower.includes("grounded")) return "source_contract";
  if (lower.includes("market") || lower.includes("executive") || lower.includes("board")) {
    return "market";
  }
  if (lower.includes("research") || lower.includes("evidence")) return "research";
  if (lower.includes("takeaway") || lower.includes("try this") || lower.includes("next step")) {
    return "practical";
  }
  if (lower.includes("uncertain") || lower.includes("uncertainty") || lower.includes("caveat")) {
    return "uncertainty";
  }
  if (index >= total - 2 || lower.includes("that is the week")) return "closing";
  return "topic";
}

function defaultPauseAfterLine(current: PodcastLine["section"], next?: PodcastLine["section"]) {
  if (!next || current !== next) return 900;
  if (current === "cold_open" || current === "closing") return 750;
  return 450;
}

function buildVoiceConfig(cast: PodcastHostCast) {
  return {
    provider: "gemini_flash",
    cast_id: cast.id,
    primary: {
      name: cast.hosts.primary.name,
      voice: cast.hosts.primary.geminiVoice,
    },
    secondary: {
      name: cast.hosts.secondary.name,
      voice: cast.hosts.secondary.geminiVoice,
    },
  };
}

function estimateAudioCostUsd(characterCount: number) {
  const perMinute = numberEnv("GEMINI_TTS_ESTIMATED_COST_PER_MINUTE", 0.015);
  const estimatedMinutes = Math.max(1, characterCount / 900);
  return Number((estimatedMinutes * perMinute).toFixed(4));
}

function countWords(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

function toJsonParameter(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

function optionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
