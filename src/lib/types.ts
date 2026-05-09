export type AppUser = {
  id: string;
  username: string;
  role: string;
};

export type Creator = {
  id: string;
  youtube_channel_id: string | null;
  handle: string | null;
  title: string | null;
  description: string | null;
  thumbnail_url: string | null;
  channel_url: string | null;
  last_checked_at?: string | null;
};

export type Video = {
  id: string;
  creator_id: string;
  youtube_video_id: string;
  title: string | null;
  description: string | null;
  url: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  duration_seconds: number | null;
};

export type IngestJob = {
  id: string;
  user_id: string;
  creator_id: string;
  requested_video_count: number;
  status: string;
  total_count: number;
  processed_count: number;
  failed_count: number;
  current_video_id: string | null;
  estimated_seconds: number;
  created_at: string;
  updated_at: string;
  creator_title?: string | null;
  current_video_title?: string | null;
};
