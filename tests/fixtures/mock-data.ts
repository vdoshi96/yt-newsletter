export const mockCreator = {
  id: "creator-1",
  title: "Mock Creator",
  channel_url: "https://www.youtube.com/@mock",
};

export const mockVideos = [
  {
    id: "video-1",
    creator_id: "creator-1",
    youtube_video_id: "abc111",
    title: "Morning video",
    published_at: "2026-05-01T09:00:00Z",
  },
  {
    id: "video-2",
    creator_id: "creator-1",
    youtube_video_id: "abc222",
    title: "Evening video",
    published_at: "2026-05-01T18:00:00Z",
  },
  {
    id: "video-3",
    creator_id: "creator-1",
    youtube_video_id: "abc333",
    title: "Missing transcript video",
    published_at: "2026-05-02T13:00:00Z",
  },
];

export const mockMissingTranscript = {
  video_id: "video-3",
  source: "youtube_transcript_free",
  status: "missing",
  needs_retry: true,
};

export const mockWeeklyDigest = {
  creator_id: "creator-1",
  week_start: "2026-04-27",
  week_end: "2026-05-03",
  title: "Mock week in practical AI",
};
