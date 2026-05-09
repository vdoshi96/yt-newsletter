import Parser from "rss-parser";
import { parseYouTubeInput, type ParsedYouTubeInput } from "@/lib/youtube/parse";

export type DiscoveredCreator = {
  youtube_channel_id: string | null;
  handle: string | null;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  channel_url: string;
  discovery_mode: "youtube_api" | "rss_fallback";
};

export type DiscoveredVideo = {
  youtube_video_id: string;
  title: string;
  description: string | null;
  url: string;
  thumbnail_url: string | null;
  published_at: string | null;
  duration_seconds: number | null;
};

export type DiscoveryResult = {
  creator: DiscoveredCreator;
  videos: DiscoveredVideo[];
  warning?: string;
};

type YouTubeChannelResponse = {
  items?: Array<{
    id: string;
    snippet?: {
      title?: string;
      description?: string;
      customUrl?: string;
      thumbnails?: Record<string, { url?: string }>;
    };
    contentDetails?: {
      relatedPlaylists?: {
        uploads?: string;
      };
    };
  }>;
};

type PlaylistItemsResponse = {
  items?: Array<{
    snippet?: {
      title?: string;
      description?: string;
      publishedAt?: string;
      resourceId?: {
        videoId?: string;
      };
      thumbnails?: Record<string, { url?: string }>;
    };
  }>;
};

type VideosResponse = {
  items?: Array<{
    id: string;
    snippet?: {
      title?: string;
      description?: string;
      publishedAt?: string;
      channelId?: string;
      channelTitle?: string;
      thumbnails?: Record<string, { url?: string }>;
    };
    contentDetails?: {
      duration?: string;
    };
  }>;
};

export async function discoverCreatorVideos(inputUrl: string, requestedCount: number) {
  const parsed = parseYouTubeInput(inputUrl);
  const count = Math.max(1, Math.min(requestedCount, Number(process.env.MAX_BACKFILL_VIDEOS_PER_JOB ?? 50)));
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (apiKey) {
    return discoverWithYouTubeApi(parsed, count, apiKey);
  }

  return discoverWithRssFallback(parsed, count);
}

async function discoverWithYouTubeApi(
  parsed: ParsedYouTubeInput,
  count: number,
  apiKey: string,
): Promise<DiscoveryResult> {
  const channel = await resolveChannel(parsed, apiKey);
  const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) {
    throw new Error("Could not find the channel uploads playlist.");
  }

  const playlist = await youtubeFetch<PlaylistItemsResponse>("playlistItems", apiKey, {
    part: "snippet",
    playlistId: uploadsPlaylistId,
    maxResults: String(count),
  });

  const ids = (playlist.items ?? [])
    .map((item) => item.snippet?.resourceId?.videoId)
    .filter((id): id is string => Boolean(id));

  const details = ids.length
    ? await youtubeFetch<VideosResponse>("videos", apiKey, {
        part: "snippet,contentDetails",
        id: ids.join(","),
        maxResults: String(count),
      })
    : { items: [] };

  const videos = (details.items ?? []).map((item) => ({
    youtube_video_id: item.id,
    title: item.snippet?.title ?? "Untitled video",
    description: item.snippet?.description ?? null,
    url: `https://www.youtube.com/watch?v=${item.id}`,
    thumbnail_url: getBestThumbnail(item.snippet?.thumbnails),
    published_at: item.snippet?.publishedAt ?? null,
    duration_seconds: parseIsoDuration(item.contentDetails?.duration ?? null),
  }));

  const handle = channel.snippet?.customUrl?.startsWith("@")
    ? channel.snippet.customUrl.slice(1)
    : parsed.kind === "handle"
      ? parsed.value
      : null;

  return {
    creator: {
      youtube_channel_id: channel.id,
      handle,
      title: channel.snippet?.title ?? "Untitled creator",
      description: channel.snippet?.description ?? null,
      thumbnail_url: getBestThumbnail(channel.snippet?.thumbnails),
      channel_url: `https://www.youtube.com/channel/${channel.id}`,
      discovery_mode: "youtube_api",
    },
    videos,
  };
}

