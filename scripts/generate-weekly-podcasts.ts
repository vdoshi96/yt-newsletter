import "./load-env";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { closeSql, getSql } from "@/lib/db";
import { weeklyDigestSchema } from "@/lib/digests/schemas";
import {
  buildTwoHostPodcastLines,
  formatTwoHostPodcastScript,
  getPodcastCastForWeek,
  type PodcastHostCast,
  type PodcastHostKey,
  type PodcastLine,
} from "@/lib/podcasts/two-host";
import { getPodcastAudioConfig, getPodcastScriptConfig } from "@/lib/podcasts/config";
import { uploadGeneratedAsset } from "@/lib/supabase/storage";
import { isWeeklyPodcastReady } from "@/lib/weekly/week-range";

const audioConfig = getPodcastAudioConfig();
const scriptConfig = getPodcastScriptConfig();
const args = new Map(
  process.argv
    .slice(2)
    .map((arg) => {
      const [key, ...rest] = arg.split("=");
      return [key, rest.join("=") || "true"];
    })
    .filter(([key]) => key.startsWith("--"))
    .map(([key, value]) => [key.replace(/^--/, ""), value]),
);
const customizationUrl =
  process.env.QWEN_VOICE_DESIGN_ENDPOINT ??
  "https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization";
const ttsUrl =
  process.env.QWEN_TTS_ENDPOINT ??
  "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
const voiceDesignModel = audioConfig.voiceDesignModel;
const configuredTtsModel = audioConfig.ttsModel;
const ttsModel =
  audioConfig.provider !== "gemini_flash" && configuredTtsModel && configuredTtsModel !== "cosyvoice-v1"
    ? configuredTtsModel
    : "qwen3-tts-vd-2026-01-26";
const geminiModel =
  audioConfig.provider === "gemini_flash"
    ? audioConfig.ttsModel
    : process.env.GEMINI_TTS_MODEL ?? "gemini-2.5-flash-preview-tts";

type WeeklyDigestRow = {
  id: string;
  creator_id: string;
  week_start: string;
  week_end: string;
  title: string;
  full_digest_json: unknown;
  podcast_audio_asset_id: string | null;
  podcast_status: string | null;
};

