import { describe, expect, it } from "vitest";
import { isGroundedDailyDigestRow, isFinalWeeklyDigestRow } from "../src/lib/digests/rendering";

describe("digest rendering safeguards", () => {
  it("blocks legacy daily rows from final rendering when transcript grounding is missing", () => {
    expect(
      isGroundedDailyDigestRow({
        grounding_status: null,
        transcript_source: null,
        transcript_length: null,
        generation_model: null,
        generated_at: null,
        full_digest_json: {
          transcript_grounding: {
            transcript_source: "legacy_digest_unverified",
            transcript_length: 0,
            video_id: "unknown",
            generation_timestamp: "unknown",
            key_excerpts: [],
          },
        },
      }),
    ).toBe(false);
  });

  it("allows final daily rendering only for generated transcript-grounded rows", () => {
    expect(
      isGroundedDailyDigestRow({
        grounding_status: "grounded",
        transcript_source: "youtube_transcript_free",
        transcript_length: 2400,
        generation_model: "deepseek:deepseek-chat",
        generated_at: "2026-05-10T00:00:00.000Z",
        full_digest_json: {},
      }),
    ).toBe(true);
  });

  it("blocks weekly baseline placeholders from final article rendering", () => {
    expect(
      isFinalWeeklyDigestRow({
        grounding_status: "pending",
        source_digest_count: 0,
        generation_model: null,
        generated_at: null,
        full_digest_json: {
          baseline_placeholder: true,
        },
      }),
    ).toBe(false);
  });
});
