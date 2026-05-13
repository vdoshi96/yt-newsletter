import { describe, expect, it } from "vitest";
import {
  shouldRetryItem,
  type RetryableItemState,
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
