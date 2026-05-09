import { describe, expect, it } from "vitest";
import { buildDailyFollowUp } from "../src/lib/digests/follow-up";

describe("daily follow-up continuity", () => {
  it("connects today's digest to yesterday's digest when yesterday exists", () => {
    const followUp = buildDailyFollowUp({
      current: {
        digestDate: "2026-05-08",
        title: "271 Vulnerabilities: What Mozilla's AI Found Changes Everything",
        frontPageSummary: "AI-assisted security work found many real Firefox bugs.",
      },
      previous: [
        {
          digestDate: "2026-05-07",
          title: "OpenClaw Grows Up",
          frontPageSummary: "Agent frameworks can now swap models and tools.",
          whyItMatters: "Flexible agents are useful, but they need controls.",
        },
      ],
    });

    expect(followUp).toContain("Yesterday's edition covered OpenClaw Grows Up");
    expect(followUp).toContain("Today's edition");
    expect(followUp).toContain("controls");
  });

  it("summarizes multiple yesterday digests together", () => {
    const followUp = buildDailyFollowUp({
      current: {
        digestDate: "2026-05-08",
        title: "Mozilla security findings",
        frontPageSummary: "AI security tools found real vulnerabilities.",
      },
      previous: [
        {
          digestDate: "2026-05-07",
          title: "Agent tools",
          frontPageSummary: "Agents need permission boundaries.",
          whyItMatters: "Permissions prevent unsafe actions.",
        },
        {
          digestDate: "2026-05-07",
          title: "Model swapping",
          frontPageSummary: "Agent frameworks can switch models.",
          whyItMatters: "Model choice affects reliability and cost.",
        },
      ],
    });

    expect(followUp).toContain("Yesterday had 2 editions");
    expect(followUp).toContain("Agent tools");
    expect(followUp).toContain("Model swapping");
  });

  it("does not pretend an older prior digest happened yesterday", () => {
    const followUp = buildDailyFollowUp({
      current: {
        digestDate: "2026-05-08",
        title: "Mozilla security findings",
        frontPageSummary: "AI security tools found real vulnerabilities.",
      },
      previous: [
        {
          digestDate: "2026-05-05",
          title: "Build Your First Website",
          frontPageSummary: "A beginner guide to HTML and CSS.",
          whyItMatters: "Basic web literacy makes AI tools less mysterious.",
        },
      ],
    });

    expect(followUp).toContain("No digest was stored yesterday");
    expect(followUp).toContain("latest prior edition was 2026-05-05");
  });
});