type HostVoice = {
  host: PodcastHostKey;
  voice: string;
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

async function main() {
  const provider = audioConfig.provider;
  const apiKey =
    provider === "gemini_flash"
      ? optionalEnv("GEMINI_API_KEY")
      : optionalEnv("DASHSCOPE_API_KEY") ?? optionalEnv("QWEN_API_KEY");
  if (provider !== "external_manual" && !apiKey) {
    throw new Error(
      provider === "gemini_flash"
        ? "GEMINI_API_KEY is required."
        : "DASHSCOPE_API_KEY or QWEN_API_KEY is required.",
    );
  }

  try {
    const rows = await getWeeklyDigests();
    if (!rows.length) {
      console.log("No weekly digests found.");
      return;
    }

    for (const row of rows) {
      try {
        await generatePodcastForWeek({ apiKey: apiKey ?? "", row });
      } catch (error) {
        await markPodcastFailed(row.id, (error as Error).message);
        console.error(`Podcast generation failed for ${row.week_start}: ${(error as Error).message}`);
      }
    }
  } finally {
    await closeSql();
  }
}

async function getWeeklyDigests() {
  const sql = getSql();
  const force = args.has("force");
  const includeNotReady = args.has("include-not-ready");
  const week = args.get("week");
  const limit = numericArg("limit", 4);
  const rows = await sql<WeeklyDigestRow[]>`
    select
      id,
      creator_id,
      week_start::text,
      week_end::text,
      title,
      full_digest_json,
      podcast_audio_asset_id,
      podcast_status
    from weekly_digests
    where (${week ?? null}::date is null or week_start = ${week ?? null}::date)
      and grounding_status = 'grounded'
      and processing_status = 'digest_generated'
      and coalesce(source_digest_count, 0) > 0
      and generation_model is not null
      and generated_at is not null
    order by week_start desc
  `;
  return rows
    .filter((row) => force || !row.podcast_audio_asset_id || row.podcast_status === "failed")
    .filter((row) =>
      includeNotReady
        ? true
        : isWeeklyPodcastReady({ weekStart: row.week_start, weekEnd: row.week_end }),
    )
    .slice(0, limit);
}

function splitPodcastLinesForTts(lines: PodcastLine[], maxCharacters = 900) {
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

async function getPodcastVoices(
  apiKey: string,
  cast: PodcastHostCast,
): Promise<Record<PodcastHostKey, HostVoice>> {
  const primaryVoice =
    audioConfig.femaleVoice ??
    (await createVoice(apiKey, {
      preferredName: `${cast.id}_primary`,
      prompt: `${cast.hosts.primary.description} Not imitating any real person.`,
      preview: `Welcome back. I'm ${cast.hosts.primary.name}, and today we are separating signal from noise.`,
    }));

  const secondaryVoice =
    audioConfig.maleVoice ??
    (await createVoice(apiKey, {
      preferredName: `${cast.id}_secondary`,
      prompt: `${cast.hosts.secondary.description} Not imitating any real person.`,
      preview: `I'm ${cast.hosts.secondary.name}. The question is what changed, what is uncertain, and what to do next.`,
    }));

  return {
    primary: { host: "primary", voice: primaryVoice },
    secondary: { host: "secondary", voice: secondaryVoice },
  };
}

async function createVoice(
  apiKey: string,
  input: { preferredName: string; prompt: string; preview: string },
) {
  const response = await fetch(customizationUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: voiceDesignModel,
      input: {
        action: "create",
        target_model: ttsModel,
        voice_prompt: input.prompt,
        preview_text: input.preview,
        preferred_name: input.preferredName,
        language: "en",
      },
      parameters: {
        sample_rate: 24000,
        response_format: "wav",
      },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.output?.voice) {
    throw new Error(`Qwen voice design failed with status ${response.status}.`);
  }
  return String(body.output.voice);
}

async function generatePodcastForWeek(input: {
  apiKey: string;
  row: WeeklyDigestRow;
}) {
  const digest = weeklyDigestSchema.parse(input.row.full_digest_json);
  const cast = getPodcastCastForWeek(input.row.week_start);
  const lines = buildTwoHostPodcastLines(digest, scriptConfig, cast);
  const script = formatTwoHostPodcastScript(lines);
  const wordCount = countWords(script);
  const voiceConfig = buildVoiceConfig(cast);
  const sourceReferences = digest.source_references.length
    ? digest.source_references
    : digest.source_notes.map((note) => ({
        date: note.date,
        label: note.label,
        url: note.url,
        note: note.note,
      }));

  if (audioConfig.provider === "external_manual") {
    await savePodcastScriptOnly({
      row: input.row,
      script,
      wordCount,
      cast,
      sourceReferences,
      voiceConfig,
    });
    console.log(`Stored external-manual podcast script for ${input.row.week_start}.`);
    return;
  }

  const workDir = path.join(tmpdir(), `yt-newsletter-podcast-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });

  try {
    const outputPath = path.join(workDir, "podcast.mp3");

    if (audioConfig.provider === "gemini_flash") {
      const ttsChunks = groupPodcastLinesForTts(splitPodcastLinesForTts(lines), 1_600);
      const segmentPaths: string[] = [];
      for (let index = 0; index < ttsChunks.length; index += 1) {
        const chunk = ttsChunks[index];
        const lastLine = chunk[chunk.length - 1];
        const nextLine = ttsChunks[index + 1]?.[0];
        const segmentPath = path.join(workDir, `segment-${String(index).padStart(2, "0")}.wav`);
        await synthesizeGeminiPodcast({
          apiKey: input.apiKey,
          cast,
          script: formatTwoHostPodcastScript(chunk),
          outputPath: segmentPath,
        });
        segmentPaths.push(segmentPath);
        if (nextLine) {
          const silencePath = path.join(workDir, `silence-${String(index).padStart(2, "0")}.wav`);
          await createSilenceSegment({
            outputPath: silencePath,
            durationMs: lastLine.pauseAfterMs ??
              defaultPauseAfterLine(lastLine.section, nextLine.section),
          });
          segmentPaths.push(silencePath);
        }
      }
      await concatenateAudio(segmentPaths, outputPath);
    } else {
      const voices = await getPodcastVoices(input.apiKey, cast);
      const ttsLines = splitPodcastLinesForTts(lines);
      const segmentPaths: string[] = [];
      for (let index = 0; index < ttsLines.length; index += 1) {
        const line = ttsLines[index];
        const voice = voices[line.host].voice;
        const segmentPath = path.join(workDir, `segment-${String(index).padStart(2, "0")}.wav`);
        await synthesizeQwenLine({
          apiKey: input.apiKey,
          voice,
          text: line.text,
          outputPath: segmentPath,
        });
        segmentPaths.push(segmentPath);
        if (index < ttsLines.length - 1) {
          const silencePath = path.join(workDir, `silence-${String(index).padStart(2, "0")}.wav`);
          await createSilenceSegment({
            outputPath: silencePath,
            durationMs: line.pauseAfterMs ??
              defaultPauseAfterLine(line.section, ttsLines[index + 1].section),
          });
          segmentPaths.push(silencePath);
        }
      }
      await concatenateAudio(segmentPaths, outputPath);
    }

    const audio = await readFile(outputPath);
    const audioQa = await buildAudioQa({
      outputPath,
      fileBytes: audio.byteLength,
      wordCount,
    });
    assertPodcastAudioQa(audioQa);
    const provider = audioConfig.provider === "gemini_flash" ? "gemini" : "qwen";
    const model = audioConfig.provider === "gemini_flash" ? geminiModel : ttsModel;
    const characterCount = lines.reduce((sum, line) => sum + line.text.length, 0);
    const storagePath = `podcasts/${input.row.creator_id}/${input.row.week_start}-${provider}-${cast.id}.mp3`;
    const publicUrl = await uploadGeneratedAsset({
      path: storagePath,
      contentType: "audio/mpeg",
      body: audio,
    });
    await savePodcastAsset({
      row: input.row,
      script,
      storagePath,
      publicUrl,
      characterCount,
      wordCount,
      provider,
      model,
      cast,
      sourceReferences,
      voiceConfig,
      audioQa,
      estimatedCostUsd: estimateAudioCostUsd(provider, characterCount),
    });
    console.log(
      `Generated ${provider} podcast for ${input.row.week_start} to ${input.row.week_end} with ${cast.label}.`,
    );
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function synthesizeGeminiPodcast(input: {
  apiKey: string;
  cast: PodcastHostCast;
  script: string;
  outputPath: string;
}) {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`,
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
            model: geminiModel,
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
        await writeFile(input.outputPath, createWav(Buffer.from(data, "base64")));
        return;
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

async function synthesizeQwenLine(input: {
  apiKey: string;
  voice: string;
  text: string;
  outputPath: string;
}) {
  const response = await fetch(ttsUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ttsModel,
      input: {
        text: input.text,
        voice: input.voice,
        language_type: "English",
      },
    }),
  });
  const body = await response.json().catch(() => ({}));
  const audioUrl = body?.output?.audio?.url;
  if (!response.ok || !audioUrl) {
    throw new Error(`Qwen TTS failed with status ${response.status}.`);
  }
  const audioResponse = await fetch(String(audioUrl));
  if (!audioResponse.ok) {
    throw new Error(`Could not download Qwen audio: ${audioResponse.status}.`);
  }
  await writeFile(input.outputPath, Buffer.from(await audioResponse.arrayBuffer()));
}

async function createSilenceSegment(input: { outputPath: string; durationMs: number }) {
  await run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=24000:cl=mono",
    "-t",
    String(input.durationMs / 1000),
    "-c:a",
    "pcm_s16le",
    input.outputPath,
  ]);
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

