import { getSundayToSaturdayWeekRange } from "./week-range";

export function getCurrentSundayWeekStart(now = new Date()) {
  return getSundayToSaturdayWeekRange(now).weekStart;
}

export function resolveSelectedWeekStart(
  selected: string | undefined,
  availableWeekStarts: string[],
  now = new Date(),
) {
  if (selected) {
    return getSundayToSaturdayWeekRange(selected).weekStart;
  }

  return [...availableWeekStarts].sort().at(-1) ?? getCurrentSundayWeekStart(now);
}
