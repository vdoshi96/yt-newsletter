import { afterEach, describe, expect, it } from "vitest";
import { getCatalogFirstWeeklyStart, getCatalogStartDate } from "../src/lib/catalog";

const originalCatalogStartDate = process.env.CATALOG_START_DATE;

afterEach(() => {
  if (originalCatalogStartDate === undefined) {
    delete process.env.CATALOG_START_DATE;
  } else {
    process.env.CATALOG_START_DATE = originalCatalogStartDate;
  }
});

describe("catalog boundary", () => {
  it("defaults the daily catalog to March 1, 2026", () => {
    delete process.env.CATALOG_START_DATE;

    expect(getCatalogStartDate()).toBe("2026-03-01");
  });

  it("starts weekly catalog selection at the Saturday window containing the catalog start", () => {
    process.env.CATALOG_START_DATE = "2026-03-01";

    expect(getCatalogFirstWeeklyStart()).toBe("2026-02-28");
  });
});
