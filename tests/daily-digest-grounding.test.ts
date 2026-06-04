import { describe, expect, it } from "vitest";
import {
  assertDailyDigestGrounding,
  buildDailyDigestMessages,
  validateTranscriptForDailyDigest,
} from "../src/lib/digests/grounding";

const transcriptText = [
  "Agents are software loops that plan a task, call tools, inspect results, and repeat.",
  "The creator says production teams should add evals, tracing, and rollback paths before deploying.",
  "A retrieval system can ground model answers by fetching relevant chunks from a trusted source.",
  "Queues help the backend retry failed work without blocking the user interface.",
  "The implementation tradeoff is latency, cost, and observability across the inference pipeline.",
  "The most important warning is to never summarize a source that was not actually retrieved.",
].join("\n");

const validTranscript = {
  id: "transcript-1",
  video_id: "video-1",
  source: "youtube_transcript_free",
  status: "completed",
  transcript_text: transcriptText,
  timed_segments: [{ offset: 12, duration: 8, text: "Agents are software loops that plan a task." }],
  created_at: "2026-05-09T21:30:00.000Z",
  updated_at: "2026-05-09T21:30:00.000Z",
};

describe("daily digest transcript grounding", () => {
  it("fails when transcript is missing", () => {
    expect(() =>
      validateTranscriptForDailyDigest({
        expectedVideoId: "video-1",
        transcript: null,
      }),
    ).toThrow(/verified transcript is required/i);
  });

  it("fails when transcript is too short", () => {
    expect(() =>
      validateTranscriptForDailyDigest({
        expectedVideoId: "video-1",
        minTranscriptCharacters: 500,
        transcript: {
          ...validTranscript,
          transcript_text: "Short transcript.",
        },
      }),
    ).toThrow(/too short/i);
  });

  it("fails when transcript belongs to a different video", () => {
    expect(() =>
      validateTranscriptForDailyDigest({
        expectedVideoId: "video-1",
        transcript: {
          ...validTranscript,
          video_id: "video-2",
        },
      }),
    ).toThrow(/does not match/i);
  });

  it("does not allow derived notes or title-only metadata to stand in for a transcript", () => {
    expect(() =>
      validateTranscriptForDailyDigest({
        expectedVideoId: "video-1",
        transcript: {
          ...validTranscript,
          source: "gemini_video_derived_notes",
          transcript_text: null,
          derived_notes: { title: "You're Wasting 40% Of Your AI Time On Something Fixable" },
        },
      }),
    ).toThrow(/not an allowed verified transcript source/i);

    expect(() =>
      buildDailyDigestMessages({
        prompt: "Return strict JSON.",
        videoId: "video-1",
        transcript: null,
        previousDailyContext: "No prior daily digest is available.",
      }),
    ).toThrow(/verified transcript is required/i);
  });

  it("builds prompts from verified transcript text and excludes title metadata", () => {
    const messages = buildDailyDigestMessages({
      prompt: "Return strict JSON.",
      videoId: "video-1",
      transcript: validTranscript,
      previousDailyContext: "No prior daily digest is available.",
      minTranscriptCharacters: 100,
    });

    const userContent = messages.map((message) => message.content).join("\n");
    expect(userContent).toContain("VERIFIED TRANSCRIPT");
    expect(userContent).toContain("Agents are software loops");
    expect(userContent).not.toContain("VIDEO TITLE");
    expect(userContent).not.toContain("You're Wasting 40% Of Your AI Time");
  });

  it("allows managed TranscriptAPI text as verified transcript source", () => {
    const verified = validateTranscriptForDailyDigest({
      expectedVideoId: "video-1",
      minTranscriptCharacters: 100,
      transcript: {
        ...validTranscript,
        source: "transcriptapi_com",
      },
    });

    expect(verified.source).toBe("transcriptapi_com");
    expect(verified.transcript_character_count).toBe(transcriptText.length);
  });

  it("normalizes stored JSON transcript segments before building anchors", () => {
    const messages = buildDailyDigestMessages({
      prompt: "Return strict JSON.",
      videoId: "video-1",
      transcript: {
        ...validTranscript,
        timed_segments: JSON.stringify(validTranscript.timed_segments),
      },
      previousDailyContext: "No prior daily digest is available.",
      minTranscriptCharacters: 100,
    });

    const userContent = messages.map((message) => message.content).join("\n");
    expect(userContent).toContain("[00:00-00:00] Agents are software loops");
  });

  it("fails generated digests without transcript excerpt grounding", () => {
    expect(() =>
      assertDailyDigestGrounding({
        transcriptText,
        digest: {
          source_notes: [
            {
              note: "No direct source quote.",
            },
          ],
          what_creator_said: ["The creator mostly discussed generic prompt engineering."],
        },
      }),
    ).toThrow(/source note quote/i);
  });

  it("accepts generated digests with quote anchors from the transcript", () => {
    expect(() =>
      assertDailyDigestGrounding({
        transcriptText,
        digest: {
          source_notes: [
            {
              timestamp: "00:12",
              quote: "Agents are software loops that plan a task.",
              note: "The transcript defines the central concept.",
            },
          ],
          what_creator_said: [
            "The creator said agents are software loops that plan a task and call tools.",
          ],
        },
      }),
    ).not.toThrow();
  });
});
