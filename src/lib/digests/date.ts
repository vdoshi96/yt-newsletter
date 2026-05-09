export function digestDateFromPublishedAt(
  publishedAt: string | Date | null | undefined,
  fallback = new Date(),
) {
  const date =
    publishedAt instanceof Date
      ? publishedAt
      : publishedAt
        ? new Date(publishedAt)
        : fallback;

  if (Number.isNaN(date.getTime())) {
    return fallback.toISOString().slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
}
