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
  type PodcastHostKey,
} from "@/lib/podcasts/two-host";
import { getPodcastAudioConfig } from "@/lib/podcasts/config";
import { uploadGeneratedAsset } from "@/lib/supabase/storage";

const audioConfig = getPodcastAudioConfig();
const customizationUrl =
  process.env.QWEN_VOICE_DESIGN_ENDPOINT ??
  "https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization";
const ttsUrl =
  process.env.QWEN_TTS_ENDPOINT ??
  "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
const voiceDesignModel = audioConfig.voiceDesignModel;
const configuredTtsModel = audioConfig.ttsModel;
const ttsModel =
  configuredTtsModel && configuredTtsModel !== "cosyvoice-v1"
    ? configuredTtsModel
    : "qwen3-tts-vd-2026-01-26";

type WeeklyDigestRow = {
  id: string;
  creator_id: string;
  week_start: string;
  week_end: string;
  title: string;
  full_digest_json: unknown;
};

type HostVoice = {
  host: PodcastHostKey;
  voice: string;
};

async function main() {
  const apiKey = optionalEnv("DASHSCOPE_API_KEY") ?? optionalEnv("QWEN_API_KEY");
  if (!apiKey) throw new Error("DASHSCOPE_API_KEY or QWEN_API_KEY is required.");

  try {
    const voices = await getPodcastVoices(apiKey);
    const rows = await getWeeklyDigests();
    if (!rows.length) {
      console.log("No weekly digests found.");
      return;
    }

    for (const row of rows) {
      await generatePodcastForWeek({ apiKey, row, voices });
    }
  } finally {
    await closeSql();
  }
}

async function getWeeklyDigests() {
  const sql = getSql();
  return sql<WeeklyDigestRow[]>`
    select id, creator_id, week_start::text, week_end::text, title, full_digest_json
    from weekly_digests
    order by week_start desc
  `;
}

async function getPodcastVoices(apiKey: string): Promise<Record<PodcastHostKey, HostVoice>> {
  const femaleVoice =
    audioConfig.femaleVoice ??
    (await createVoice(apiKey, {
      preferredName: "brit_host",
      prompt:
        "A British-accented female podcast host for analytical financial and technology news: crisp diction, dry warmth, thoughtful pacing, not imitating any real person.",
      preview:
        "Welcome back. Let us take the claims carefully and separate signal from noise.",
    }));

  const maleVoice =
    audioConfig.maleVoice ??
    (await createVoice(apiKey, {
      preferredName: "us_host",
      prompt:
        "An American-accented male podcast co-host for analytical financial and technology news: warm, skeptical, conversational, plain-spoken, not imitating any real person.",
      preview:
        "The question is what changed, what is still uncertain, and what a smart listener can do next.",
    }));

  return {
    female_british: { host: "female_british", voice: femaleVoice },
    male_american: { host: "male_american", voice: maleVoice },
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
  voices: Record<PodcastHostKey, HostVoice>;
}) {
  const digest = weeklyDigestSchema.parse(input.row.full_digest_json);
  const lines = buildTwoHostPodcastLines(digest);
  const script = formatTwoHostPodcastScript(lines);
  const workDir = path.join(tmpdir(), `yt-newsletter-podcast-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });

  try {
    const segmentPaths: string[] = [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const voice = input.voices[line.host].voice;
      const segmentPath = path.join(workDir, `segment-${String(index).padStart(2, "0")}.wav`);
      await synthesizeLine({
        apiKey: input.apiKey,
        voice,
        text: line.text,
        outputPath: segmentPath,
      });
      segmentPaths.push(segmentPath);
    }

    const outputPath = path.join(workDir, "podcast.mp3");
    await concatenateAudio(segmentPaths, outputPath);
    const audio = await readFile(outputPath);
    const storagePath = `podcasts/${input.row.creator_id}/${input.row.week_start}-two-host.mp3`;
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
      characterCount: lines.reduce((sum, line) => sum + line.text.length, 0),
    });
    console.log(
      `Generated two-host podcast for ${input.row.week_start} to ${input.row.week_end}.`,
    );
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function synthesizeLine(input: {
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

async function savePodcastAsset(input: {
  row: WeeklyDigestRow;
  script: string;
  storagePath: string;
  publicUrl: string;
  characterCount: number;
}) {
  const sql = getSql();
  const assets = await sql<{ id: string }[]>`
    insert into assets (
      creator_id,
      weekly_digest_id,
      asset_type,
      provider,
      model,
      prompt,
      storage_path,
      public_url
    )
    values (
      ${input.row.creator_id},
      ${input.row.id},
      'podcast_audio',
      'qwen',
      ${ttsModel},
      ${input.script.slice(0, 2000)},
      ${input.storagePath},
      ${input.publicUrl}
    )
    returning id
  `;
  await sql`
    update weekly_digests
    set
      podcast_script = ${input.script},
      podcast_audio_asset_id = ${assets[0].id},
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
      'qwen',
      ${ttsModel},
      'podcast_audio',
      ${input.row.creator_id},
      ${input.row.id},
      ${Math.ceil(input.characterCount / 4)},
      0,
      ${Number(((input.characterCount / 10000) * 0.115).toFixed(6))}
    )
  `;
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

function optionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
