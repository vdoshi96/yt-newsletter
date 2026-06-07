export const PROCESSING_STATUSES = [
  "pending",
  "transcript_missing",
  "transcript_ready",
  "digest_generated",
  "failed",
] as const;

export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

export function isProcessingStatus(value: string | null | undefined): value is ProcessingStatus {
  return PROCESSING_STATUSES.includes(value as ProcessingStatus);
}

export function normalizeProcessingStatus(value: string | null | undefined): ProcessingStatus {
  return isProcessingStatus(value) ? value : "pending";
}

export function processingStatusLabel(status: ProcessingStatus) {
  switch (status) {
    case "pending":
      return "Pending";
    case "transcript_missing":
      return "Transcript missing";
    case "transcript_ready":
      return "Transcript ready";
    case "digest_generated":
      return "Digest generated";
    case "failed":
      return "Failed";
  }
}
