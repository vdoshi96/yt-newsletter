import { getSaturdayToFridayWeekRange } from "./week-range";

export function getCurrentWeeklyWindowStart(now = new Date()) {
  return getSaturdayToFridayWeekRange(now).weekStart;
}

export function resolveSelectedWeekStart(
  selected: string | undefined,
  availableWeekStarts: string[],
  now = new Date(),
) {
  if (selected) {
    return getSaturdayToFridayWeekRange(selected).weekStart;
  }

  return [...availableWeekStarts].sort().at(-1) ?? getCurrentWeeklyWindowStart(now);
}
