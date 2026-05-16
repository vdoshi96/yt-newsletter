export type WeeklyRange = {
  weekStart: string;
  weekEnd: string;
};

export function getSaturdayToFridayWeekRange(isoDate: string | Date): WeeklyRange {
  const date = isoDate instanceof Date ? isoDate : new Date(isoDate);
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const daysSinceSaturday = (start.getUTCDay() + 1) % 7;
  start.setUTCDate(start.getUTCDate() - daysSinceSaturday);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return {
    weekStart: toDateString(start),
    weekEnd: toDateString(end),
  };
}

export const getSundayToSaturdayWeekRange = getSaturdayToFridayWeekRange;

export function isWeeklyDigestReady(range: WeeklyRange, now = new Date()) {
  const today = toDateString(now);
  return today > range.weekEnd;
}

export function isWeeklyPodcastReady(range: WeeklyRange, now = new Date()) {
  const podcastReleaseDate = new Date(`${range.weekEnd}T00:00:00.000Z`);
  podcastReleaseDate.setUTCDate(podcastReleaseDate.getUTCDate() + 2);
  return toDateString(now) >= toDateString(podcastReleaseDate);
}

export function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}
