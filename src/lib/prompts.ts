import { readFile } from "node:fs/promises";
import path from "node:path";

export async function loadPrompt(name: string) {
  const promptPath = path.join(process.cwd(), "prompts", `${name}.md`);
  return readFile(promptPath, "utf8");
}
