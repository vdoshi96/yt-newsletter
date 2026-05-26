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

  it("upserts generated podcast assets by deterministic storage path", () => {
    const migration = readFileSync(
      join(process.cwd(), "supabase/migrations/001_initial_schema.sql"),
      "utf8",
    );
    const script = readFileSync(join(process.cwd(), "scripts/generate-weekly-podcasts.ts"), "utf8");

    expect(migration).toContain("assets_storage_path_unique");
    expect(script).toMatch(/on conflict \(storage_path\) do update/i);
  });

  it("only generates weekly podcasts from finalized grounded weekly digests", () => {
    const script = readFileSync(join(process.cwd(), "scripts/generate-weekly-podcasts.ts"), "utf8");

    expect(script).toContain("grounding_status = 'grounded'");
    expect(script).toContain("processing_status = 'digest_generated'");
    expect(script).toContain("coalesce(source_digest_count, 0) > 0");
  });
});
