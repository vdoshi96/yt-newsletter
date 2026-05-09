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
