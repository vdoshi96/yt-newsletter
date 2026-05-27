import { describe, expect, it } from "vitest";
import {
  getQueueCandidatePriority,
  shouldRetryWaitingTranscript,
  shouldRetryItem,
  type QueueCandidateState,
  type RetryableItemState,
  type WaitingTranscriptState,
} from "../src/lib/ingest/retry";

const MAX_ATTEMPTS = 5;
const DELAY_SECONDS = 3600;
const NOW = new Date("2026-05-13T12:00:00Z");

function makeItem(overrides: Partial<RetryableItemState>): RetryableItemState {
  return {
    status: "failed",
    retryCount: 0,
    startedAt: null,
    nextRetryAt: null,
    completedAt: null,
    ...overrides,
  };
}

describe("shouldRetryItem", () => {
  it("retries a failed item whose nextRetryAt has elapsed", () => {
    const item = makeItem({
      status: "failed",
      retryCount: 3,
      nextRetryAt: new Date(NOW.getTime() - 60 * 1000),
    });

    expect(shouldRetryItem(item, NOW, MAX_ATTEMPTS, DELAY_SECONDS)).toBe(true);
  });

  it("does not retry a failed item that has exhausted its attempts", () => {
    const item = makeItem({
      status: "failed",
      retryCount: 5,
      nextRetryAt: new Date(NOW.getTime() - 60 * 1000),
    });

    expect(shouldRetryItem(item, NOW, MAX_ATTEMPTS, DELAY_SECONDS)).toBe(false);
  });

  it("does not retry a failed item whose nextRetryAt is still in the future", () => {
    const item = makeItem({
      status: "failed",
      retryCount: 1,
      nextRetryAt: new Date(NOW.getTime() + 30 * 60 * 1000),
    });

    expect(shouldRetryItem(item, NOW, MAX_ATTEMPTS, DELAY_SECONDS)).toBe(false);
  });

  it("retries a failed item with retryCount = 0 and no nextRetryAt", () => {
    const item = makeItem({
      status: "failed",
      retryCount: 0,
      nextRetryAt: null,
    });

    expect(shouldRetryItem(item, NOW, MAX_ATTEMPTS, DELAY_SECONDS)).toBe(true);
  });

  it("does not retry a terminal failed item with completedAt set", () => {
    const item = makeItem({
      status: "failed",
      retryCount: 0,
      nextRetryAt: null,
      completedAt: new Date(NOW.getTime() - 60 * 1000),
    });

    expect(shouldRetryItem(item, NOW, MAX_ATTEMPTS, DELAY_SECONDS)).toBe(false);
  });

  it("recovers a processing item that has been stuck for more than the delay window", () => {
    const item = makeItem({
      status: "processing",
      retryCount: 0,
      startedAt: new Date(NOW.getTime() - (DELAY_SECONDS + 60) * 1000),
    });

    expect(shouldRetryItem(item, NOW, MAX_ATTEMPTS, DELAY_SECONDS)).toBe(true);
  });

  it("does not recover a processing item that started recently", () => {
    const item = makeItem({
      status: "processing",
      retryCount: 0,
      startedAt: new Date(NOW.getTime() - 5 * 60 * 1000),
    });

    expect(shouldRetryItem(item, NOW, MAX_ATTEMPTS, DELAY_SECONDS)).toBe(false);
  });

  it("does not recover a stale processing item once it has reached the retry budget", () => {
    const item = makeItem({
      status: "processing",
      retryCount: 5,
      startedAt: new Date(NOW.getTime() - 6 * 3600 * 1000),
    });

    expect(shouldRetryItem(item, NOW, MAX_ATTEMPTS, DELAY_SECONDS)).toBe(false);
  });
});

function makeWaitingTranscript(
  overrides: Partial<WaitingTranscriptState>,
): WaitingTranscriptState {
  return {
    status: "waiting_for_transcript",
    retryCount: 0,
    completedTranscriptAvailable: false,
    nextRetryAt: null,
    transcriptRetryAfter: null,
    transcriptUpdatedAt: null,
    completedAt: null,
    ...overrides,
  };
}

