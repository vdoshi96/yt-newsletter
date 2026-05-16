import { describe, expect, it } from "vitest";
import {
  shouldRetryWaitingTranscript,
  shouldRetryItem,
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

  it("does not recover a stuck processing item that has exhausted its attempts", () => {
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

  it("stops retrying transcript waits after the transcript attempt budget is exhausted", () => {
    const item = makeWaitingTranscript({
      retryCount: 48,
      transcriptRetryAfter: new Date(NOW.getTime() - 60 * 1000),
    });

    expect(shouldRetryWaitingTranscript(item, NOW, 48, DELAY_SECONDS)).toBe(false);
  });

  it("does not retry a terminal completed transcript wait", () => {
    const item = makeWaitingTranscript({
      completedAt: new Date(NOW.getTime() - 60 * 1000),
      transcriptUpdatedAt: new Date(NOW.getTime() - 6 * 3600 * 1000),
    });

    expect(shouldRetryWaitingTranscript(item, NOW, 48, DELAY_SECONDS)).toBe(false);
  });
});
