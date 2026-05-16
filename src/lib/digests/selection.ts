export type DailyDigestPickerItem = {
  id: string;
  video_id: string;
  digest_date: string;
  video_title?: string | null;
};

export function getDailyVideoPickerState(
  digests: DailyDigestPickerItem[],
  selectedDate: string,
) {
  const options = digests
    .filter((digest) => digest.digest_date === selectedDate)
    .map((digest) => ({
      digestId: digest.id,
      videoId: digest.video_id,
      label: digest.video_title ?? "Untitled video",
    }));

  return {
    shouldShowVideoPicker: options.length > 1,
    options,
  };
}

export function selectDailyDigestForDate<T extends DailyDigestPickerItem>(
  digests: T[],
  selectedDate: string,
  selectedVideoId?: string,
  isFinalDigest?: (digest: T) => boolean,
) {
  const dateDigests = digests.filter((digest) => digest.digest_date === selectedDate);

  if (selectedVideoId) {
    return dateDigests.find((digest) => digest.video_id === selectedVideoId) ?? null;
  }

  return (isFinalDigest ? dateDigests.find(isFinalDigest) : undefined) ?? dateDigests[0] ?? null;
}