describe("shouldRetryWaitingTranscript", () => {
  it("recovers legacy 24-hour transcript waits once the shorter retry window has elapsed", () => {
    const item = makeWaitingTranscript({
      nextRetryAt: null,
      transcriptRetryAfter: new Date(NOW.getTime() + 20 * 3600 * 1000),
      transcriptUpdatedAt: new Date(NOW.getTime() - (DELAY_SECONDS + 60) * 1000),
    });

    expect(shouldRetryWaitingTranscript(item, NOW, 48, DELAY_SECONDS)).toBe(true);
  });

  it("respects a future item-level transcript retry time", () => {
    const item = makeWaitingTranscript({
      nextRetryAt: new Date(NOW.getTime() + 30 * 60 * 1000),
      transcriptRetryAfter: new Date(NOW.getTime() - 60 * 1000),
      transcriptUpdatedAt: new Date(NOW.getTime() - 6 * 3600 * 1000),
    });

    expect(shouldRetryWaitingTranscript(item, NOW, 48, DELAY_SECONDS)).toBe(false);
  });

  it("retries immediately when a completed transcript exists despite a future retry time", () => {
    const item = makeWaitingTranscript({
      completedTranscriptAvailable: true,
      nextRetryAt: new Date(NOW.getTime() + 30 * 60 * 1000),
      transcriptRetryAfter: null,
      transcriptUpdatedAt: null,
    });

    expect(shouldRetryWaitingTranscript(item, NOW, 48, DELAY_SECONDS)).toBe(true);
  });

  it("continues retrying transcript waits after the hourly attempt budget is exhausted", () => {
    const item = makeWaitingTranscript({
      retryCount: 48,
      transcriptRetryAfter: new Date(NOW.getTime() - 60 * 1000),
    });

    expect(shouldRetryWaitingTranscript(item, NOW, 48, DELAY_SECONDS)).toBe(true);
  });

  it("does not retry a terminal completed transcript wait", () => {
    const item = makeWaitingTranscript({
      completedAt: new Date(NOW.getTime() - 60 * 1000),
      transcriptUpdatedAt: new Date(NOW.getTime() - 6 * 3600 * 1000),
    });

    expect(shouldRetryWaitingTranscript(item, NOW, 48, DELAY_SECONDS)).toBe(false);
  });
});

function makeQueueCandidate(
  overrides: Partial<QueueCandidateState>,
): QueueCandidateState {
  return {
    status: "queued",
    completedTranscriptAvailable: false,
    nextRetryAt: null,
    publishedAt: new Date("2026-05-01T12:00:00Z"),
    ...overrides,
  };
}

describe("getQueueCandidatePriority", () => {
  it("prioritizes waiting rows with completed transcripts ahead of queued backlog", () => {
    const queued = makeQueueCandidate({
      status: "queued",
      publishedAt: new Date("2026-05-26T12:00:00Z"),
    });
    const completedTranscriptWait = makeQueueCandidate({
      status: "waiting_for_transcript",
      completedTranscriptAvailable: true,
      nextRetryAt: new Date(NOW.getTime() + 3600 * 1000),
    });

    expect(getQueueCandidatePriority(completedTranscriptWait, NOW)).toBeLessThan(
      getQueueCandidatePriority(queued, NOW),
    );
  });

  it("prioritizes due transcript retries ahead of queued backlog", () => {
    const queued = makeQueueCandidate({
      status: "queued",
      publishedAt: new Date("2026-05-26T12:00:00Z"),
    });
    const dueTranscriptWait = makeQueueCandidate({
      status: "waiting_for_transcript",
      nextRetryAt: new Date(NOW.getTime() - 60 * 1000),
    });

    expect(getQueueCandidatePriority(dueTranscriptWait, NOW)).toBeLessThan(
      getQueueCandidatePriority(queued, NOW),
    );
  });

  it("does not prioritize future transcript waits ahead of queued work", () => {
    const queued = makeQueueCandidate({ status: "queued" });
    const futureTranscriptWait = makeQueueCandidate({
      status: "waiting_for_transcript",
      nextRetryAt: new Date(NOW.getTime() + 60 * 1000),
    });

    expect(getQueueCandidatePriority(futureTranscriptWait, NOW)).toBeGreaterThan(
      getQueueCandidatePriority(queued, NOW),
    );
  });
});