async function concatenateAudio(segmentPaths: string[], outputPath: string) {
  const args = [
    "-y",
    ...segmentPaths.flatMap((segmentPath) => ["-i", segmentPath]),
    "-filter_complex",
    `concat=n=${segmentPaths.length}:v=0:a=1[out]`,
    "-map",
    "[out]",
    "-codec:a",
    "libmp3lame",
    "-b:a",
    audioConfig.audioBitrate,
    outputPath,
  ];
  await run("ffmpeg", args);
}

async function buildAudioQa(input: {
  outputPath: string;
  fileBytes: number;
  wordCount: number;
}): Promise<PodcastAudioQa> {
  const probe = await probeAudio(input.outputPath);
  const durationSeconds = probe.durationSeconds;
  const actualWpm = durationSeconds && durationSeconds > 0
    ? Number((input.wordCount / (durationSeconds / 60)).toFixed(1))
    : null;
  const qa: PodcastAudioQa = {
    status: "passed",
    duration_seconds: durationSeconds,
    target_minutes: scriptConfig.targetMinutes,
    actual_wpm: actualWpm,
    file_bytes: input.fileBytes,
    codec: probe.codec,
    sample_rate: probe.sampleRate,
    channels: probe.channels,
    bitrate: probe.bitrate,
    qa_errors: [],
  };
  const targetSeconds = scriptConfig.targetMinutes * 60;
  const minDuration = Math.max(300, targetSeconds * 0.55);
  const maxDuration = targetSeconds * 1.65;
  if (!durationSeconds || durationSeconds < minDuration) {
    qa.qa_errors.push(
      `Audio duration ${durationSeconds ?? 0}s is shorter than minimum ${Math.round(minDuration)}s.`,
    );
  }
  if (durationSeconds && durationSeconds > maxDuration) {
    qa.qa_errors.push(
      `Audio duration ${Math.round(durationSeconds)}s is longer than maximum ${Math.round(maxDuration)}s.`,
    );
  }
  if (actualWpm && (actualWpm < 70 || actualWpm > 230)) {
    qa.qa_errors.push(`Actual pacing ${actualWpm} WPM is outside the expected range.`);
  }
  if (input.fileBytes < 100_000) {
    qa.qa_errors.push("Audio file is too small to be a complete podcast asset.");
  }
  if (!probe.codec) {
    qa.qa_errors.push("Audio codec could not be probed.");
  }
  if (qa.qa_errors.length) qa.status = "failed";
  return qa;
}

