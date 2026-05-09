export const BASELINE_WEEK_COUNT = 4;
export const BASELINE_DAYS = BASELINE_WEEK_COUNT * 7;

export type BaselineWeekWindow = {
  weekStart: string;
  weekEnd: string;
};

export function getPastMonthBaselineWindow(now = new Date()) {
  const end = utcDateOnly(now);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (BASELINE_DAYS - 1));

  const windows: BaselineWeekWindow[] = [];
  for (let index = 0; index < BASELINE_WEEK_COUNT; index += 1) {
    const weekStart = new Date(start);
    weekStart.setUTCDate(start.getUTCDate() + index * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
    windows.push({
      weekStart: toDateString(weekStart),
      weekEnd: toDateString(weekEnd),
    });
  }

  const startInclusive = new Date(`${toDateString(start)}T00:00:00.000Z`);
  const endInclusive = new Date(`${toDateString(end)}T23:59:59.999Z`);

  return {
    weekCount: BASELINE_WEEK_COUNT,
    startDate: toDateString(start),
    endDate: toDateString(end),
    sinceIso: startInclusive.toISOString(),
    untilIso: endInclusive.toISOString(),
    windows,
    includesPublishedAt(publishedAt: string | null | undefined) {
      if (!publishedAt) return false;
      const date = new Date(publishedAt);
      return date >= startInclusive && date <= endInclusive;
    },
  };
}

function utcDateOnly(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}
