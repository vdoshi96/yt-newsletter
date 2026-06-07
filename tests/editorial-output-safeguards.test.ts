import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readRepoFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("editorial output safeguards", () => {
  it("removes the redundant CS background panel from daily rendering", () => {
    const renderer = readRepoFile("src/components/digest-renderer.tsx");

    expect(renderer).not.toContain("CS Background Levels");
    expect(renderer).toContain("Full Digest By CS / AI Proficiency");
    expect(renderer).toContain("renderProseParagraphs");
  });

  it("keeps transcript grounding display to status, transcript source, and model", () => {
    const renderer = readRepoFile("src/components/digest-renderer.tsx");
    const section = renderer.slice(renderer.indexOf("function TranscriptGrounding"));

    expect(section).toContain("Grounding status");
    expect(section).toContain("Transcript source");
    expect(section).toContain("Model used");
    expect(section).not.toContain("Transcript length");
    expect(section).not.toContain("Video ID");
    expect(section).not.toContain("Transcript captured");
    expect(section).not.toContain("key_excerpts.map");
  });

  it("does not render weekly post cards or grounded source notes in the weekly article", () => {
    const weeklyPage = readRepoFile("src/app/app/weekly/page.tsx");

    expect(weeklyPage).not.toContain("Posts, videos, guides, and how-to");
    expect(weeklyPage).not.toContain("Grounded source notes");
    expect(weeklyPage).not.toContain("parsed.weekly_posts.map");
    expect(weeklyPage).not.toContain("parsed.source_notes.map");
  });

  it("keeps the retired podcast page out of the app nav", () => {
    const nav = readRepoFile("src/components/app-nav.tsx");

    expect(nav).not.toContain("Headphones");
    expect(nav).not.toContain("/app/podcasts");
  });
});
