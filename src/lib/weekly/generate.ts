import { generatePodcastScriptPayload, generateWeeklyDigestPayload } from "@/lib/ai";
import { booleanEnv } from "@/lib/config";
import { getSql } from "@/lib/db";
import { minimumTranscriptCharacters } from "@/lib/digests/grounding";
import { loadPrompt } from "@/lib/prompts";
import {
  buildTwoHostPodcastLines,
  formatTwoHostPodcastScript,
  getPodcastCastForWeek,
} from "@/lib/podcasts/two-host";
import {
  getPodcastAudioConfig,
  getPodcastScriptConfig,
} from "@/lib/podcasts/config";
import { uploadGeneratedAsset } from "@/lib/supabase/storage";
import {
  getSaturdayToFridayWeekRange,
  isWeeklyDigestReady,
  type WeeklyRange,
} from "@/lib/weekly/week-range";
import {
  buildWeeklySourceReferences,
  buildWeeklySourceText,
  type WeeklySourceDigest,
} from "@/lib/weekly/source-text";

export async function ensureWeeklyDigestForVideoWeek(input: {
  creatorId: string;
  publishedAt: string | Date | null;
  now?: Date;
}) {
  if (!input.publishedAt) return null;
  const range = getSaturdayToFridayWeekRange(input.publishedAt);
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
  const minTranscriptCharacters = minimumTranscriptCharacters();
  const rows = await sql<Array<{ digest_date: string }>>`
    select distinct digest_date::text as digest_date
    from daily_digests
    join videos on videos.id = daily_digests.video_id
    where daily_digests.creator_id = ${input.creatorId}
      and daily_digests.grounding_status = 'grounded'
      and daily_digests.transcript_source = 'youtube_transcript_free'
      and coalesce(daily_digests.transcript_length, 0) >= ${minTranscriptCharacters}
      and coalesce(videos.duration_seconds, 0) >= 300
      and lower(coalesce(videos.title, '')) not like '%#shorts%'
      and lower(coalesce(videos.title, '')) not like '% #short %'
    order by daily_digests.digest_date asc
  `;

  const rangesByStart = new Map<string, WeeklyRange>();
  for (const row of rows) {
    const range = getSaturdayToFridayWeekRange(row.digest_date);
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
  const minTranscriptCharacters = minimumTranscriptCharacters();
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
      daily_digests.video_id::text,
      daily_digests.transcript_id::text,
      daily_digests.transcript_source,
      daily_digests.transcript_length,
      daily_digests.title,
      daily_digests.front_page_summary,
      daily_digests.plain_english_explanation,
      daily_digests.full_digest_json,
      daily_digests.why_it_matters,
      daily_digests.digest_date::text
    from daily_digests
    join videos on videos.id = daily_digests.video_id
    where daily_digests.creator_id = ${input.creatorId}
      and daily_digests.digest_date between ${weekStart} and ${weekEnd}
      and daily_digests.grounding_status = 'grounded'
      and daily_digests.transcript_source = 'youtube_transcript_free'
      and coalesce(daily_digests.transcript_length, 0) >= ${minTranscriptCharacters}
      and coalesce(videos.duration_seconds, 0) >= 300
      and lower(coalesce(videos.title, '')) not like '%#shorts%'
      and lower(coalesce(videos.title, '')) not like '% #short %'
    order by daily_digests.digest_date asc, daily_digests.created_at asc
  `;
  if (!daily.length) return existing[0]?.id ?? null;

  const prompt = await loadPrompt("weekly_digest");
  const sourceText = buildWeeklySourceText(daily);
  const sourceReferences = buildWeeklySourceReferences(daily);
  const generatedPayload = await generateWeeklyDigestPayload({
    creatorId: input.creatorId,
    weekStart,
    weekEnd,
    sourceText,
    prompt,
    sourceDigestCount: daily.length,
  });
  const cast = getPodcastCastForWeek(weekStart);
  const scriptConfig = getPodcastScriptConfig();
  const fallbackPodcastScript = formatTwoHostPodcastScript(
    buildTwoHostPodcastLines(generatedPayload, scriptConfig, cast),
  );
  const podcastPrompt = await loadPrompt("podcast_script");
  let podcastScript = fallbackPodcastScript;
  let providerPodcastGeneration: Record<string, unknown> = {
    status: "script_generated",
    provider: "local",
    model: "deterministic:two-host-builder",
    generated_at: new Date().toISOString(),
  };
  if (scriptConfig.generationMode === "provider_script") {
    try {
      const providerScript = await generatePodcastScriptPayload({
        creatorId: input.creatorId,
        weekStart,
        weekEnd,
        weeklyDigest: generatedPayload,
        sourceText,
        prompt: podcastPrompt,
        hostNames: cast.label,
      });
      podcastScript = providerScript.podcast_script;
      providerPodcastGeneration = providerScript.podcast_generation;
    } catch (error) {
      console.warn("[podcast:provider-script-fallback]", {
        creatorId: input.creatorId,
        weekStart,
        message: (error as Error).message,
      });
    }
  }
  const payload = {
    ...generatedPayload,
    source_references: sourceReferences,
    podcast_script: podcastScript,
    podcast_generation: {
      ...generatedPayload.podcast_generation,
      ...providerPodcastGeneration,
      target_minutes: scriptConfig.targetMinutes,
      words_per_minute: scriptConfig.wordsPerMinute,
      word_count: countWords(podcastScript),
      cast_id: cast.id,
      source_references: sourceReferences,
    },
  };
  const weeklyGrounding = payload.weekly_grounding;

  if (existing[0]) {
    await sql`
      update weekly_digests
      set
        week_end = ${weekEnd},
        source_digest_count = ${weeklyGrounding.source_digest_count},
        source_date_range = ${sql.json(toJsonParameter(weeklyGrounding.source_date_range ?? { start: weekStart, end: weekEnd }))},
        grounding_status = ${weeklyGrounding.grounded ? "grounded" : "pending"},
        generation_model = ${weeklyGrounding.generation_model ?? null},
        generated_at = ${weeklyGrounding.generated_at ?? null},
        processing_status = 'digest_generated',
        podcast_audio_asset_id = null,
        podcast_status = 'pending',
        podcast_generation_metadata = ${sql.json(toJsonParameter(payload.podcast_generation))},
        podcast_generated_at = null,
        podcast_model = null,
        podcast_voice_config = null,
        source_references = ${sql.json(toJsonParameter(sourceReferences))},
        title = ${payload.title},
        newsletter_markdown = ${payload.newsletter_markdown},
        ranked_topics = ${sql.json(toJsonParameter(payload.ranked_topics))},
        what_changed = ${payload.what_changed},
        what_to_do_next = ${sql.json(toJsonParameter(payload.what_to_do_next))},
        podcast_script = ${payload.podcast_script},
        full_digest_json = ${sql.json(toJsonParameter(payload))},
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
      source_digest_count,
      source_date_range,
      grounding_status,
      generation_model,
      generated_at,
      processing_status,
      podcast_status,
      podcast_generation_metadata,
      source_references,
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
      ${weeklyGrounding.source_digest_count},
      ${sql.json(toJsonParameter(weeklyGrounding.source_date_range ?? { start: weekStart, end: weekEnd }))},
      ${weeklyGrounding.grounded ? "grounded" : "pending"},
      ${weeklyGrounding.generation_model ?? null},
      ${weeklyGrounding.generated_at ?? null},
      'digest_generated',
      'pending',
      ${sql.json(toJsonParameter(payload.podcast_generation))},
      ${sql.json(toJsonParameter(sourceReferences))},
      ${payload.title},
      ${payload.newsletter_markdown},
      ${sql.json(toJsonParameter(payload.ranked_topics))},
      ${payload.what_changed},
      ${sql.json(toJsonParameter(payload.what_to_do_next))},
      ${payload.podcast_script},
      ${sql.json(toJsonParameter(payload))}
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
      reason: "Use npm run podcasts:generate for full two-host podcast audio.",
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
    on conflict (storage_path) do update set
      creator_id = excluded.creator_id,
      weekly_digest_id = excluded.weekly_digest_id,
      asset_type = excluded.asset_type,
      provider = excluded.provider,
      model = excluded.model,
      prompt = excluded.prompt,
      public_url = excluded.public_url,
      created_at = now()
    returning id
  `;
  await sql`
    update weekly_digests
    set podcast_audio_asset_id = ${assets[0].id}, updated_at = now()
    where id = ${input.weeklyDigestId}
  `;
  return assets[0].id;
}

function countWords(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

function toJsonParameter(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}
