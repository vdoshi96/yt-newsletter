export type IngestCandidate = {
  videoId: string;
  hasDailyDigest: boolean;
  hasOpenIngestItem: boolean;
};

export const OPEN_INGEST_ITEM_STATUSES = [
  "queued",
  "processing",
  "waiting_for_transcript",
  "generating_digest",
  "generating_assets",
] as const;

export function selectVideoIdsNeedingIngestion(candidates: IngestCandidate[]) {
  const selected = new Set<string>();

  for (const candidate of candidates) {
    if (candidate.hasDailyDigest || candidate.hasOpenIngestItem) continue;
    selected.add(candidate.videoId);
  }

  return [...selected];
}