async function resolveChannel(parsed: ParsedYouTubeInput, apiKey: string) {
  if (parsed.kind === "video") {
    const videos = await youtubeFetch<VideosResponse>("videos", apiKey, {
      part: "snippet",
      id: parsed.value,
    });
    const channelId = videos.items?.[0]?.snippet?.channelId;
    if (!channelId) throw new Error("Could not resolve the video's channel.");
    return resolveChannel({ kind: "channel_id", value: channelId, canonicalUrl: "" }, apiKey);
  }

  const params: Record<string, string> = {
    part: "snippet,contentDetails",
    maxResults: "1",
  };

  if (parsed.kind === "channel_id") {
    params.id = parsed.value;
  } else if (parsed.kind === "handle") {
    params.forHandle = parsed.value.startsWith("@") ? parsed.value : `@${parsed.value}`;
  } else if (parsed.kind === "user") {
    params.forUsername = parsed.value;
  } else {
    const searched = await youtubeFetch<{ items?: Array<{ id?: { channelId?: string } }> }>(
      "search",
      apiKey,
      {
        part: "snippet",
        type: "channel",
        q: parsed.value,
        maxResults: "1",
      },
    );
    const channelId = searched.items?.[0]?.id?.channelId;
    if (!channelId) throw new Error("Could not resolve that YouTube creator.");
    params.id = channelId;
  }

  const channels = await youtubeFetch<YouTubeChannelResponse>("channels", apiKey, params);
  const channel = channels.items?.[0];
  if (!channel) throw new Error("Could not resolve that YouTube creator.");
  return channel;
}

async function discoverWithRssFallback(
  parsed: ParsedYouTubeInput,
  count: number,
): Promise<DiscoveryResult> {
  if (parsed.kind !== "channel_id") {
    throw new Error(
      "RSS fallback can only backfill /channel/UC... URLs. Add YOUTUBE_API_KEY to support handles, custom URLs, users, and video URLs.",
    );
  }

  const parser = new Parser();
  const feed = await parser.parseURL(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(parsed.value)}`,
  );
  const videos = feed.items.slice(0, count).map((item) => {
    const id = (item.id ?? item.link ?? "").split(":").pop() ?? "";
    return {
      youtube_video_id: id,
      title: item.title ?? "Untitled video",
      description: item.contentSnippet ?? null,
      url: item.link ?? `https://www.youtube.com/watch?v=${id}`,
      thumbnail_url: null,
      published_at: item.pubDate ? new Date(item.pubDate).toISOString() : null,
      duration_seconds: null,
    };
  });

  return {
    creator: {
      youtube_channel_id: parsed.value,
      handle: null,
      title: feed.title ?? parsed.value,
      description: feed.description ?? null,
      thumbnail_url: null,
      channel_url: parsed.canonicalUrl,
      discovery_mode: "rss_fallback",
    },
    videos,
    warning: "RSS fallback mode is limited; YouTube API discovery gives better backfills.",
  };
}

async function youtubeFetch<T>(
  endpoint: string,
  apiKey: string,
  params: Record<string, string>,
): Promise<T> {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${endpoint}`);
  url.searchParams.set("key", apiKey);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`YouTube API request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function getBestThumbnail(thumbnails?: Record<string, { url?: string }>) {
  return (
    thumbnails?.maxres?.url ??
    thumbnails?.standard?.url ??
    thumbnails?.high?.url ??
    thumbnails?.medium?.url ??
    thumbnails?.default?.url ??
    null
  );
}

function parseIsoDuration(duration: string | null) {
  if (!duration) return null;
  const match = duration.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return null;
  const [, days = "0", hours = "0", minutes = "0", seconds = "0"] = match;
  return (
    Number(days) * 86400 + Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)
  );
}
