// Pure predicate that mirrors the new dequeue clauses in `processIngestQueue`.
// The processor uses SQL to filter rows, but the same logic is unit-tested
// here so that future changes to retry timing stay in sync with the SQL.

export type RetryableItemState = {
  status: string;
  retryCount: number;
  startedAt: Date | null;
  nextRetryAt: Date | null;
  completedAt?: Date | null;
};

export type WaitingTranscriptState = {
  status: string;
  retryCount: number;
  nextRetryAt: Date | null;
  transcriptRetryAfter: Date | null;
  transcriptUpdatedAt: Date | null;
  completedAt?: Date | null;
};

export function shouldRetryItem(
  item: RetryableItemState,
  now: Date,
  maxAttempts: number,
  delaySeconds: number,
): boolean {
  if (item.retryCount >= maxAttempts) {
    return false;
  }

  if (item.status === "failed") {
    if (item.completedAt) {
      return false;
    }
    if (item.nextRetryAt === null) {
      return true;
    }
    return item.nextRetryAt.getTime() <= now.getTime();
  }

  if (item.status === "processing") {
    if (item.startedAt === null) {
      return false;
    }
    const stuckThresholdMs = now.getTime() - delaySeconds * 1000;
    return item.startedAt.getTime() < stuckThresholdMs;
  }

  return false;
}

export function shouldRetryWaitingTranscript(
  item: WaitingTranscriptState,
  now: Date,
  maxAttempts: number,
  delaySeconds: number,
) {
  if (item.status !== "waiting_for_transcript") {
    return false;
  }
  if (item.completedAt) {
    return false;
  }
  if (item.retryCount >= maxAttempts) {
    return false;
  }

  if (item.nextRetryAt) {
    return item.nextRetryAt.getTime() <= now.getTime();
  }

  if (item.transcriptRetryAfter && item.transcriptRetryAfter.getTime() <= now.getTime()) {
    return true;
  }

  if (item.transcriptUpdatedAt) {
    const retryThresholdMs = now.getTime() - delaySeconds * 1000;
    return item.transcriptUpdatedAt.getTime() <= retryThresholdMs;
  }

  return true;
}
