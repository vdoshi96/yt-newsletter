import { describe, expect, it } from "vitest";
import { getDailyVideoPickerState } from "../src/lib/digests/selection";

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
});
