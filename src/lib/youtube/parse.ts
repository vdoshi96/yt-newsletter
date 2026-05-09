export type ParsedYouTubeInput =
  | { kind: "handle"; value: string; canonicalUrl: string }
  | { kind: "channel_id"; value: string; canonicalUrl: string }
  | { kind: "custom"; value: string; canonicalUrl: string }
  | { kind: "user"; value: string; canonicalUrl: string }
  | { kind: "video"; value: string; canonicalUrl: string };

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

export function parseYouTubeInput(input: string): ParsedYouTubeInput {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Paste a YouTube URL.");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    if (trimmed.startsWith("@")) {
      const handle = trimmed.slice(1);
      return {
        kind: "handle",
        value: handle,
        canonicalUrl: `https://www.youtube.com/@${handle}`,
      };
    }
    throw new Error("Paste a valid YouTube URL.");
  }

  if (!YOUTUBE_HOSTS.has(url.hostname)) {
    throw new Error("Only YouTube URLs are supported.");
  }

  if (url.hostname === "youtu.be") {
    const videoId = cleanSegment(url.pathname.slice(1));
    if (!videoId) throw new Error("Could not find a YouTube video id.");
    return {
      kind: "video",
      value: videoId,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }

  const segments = url.pathname.split("/").filter(Boolean).map(cleanSegment);
  const first = segments[0] ?? "";
  const second = segments[1] ?? "";

  if (first.startsWith("@")) {
    const handle = first.slice(1);
    return {
      kind: "handle",
      value: handle,
      canonicalUrl: `https://www.youtube.com/@${handle}`,
    };
  }

  if (first === "channel" && second) {
    return {
      kind: "channel_id",
      value: second,
      canonicalUrl: `https://www.youtube.com/channel/${second}`,
    };
  }

  if (first === "c" && second) {
    return {
      kind: "custom",
      value: second,
      canonicalUrl: `https://www.youtube.com/c/${second}`,
    };
  }

  if (first === "user" && second) {
    return {
      kind: "user",
      value: second,
      canonicalUrl: `https://www.youtube.com/user/${second}`,
    };
  }

  if (first === "watch") {
    const videoId = url.searchParams.get("v")?.trim();
    if (!videoId) throw new Error("Could not find a YouTube video id.");
    return {
      kind: "video",
      value: videoId,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }

  if (first === "shorts" && second) {
    return {
      kind: "video",
      value: second,
      canonicalUrl: `https://www.youtube.com/shorts/${second}`,
    };
  }

  throw new Error("Unsupported YouTube URL form.");
}

function cleanSegment(value: string) {
  return decodeURIComponent(value).replace(/\/+$/, "").trim();
}
