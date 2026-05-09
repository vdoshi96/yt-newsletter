import { describe, expect, it } from "vitest";
import { parseYouTubeInput } from "../src/lib/youtube/parse";

describe("parseYouTubeInput", () => {
  it("recognizes YouTube handle URLs", () => {
    expect(parseYouTubeInput("https://www.youtube.com/@NateBJones")).toEqual({
      kind: "handle",
      value: "NateBJones",
      canonicalUrl: "https://www.youtube.com/@NateBJones",
    });
  });

  it("recognizes channel, custom, user, and video URLs", () => {
    expect(parseYouTubeInput("https://youtube.com/channel/UCabc123")).toMatchObject({
      kind: "channel_id",
      value: "UCabc123",
    });
    expect(parseYouTubeInput("https://youtube.com/c/SomeCreator")).toMatchObject({
      kind: "custom",
      value: "SomeCreator",
    });
    expect(parseYouTubeInput("https://youtube.com/user/legacy-name")).toMatchObject({
      kind: "user",
      value: "legacy-name",
    });
    expect(parseYouTubeInput("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toMatchObject({
      kind: "video",
      value: "dQw4w9WgXcQ",
    });
  });

  it("rejects unsupported hosts and empty input", () => {
    expect(() => parseYouTubeInput("")).toThrow(/YouTube URL/);
    expect(() => parseYouTubeInput("https://example.com/@NateBJones")).toThrow(/YouTube/);
  });
});
