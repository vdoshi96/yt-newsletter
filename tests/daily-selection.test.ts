import { describe, expect, it } from "vitest";
import {
  getDailyVideoPickerState,
  selectDailyDigestForDate,
} from "../src/lib/digests/selection";

describe("daily video picker state", () => {
  const digests = [
    { id: "a", video_id: "v1", digest_date: "2026-05-01", video_title: "Morning upload" },
    { id: "b", video_id: "v2", digest_date: "2026-05-01", video_title: "Evening upload" },
    { id: "c", video_id: "v3", digest_date: "2026-05-02", video_title: "Solo upload" },
  ];

  it("shows a picker when a creator has multiple digests on a date", () => {
    const state = getDailyVideoPickerState(digests, "2026-05-01");

    expect(state.shouldShowVideoPicker).toBe(true);
    expect(state.options).toHaveLength(2);
  });

  it("hides the picker for one or zero digests", () => {
    expect(getDailyVideoPickerState(digests, "2026-05-02").shouldShowVideoPicker).toBe(false);
    expect(getDailyVideoPickerState(digests, "2026-05-03").shouldShowVideoPicker).toBe(false);
  });

  it("defaults to a final digest when pending rows share the same date", () => {
    const rows = [
      { id: "pending", video_id: "short", digest_date: "2026-05-04", video_title: "Short" },
      { id: "final", video_id: "main", digest_date: "2026-05-04", video_title: "Main" },
    ];

    expect(
      selectDailyDigestForDate(rows, "2026-05-04", undefined, (digest) => digest.id === "final")
        ?.id,
    ).toBe("final");
  });

  it("honors an explicitly selected video even when it is not final", () => {
    const rows = [
      { id: "pending", video_id: "short", digest_date: "2026-05-04", video_title: "Short" },
      { id: "final", video_id: "main", digest_date: "2026-05-04", video_title: "Main" },
    ];

    expect(
      selectDailyDigestForDate(rows, "2026-05-04", "short", (digest) => digest.id === "final")
        ?.id,
    ).toBe("pending");
  });
});
