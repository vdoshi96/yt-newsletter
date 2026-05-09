export type WeeklyRange = {
  weekStart: string;
  weekEnd: string;
};

export function getSundayToSaturdayWeekRange(isoDate: string | Date): WeeklyRange {
  const date = isoDate instanceof Date ? isoDate : new Date(isoDate);
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return {
    weekStart: toDateString(start),
    weekEnd: toDateString(end),
  };
}

export function isWeeklyDigestReady(range: WeeklyRange, now = new Date()) {
  const today = toDateString(now);
  return range.weekEnd <= today;
}

export function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}
