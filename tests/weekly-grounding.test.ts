import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertWeeklyDigestGrounding,
  buildWeeklySourceReferences,
} from "../src/lib/weekly/source-text";

describe("weekly grounding safeguards", () => {
  const sourceText = [
    "Date: 2026-05-02",
    "Title: Agents need evals",
    "Summary: The creator explained why agent workflows need checks.",
    "Transcript source: youtube_transcript_free",
    "Transcript length: 2400",
    "Transcript quote anchors:",
    "Quote: agents should be evaluated before they run unattended",
  ].join("\n");

  it("rejects weekly source notes that point outside the grounded daily source set", () => {
    expect(() =>
      assertWeeklyDigestGrounding({
        sourceText,
        digest: {
          weekly_posts: [
            {
              date: "2026-05-09",
              title: "Invented launch",
            },
          ],
          source_notes: [
            {
              date: "2026-05-09",
              label: "Invented external story",
              note: "Not in the daily source text.",
            },
          ],
        },
      }),
    ).toThrow(/outside the grounded daily source dates/i);
  });

  it("accepts weekly notes tied to daily dates, titles, and transcript quote anchors", () => {
    expect(() =>
      assertWeeklyDigestGrounding({
        sourceText,
        digest: {
          weekly_posts: [
            {
              date: "2026-05-02",
              title: "Agents need evals",
            },
          ],
          source_notes: [
            {
              date: "2026-05-02",
              label: "Daily digest: Agents need evals",
              note: "Uses the stored daily digest and transcript quote anchor.",
            },
          ],
        },
      }),
    ).not.toThrow();
  });

  it("preserves transcript identifiers and quote anchors for podcast source references", () => {
    const references = buildWeeklySourceReferences([
      {
        digest_date: "2026-05-02",
        title: "Agents need evals",
        front_page_summary: "The creator explained why agent workflows need checks.",
        plain_english_explanation: "Agents need checklists.",
        why_it_matters: "It prevents unsupported automation.",
        video_id: "video-uuid",
        transcript_id: "transcript-uuid",
        full_digest_json: {
          transcript_grounding: {
            transcript_source: "youtube_transcript_free",
            transcript_length: 2400,
            video_id: "video-uuid",
            transcript_id: "transcript-uuid",
            generation_timestamp: "2026-05-10T00:00:00.000Z",
            key_excerpts: [
              {
                timestamp: "00:12",
                quote: "agents should be evaluated before they run unattended",
                note: "Transcript quote.",
              },
            ],
          },
        },
      },
    ]);

    expect(references[0]).toMatchObject({
      date: "2026-05-02",
      label: "Daily digest: Agents need evals",
      video_id: "video-uuid",
      transcript_id: "transcript-uuid",
      transcript_source: "youtube_transcript_free",
      transcript_length: 2400,
    });
    expect(references[0].quotes[0]).toMatchObject({
      timestamp: "00:12",
      quote: "agents should be evaluated before they run unattended",
    });
  });

  it("uses a synthesized fallback instead of concatenating weekly source text", () => {
    const ai = readFileSync(join(process.cwd(), "src/lib/ai/index.ts"), "utf8");

    expect(ai).toContain("buildSourceBackedWeeklyFallback");
    expect(ai).toContain("## Major themes");
    expect(ai).toContain("## Practical takeaways");
    expect(ai).toContain("## Unresolved questions");
    expect(ai).not.toContain("input.sourceText.slice");
  });
});
