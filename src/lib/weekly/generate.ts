import { generateWeeklyDigestPayload } from "@/lib/ai";
import { booleanEnv } from "@/lib/config";
import { getSql } from "@/lib/db";
import { loadPrompt } from "@/lib/prompts";
import {
  buildTwoHostPodcastLines,
  formatTwoHostPodcastScript,
} from "@/lib/podcasts/two-host";
import { getPodcastAudioConfig } from "@/lib/podcasts/config";
import { uploadGeneratedAsset } from "@/lib/supabase/storage";
import {
  getSundayToSaturdayWeekRange,
  isWeeklyDigestReady,
  type WeeklyRange,
} from "@/lib/weekly/week-range";
import { buildWeeklySourceText, type WeeklySourceDigest } from "@/lib/weekly/source-text";

export async function ensureWeeklyDigestForVideoWeek(input: {
  creatorId: string;
  publishedAt: string | Date | null;
  now?: Date;
}) {
  if (!input.publishedAt) return null;
  const range = getSundayToSaturdayWeekRange(input.publishedAt);
  if (!isWeeklyDigestReady(range, input.now)) return null;

  return ensureWeeklyDigestForRange({
    creatorId: input.creatorId,
    range,
  });
}

export async function ensureCompletedWeeklyDigestsForCreator(input: {
  creatorId: string;
  now?: Date;
  forceRegenerate?: boolean;
}) {
  const sql = getSql();
  const rows = await sql<Array<{ digest_date: string }>>`
    select distinct digest_date::text as digest_date
    from daily_digests
    where creator_id = ${input.creatorId}
    order by digest_date asc
  `;

  const rangesByStart = new Map<string, WeeklyRange>();
  for (const row of rows) {
    const range = getSundayToSaturdayWeekRange(row.digest_date);
    if (isWeeklyDigestReady(range, input.now)) {
      rangesByStart.set(range.weekStart, range);
    }
  }

  const weekDigestIds: string[] = [];
  for (const range of rangesByStart.values()) {
    const id = await ensureWeeklyDigestForRange({
      creatorId: input.creatorId,
      range,
      forceRegenerate: input.forceRegenerate,
    });
    if (id) weekDigestIds.push(id);
  }

  return { weekCount: weekDigestIds.length, weekDigestIds };
}

export async function ensureWeeklyDigestForRange(input: {
  creatorId: string;
  range: WeeklyRange;
  forceRegenerate?: boolean;
}) {
  const sql = getSql();
  const { weekStart, weekEnd } = input.range;
  const existing = await sql<{ id: string }[]>`
    select id
    from weekly_digests
    where creator_id = ${input.creatorId}
      and week_start = ${weekStart}
    limit 1
  `;
  if (existing[0] && !input.forceRegenerate) return existing[0].id;

  const daily = await sql<WeeklySourceDigest[]>`
    select
      title,
      front_page_summary,
      plain_english_explanation,
      full_digest_json,
      why_it_matters,
      digest_date::text
    from daily_digests
    where creator_id = ${input.creatorId}
      and digest_date between ${weekStart} and ${weekEnd}
    order by digest_date asc, created_at asc
  `;
  if (!daily.length) return existing[0]?.id ?? null;

  const prompt = await loadPrompt("weekly_digest");
  const sourceText = buildWeeklySourceText(daily);
  const generatedPayload = await generateWeeklyDigestPayload({
    creatorId: input.creatorId,
    weekStart,
    weekEnd,
    sourceText,
    prompt,
  });
  const payload = {
    ...generatedPayload,
    podcast_script: formatTwoHostPodcastScript(buildTwoHostPodcastLines(generatedPayload)),
  };

  if (existing[0]) {
    await sql`
      update weekly_digests
      set
        week_end = ${weekEnd},
        title = ${payload.title},
        newsletter_markdown = ${payload.newsletter_markdown},
        ranked_topics = ${sql.json(payload.ranked_topics)},
        what_changed = ${payload.what_changed},
        what_to_do_next = ${sql.json(payload.what_to_do_next)},
        podcast_script = ${payload.podcast_script},
        full_digest_json = ${sql.json(payload)},
        updated_at = now()
      where id = ${existing[0].id}
    `;
    return existing[0].id;
  }

  const rows = await sql<{ id: string }[]>`
    insert into weekly_digests (
      creator_id,
      week_start,
      week_end,
      title,
      newsletter_markdown,
      ranked_topics,
      what_changed,
      what_to_do_next,
      podcast_script,
      full_digest_json
    )
    values (
      ${input.creatorId},
      ${weekStart},
      ${weekEnd},
      ${payload.title},
      ${payload.newsletter_markdown},
      ${sql.json(payload.ranked_topics)},
      ${payload.what_changed},
      ${sql.json(payload.what_to_do_next)},
      ${payload.podcast_script},
      ${sql.json(payload)}
    )
    on conflict (creator_id, week_start) do nothing
    returning id
  `;
  const weeklyDigestId = rows[0]?.id;

  if (weeklyDigestId && booleanEnv("GENERATE_AUDIO", false)) {
    await maybeGeneratePodcastAudio({
      creatorId: input.creatorId,
      weeklyDigestId,
      script: payload.podcast_script,
      weekStart,
    });
  }

  return weeklyDigestId ?? null;
}

async function maybeGeneratePodcastAudio(input: {
  creatorId: string;
  weeklyDigestId: string;
  script: string;
  weekStart: string;
}) {
  const sql = getSql();
  const audioConfig = getPodcastAudioConfig();
  if (audioConfig.provider !== "qwen_simple") {
    console.info("[podcast:audio-skipped]", {
      weeklyDigestId: input.weeklyDigestId,
      provider: audioConfig.provider,
      reason: "Use npm run podcasts:generate for segmented voice-designed audio.",
    });
    return null;
  }

  const qwenKey = process.env.QWEN_API_KEY ?? process.env.DASHSCOPE_API_KEY;
  if (!qwenKey || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  const response = await fetch(
    process.env.QWEN_TTS_ENDPOINT ?? "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${qwenKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: audioConfig.ttsModel,
        input: { text: input.script },
      }),
    },
  );

  if (!response.ok) return null;
  const body = Buffer.from(await response.arrayBuffer());
  const storagePath = `podcasts/${input.creatorId}/${input.weekStart}.bin`;
  const publicUrl = await uploadGeneratedAsset({
    path: storagePath,
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
    body,
  });
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
      ${input.creatorId},
      ${input.weeklyDigestId},
      'podcast_audio',
      'qwen',
      ${audioConfig.ttsModel},
      ${input.script.slice(0, 2000)},
      ${storagePath},
      ${publicUrl}
    )
    returning id
  `;
  await sql`
    update weekly_digests
    set podcast_audio_asset_id = ${assets[0].id}, updated_at = now()
    where id = ${input.weeklyDigestId}
  `;
  return assets[0].id;
}