async function probeAudio(outputPath: string) {
  const raw = await runCapture("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration,bit_rate:stream=codec_name,sample_rate,channels",
    "-of",
    "json",
    outputPath,
  ]);
  const parsed = JSON.parse(raw) as {
    streams?: Array<{ codec_name?: string; sample_rate?: string; channels?: number }>;
    format?: { duration?: string; bit_rate?: string };
  };
  const stream = parsed.streams?.[0];
  const duration = Number(parsed.format?.duration);
  const sampleRate = Number(stream?.sample_rate);
  const bitrate = Number(parsed.format?.bit_rate);
  return {
    durationSeconds: Number.isFinite(duration) ? Number(duration.toFixed(2)) : null,
    codec: stream?.codec_name ?? null,
    sampleRate: Number.isFinite(sampleRate) ? sampleRate : null,
    channels: typeof stream?.channels === "number" ? stream.channels : null,
    bitrate: Number.isFinite(bitrate) ? bitrate : null,
  };
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
  provider: string;
  model: string;
  cast: PodcastHostCast;
  sourceReferences: Array<Record<string, unknown>>;
  voiceConfig: Record<string, unknown>;
  audioQa: PodcastAudioQa;
  estimatedCostUsd: number;
}) {
  const sql = getSql();
  const generationMetadata = buildPodcastGenerationMetadata(input);
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
      ${input.provider},
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
      podcast_voice_config = ${sql.json(toJsonParameter(input.voiceConfig))},
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
      ${input.provider},
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

async function savePodcastScriptOnly(input: {
  row: WeeklyDigestRow;
  script: string;
  wordCount: number;
  cast: PodcastHostCast;
  sourceReferences: Array<Record<string, unknown>>;
  voiceConfig: Record<string, unknown>;
}) {
  const sql = getSql();
  await sql`
    update weekly_digests
    set
      podcast_script = ${input.script},
      podcast_status = 'pending',
      podcast_generation_metadata = ${sql.json(toJsonParameter({
        status: "script_generated",
        target_minutes: scriptConfig.targetMinutes,
        words_per_minute: scriptConfig.wordsPerMinute,
        word_count: input.wordCount,
        provider: "external_manual",
        model: "external_manual",
        cast_id: input.cast.id,
        generated_at: new Date().toISOString(),
        voice_config: input.voiceConfig,
        source_references: input.sourceReferences,
      }))},
      podcast_voice_config = ${sql.json(toJsonParameter(input.voiceConfig))},
      source_references = ${sql.json(toJsonParameter(input.sourceReferences))},
      updated_at = now()
    where id = ${input.row.id}
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

function buildPodcastGenerationMetadata(input: {
  wordCount: number;
  provider: string;
  model: string;
  cast: PodcastHostCast;
  voiceConfig: Record<string, unknown>;
  sourceReferences: Array<Record<string, unknown>>;
  audioQa: PodcastAudioQa;
}) {
  return {
    status: "podcast_generated",
    target_minutes: scriptConfig.targetMinutes,
    words_per_minute: scriptConfig.wordsPerMinute,
    word_count: input.wordCount,
    provider: input.provider,
    model: input.model,
    cast_id: input.cast.id,
    generated_at: new Date().toISOString(),
    voice_config: input.voiceConfig,
    audio_qa: input.audioQa,
    source_references: input.sourceReferences,
  };
}

function buildVoiceConfig(cast: PodcastHostCast) {
  return {
    provider: audioConfig.provider,
    cast_id: cast.id,
    hosts: {
      primary: {
        name: cast.hosts.primary.name,
        geminiVoice: cast.hosts.primary.geminiVoice,
      },
      secondary: {
        name: cast.hosts.secondary.name,
        geminiVoice: cast.hosts.secondary.geminiVoice,
      },
    },
  };
}

function estimateAudioCostUsd(provider: string, characterCount: number) {
  if (provider === "qwen") {
    return Number(((characterCount / 10000) * 0.115).toFixed(6));
  }

  const estimatedMinutes = characterCount / 900;
  const perMinute = numberEnv("GEMINI_TTS_ESTIMATED_COST_PER_MINUTE", 0.015);
  return Number((estimatedMinutes * perMinute).toFixed(6));
}

function defaultPauseAfterLine(
  currentSection: ReturnType<typeof buildTwoHostPodcastLines>[number]["section"],
  nextSection: ReturnType<typeof buildTwoHostPodcastLines>[number]["section"],
) {
  if (currentSection !== nextSection) return 1_000;
  if (currentSection === "closing") return 1_500;
  return 400;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

function runCapture(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString("utf8"));
      } else {
        reject(
          new Error(
            `${command} exited with code ${code}: ${Buffer.concat(stderr).toString("utf8")}`,
          ),
        );
      }
    });
  });
}

function optionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function numericArg(name: string, fallback: number) {
  const value = Number(args.get(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function countWords(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

function toJsonParameter(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
