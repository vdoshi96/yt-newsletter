import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("ingestion idempotency SQL safeguards", () => {
  it("keeps one transcript row per video/source and upserts transcript fetch results", () => {
    const migration = readFileSync(
      join(process.cwd(), "supabase/migrations/001_initial_schema.sql"),
      "utf8",
    );
    const processor = readFileSync(join(process.cwd(), "src/lib/processor.ts"), "utf8");

    expect(migration).toContain("transcripts_video_source_unique");
    expect(processor).toMatch(/on conflict \(video_id, source\) do update/i);
  });

  it("claims queue items atomically before processing them", () => {
    const processor = readFileSync(join(process.cwd(), "src/lib/processor.ts"), "utf8");

    expect(processor).toMatch(/for update[\s\S]+skip locked/i);
    expect(processor).toMatch(/update ingest_job_items[\s\S]+returning/i);
  });

  it("prioritizes due transcript retries before stale queued backlog", () => {
    const processor = readFileSync(join(process.cwd(), "src/lib/processor.ts"), "utf8");

    expect(processor).toMatch(/when ingest_job_items\.status = 'waiting_for_transcript'[\s\S]+transcripts\.status = 'completed'[\s\S]+then 0/i);
    expect(processor).toMatch(/when ingest_job_items\.status = 'waiting_for_transcript'[\s\S]+next_retry_at <= now\(\)[\s\S]+then 0/i);
    expect(processor).toMatch(/when ingest_job_items\.status = 'queued' then 2/i);
    expect(processor).toMatch(/status in \('waiting_for_transcript', 'queued'\)[\s\S]+videos\.published_at[\s\S]+desc nulls last/i);
  });

  it("prevents more than one open ingest item per video", () => {
    const migration = readFileSync(
      join(process.cwd(), "supabase/migrations/001_initial_schema.sql"),
      "utf8",
    );
    const creator = readFileSync(join(process.cwd(), "src/lib/creators.ts"), "utf8");

    expect(migration).toContain("ingest_job_items_one_open_item_per_video_idx");
    expect(migration).toMatch(/create unique index[\s\S]+on ingest_job_items \(video_id\)[\s\S]+where completed_at is null[\s\S]+status in/i);
    expect(creator).toMatch(/on conflict \(video_id\) where completed_at is null[\s\S]+do nothing/i);
  });

  it("does not reuse ungrounded existing daily digests during backfill", () => {
    const processor = readFileSync(join(process.cwd(), "src/lib/processor.ts"), "utf8");

    expect(processor).toContain("isGroundedDailyDigestRow");
    expect(processor).toContain("daily-digest-existing-not-grounded");
    expect(processor).toMatch(/existing\[0\][\s\S]+isGroundedDailyDigestRow/i);
  });

  it("does not let failed daily digest rows suppress future discovery retries", () => {
    const processor = readFileSync(join(process.cwd(), "src/lib/processor.ts"), "utf8");

    expect(processor).toMatch(/exists\([\s\S]+from daily_digests[\s\S]+grounding_status = 'grounded'[\s\S]+processing_status = 'digest_generated'[\s\S]+\) as has_daily_digest/i);
  });

  it("reconciles waiting transcript rows when a completed transcript exists", () => {
    const processor = readFileSync(join(process.cwd(), "src/lib/processor.ts"), "utf8");

    expect(processor).toMatch(/transcripts\.status = 'completed'[\s\S]+transcripts\.needs_retry = true/i);
    expect(processor).toContain("queue-scan-candidates");
  });

  it("keeps the scraper first and gates managed transcript fallback by scraper miss age", () => {
    const processor = readFileSync(join(process.cwd(), "src/lib/processor.ts"), "utf8");
    const transcripts = readFileSync(join(process.cwd(), "src/lib/youtube/transcripts.ts"), "utf8");

    expect(processor).toContain("TRANSCRIPT_API_FALLBACK_AFTER_HOURS");
    expect(processor).toContain("shouldUseManagedTranscriptFallback");
    expect(processor).toContain("scraper_missing_since");
    expect(transcripts).toContain("allowManagedFallback");
    expect(transcripts).toContain("fetchTranscriptApiTranscript");
  });

  it("ships a dry-run-first recovery command for wedged transcript rows", () => {
    const packageJson = readFileSync(join(process.cwd(), "package.json"), "utf8");
    const script = readFileSync(join(process.cwd(), "scripts/recover-ingest-transcripts.ts"), "utf8");

    expect(packageJson).toContain('"ingest:recover"');
    expect(script).toContain("const apply = args.has(\"apply\")");
    expect(script).toContain("Dry run");
    expect(script).toContain("waitingWithCompletedTranscript");
    expect(script).toContain("terminalFailedFetchableTranscript");
    expect(script).toContain("nonGroundedDailyRows");
  });

  it("reports and collapses duplicate open ingest rows during recovery", () => {
    const script = readFileSync(join(process.cwd(), "scripts/recover-ingest-transcripts.ts"), "utf8");

    expect(script).toContain("duplicateOpenIngestRows");
    expect(script).toContain("collapseDuplicateOpenIngestRows");
    expect(script).toContain("duplicate_open_ingest_collapsed");
  });

  it("uses bounded concurrency for batch daily and weekly generation", () => {
    const processor = readFileSync(join(process.cwd(), "src/lib/processor.ts"), "utf8");
    const weekly = readFileSync(join(process.cwd(), "src/lib/weekly/generate.ts"), "utf8");

    expect(processor).toContain("INGEST_PROCESS_CONCURRENCY");
    expect(processor).toContain("runBoundedConcurrency(items");
    expect(weekly).toContain("WEEKLY_DIGEST_CONCURRENCY");
    expect(weekly).toContain("runBoundedConcurrency(ranges");
  });

  it("marks non-grounded daily placeholders failed when digest generation fails", () => {
    const processor = readFileSync(join(process.cwd(), "src/lib/processor.ts"), "utf8");

    expect(processor).toMatch(/update daily_digests[\s\S]+grounding_status = 'failed'/i);
    expect(processor).toMatch(/where video_id = \$\{item\.video_id\}[\s\S]+grounding_status <> 'grounded'/i);
  });

  it("requires canonical grounded status before skipping a daily digest", () => {
    const script = readFileSync(join(process.cwd(), "scripts/backfill-grounded-catalog.ts"), "utf8");

    const groundedStatusChecks = script.match(/daily_digests\.grounding_status = 'grounded'/g) ?? [];
    expect(groundedStatusChecks.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps the weekly podcast pipeline retired", () => {
    const packageJson = readFileSync(join(process.cwd(), "package.json"), "utf8");
    const vercel = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
    const weekly = readFileSync(join(process.cwd(), "src/lib/weekly/generate.ts"), "utf8");

    expect(packageJson).not.toContain("podcasts:generate");
    expect(vercel).not.toContain("generate-weekly-podcast");
    expect(weekly).not.toContain("generatePodcastScriptPayload");
  });
});
