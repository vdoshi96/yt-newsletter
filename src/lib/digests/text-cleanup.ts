const UNWANTED_SKEPTICISM_PHRASES = [
  /\b(?:this digest|the video|this section)\s+is based on AI-derived notes from (?:a )?YouTube transcript[s]?,?\s*/gi,
  /\bthis digest is based on AI-derived notes from YouTube transcripts,?\s*/gi,
  /\bbased on AI-derived notes from YouTube transcripts,?\s*/gi,
  /\bAI-derived notes from (?:a )?YouTube transcript[s]?\b/gi,
  /\bAI-derived notes from YouTube transcripts\b/gi,
  /\bgemini_video_derived_notes\b/gi,
];

export function cleanSkepticismNote(note: string) {
  let cleaned = note;

  for (const phrase of UNWANTED_SKEPTICISM_PHRASES) {
    cleaned = cleaned.replace(phrase, "partial source material");
  }

  cleaned = cleaned
    .replace(/\bpartial source material\s*not\b/gi, "The source material may be partial and is not")
    .replace(/\bpartial source material\s*so\b/gi, "The source material may be partial, so")
    .replace(/\bpartial source material partial source material\b/gi, "partial source material")
    .replace(/\s+,/g, ",")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return "The source material may be partial, so verify important details before relying on them.";
  }

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function cleanNewsletterMarkdownArtifacts(markdown: string) {
  const lines = markdown
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !/^```(?:markdown|md|json)?\s*$/i.test(line.trim()));

  while (lines.length > 0 && isTrailingArtifact(lines[lines.length - 1])) {
    lines.pop();
  }

  return lines.join("\n").trim();
}

function isTrailingArtifact(line: string) {
  const trimmed = line.trim();
  return trimmed === "" || trimmed === "---" || trimmed === "***" || trimmed === "```";
}
