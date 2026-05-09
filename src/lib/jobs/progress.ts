export function estimateIngestSeconds(videoCount: number) {
  return 45 + Math.max(0, videoCount) * 90;
}

export function summarizeJobProgress(input: {
  totalCount: number;
  processedCount: number;
  failedCount: number;
  estimatedSeconds: number;
}) {
  const totalCount = Math.max(0, input.totalCount);
  const completedCount = Math.min(
    totalCount,
    Math.max(0, input.processedCount) + Math.max(0, input.failedCount),
  );
  const remainingCount = Math.max(0, totalCount - completedCount);
  const percentComplete =
    totalCount === 0 ? 0 : Math.min(100, Math.round((completedCount / totalCount) * 100));
  const secondsPerItem = totalCount === 0 ? 0 : input.estimatedSeconds / totalCount;

  return {
    completedCount,
    remainingCount,
    percentComplete,
    estimatedSecondsRemaining: Math.round(remainingCount * secondsPerItem),
  };
}
