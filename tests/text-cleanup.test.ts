import { describe, expect, it } from "vitest";
import {
  cleanNewsletterMarkdownArtifacts,
  cleanSkepticismNote,
} from "../src/lib/digests/text-cleanup";

describe("digest text cleanup", () => {
  it("removes the unwanted AI-derived transcript wording from skepticism notes", () => {
    const cleaned = cleanSkepticismNote(
      "The video is based on AI-derived notes from a YouTube transcript, so verify details.",
    );

    expect(cleaned).not.toMatch(/AI-derived notes from (a )?YouTube transcript/i);
    expect(cleaned).toContain("verify details");
  });

  it("strips stray markdown fences and separators from weekly brief output", () => {
    expect(
      cleanNewsletterMarkdownArtifacts("# Weekly brief\n\nUseful recap.\n\n```markdown\n---"),
    ).toBe("# Weekly brief\n\nUseful recap.");
  });
});
