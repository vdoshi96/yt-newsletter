import { generateWeeklyDigestPayload } from "@/lib/ai";
import { booleanEnv } from "@/lib/config";
import { getSql } from "@/lib/db";
import { loadPrompt } from "@/lib/prompts";
import { uploadGeneratedAsset } from "@/lib/supabase/storage";

export async function ensureWeeklyDigestForVideoWeek(input: {
  creatorId: string;
  publishedAt: string | null;
}) {
  if (!input.publishedAt) return null;
  const { weekStart, weekEnd } = getWeekRange(input.publishedAt);
  const sql = getSql();
  const existing = await sql<{ id: string }[]>`
    select id
    from weekly_digests
    where creator_id = ${input.creatorId}
      and week_start = ${weekStart}
    limit 1
  `;
  if (existing[0]) return existing[0].id;

  const daily = await sql<
    Array<{
      title: string;
      front_page_summary: string;
      plain_english_explanation: string;
      why_it_matters: string;
      digest_date: string;
    }>
  >`
    select title, front_page_summary, plain_english_explanation, why_it_matters, digest_date::text
    from daily_digests
    where creator_id = ${input.creatorId}
      and digest_date between ${weekStart} and ${weekEnd}
    order by digest_date asc, created_at asc
  `;
  if (!daily.length) return null;

  const prompt = await loadPrompt("weekly_digest");
  const sourceText = daily
    .map(
      (digest) =>
        `Date: ${digest.digest_date}\nTitle: ${digest.title}\nSummary: ${digest.front_page_summary}\nExplanation: ${digest.plain_english_explanation}\nWhy it matters: ${digest.why_it_matters}`,
    )
    .join("\n\n---\n\n");
  const payload = await generateWeeklyDigestPayload({
    creatorId: input.creatorId,
    weekStart,
    weekEnd,
    sourceText,
    prompt,
  });

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
      ${JSON.stringify(payload.ranked_topics)}::jsonb,
      ${payload.what_changed},
      ${JSON.stringify(payload.what_to_do_next)}::jsonb,
      ${payload.podcast_script},
      ${JSON.stringify(payload)}::jsonb
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
        model: process.env.QWEN_TTS_MODEL ?? "cosyvoice-v1",
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
      ${process.env.QWEN_TTS_MODEL ?? "cosyvoice-v1"},
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

function getWeekRange(isoDate: string) {
  const date = new Date(isoDate);
  const day = date.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - diffToMonday);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return {
    weekStart: start.toISOString().slice(0, 10),
    weekEnd: end.toISOString().slice(0, 10),
  };
}
