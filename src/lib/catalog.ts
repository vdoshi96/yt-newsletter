import { getSaturdayToFridayWeekRange } from "./weekly/week-range";

const DEFAULT_CATALOG_START_DATE = "2026-03-01";

export function getCatalogStartDate() {
  return process.env.CATALOG_START_DATE ?? DEFAULT_CATALOG_START_DATE;
}

export function getCatalogFirstWeeklyStart() {
  return getSaturdayToFridayWeekRange(getCatalogStartDate()).weekStart;
}
