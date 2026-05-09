import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("logout navigation safety", () => {
  it("does not expose logout as a prefetchable GET link in the app shell", () => {
    const layout = readFileSync(join(process.cwd(), "src/app/app/layout.tsx"), "utf8");

    expect(layout).not.toContain('href="/logout"');
    expect(layout).toContain("logoutAction");
  });

  it("keeps GET /logout non-destructive", () => {
    const route = readFileSync(join(process.cwd(), "src/app/logout/route.ts"), "utf8");

    expect(route).toContain("export async function GET()");
    expect(route).not.toContain("logoutCurrentSession");
  });
});
