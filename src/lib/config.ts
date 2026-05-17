import crypto from "node:crypto";

export const requiredExternalEnvVars = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "YOUTUBE_API_KEY",
  "DEEPSEEK_API_KEY",
  "KIMI_API_KEY",
  "QWEN_API_KEY",
  "DASHSCOPE_API_KEY",
  "GEMINI_API_KEY",
  "FIRST_ADMIN_USERNAME",
  "FIRST_ADMIN_PASSWORD",
] as const;

export const defaultEnvValues = {
  APP_ENV: "development",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  SUPABASE_STORAGE_BUCKET: "yt-newsletter-assets",
  ALLOW_PUBLIC_SIGNUP: "false",
  TRANSCRIPT_RETRY_MINUTES: "60",
  MONTHLY_AI_BUDGET_USD: "25",
  AI_PROVIDER_TIMEOUT_MS: "300000",
  DEEPSEEK_PROVIDER_TIMEOUT_MS: "600000",
  MAX_BACKFILL_VIDEOS_PER_JOB: "50",
  BACKFILL_VIDEO_LOOKBACK_LIMIT: "500",
  BACKFILL_MIN_VIDEO_DURATION_SECONDS: "300",
  BACKFILL_PROCESS_LIMIT: "25",
  BACKFILL_PROCESS_MAX_LOOPS: "200",
  CREATOR_DISCOVERY_LOOKBACK_LIMIT: "10",
  BASELINE_MONTH_VIDEO_LOOKBACK_LIMIT: "150",
  BASELINE_MIN_VIDEO_DURATION_SECONDS: "300",
  MAX_VIDEOS_PROCESSED_PER_CRON_RUN: "1",
  GENERATE_IMAGES: "false",
  GENERATE_AUDIO: "false",
  DEEPSEEK_DAILY_MODEL: "deepseek-v4-pro",
  DEEPSEEK_DAILY_MAX_ATTEMPTS: "2",
  QWEN_DAILY_FALLBACK_MODEL: "qwen3-max",
  DEEPSEEK_WEEKLY_MODEL: "deepseek-v4-pro",
  DEEPSEEK_WEEKLY_MAX_ATTEMPTS: "3",
  KIMI_WEEKLY_MODEL: "moonshot-v1-32k",
  GEMINI_VIDEO_MODEL: "gemini-2.5-flash",
  GEMINI_TTS_MODEL: "gemini-2.5-flash-preview-tts",
  GEMINI_TTS_ESTIMATED_COST_PER_MINUTE: "0.015",
  QWEN_IMAGE_MODEL: "wanx2.1-t2i-plus",
  QWEN_TTS_MODEL: "qwen3-tts-vd-2026-01-26",
  QWEN_VOICE_DESIGN_MODEL: "qwen-voice-design",
  QWEN_PODCAST_FEMALE_VOICE: "",
  QWEN_PODCAST_MALE_VOICE: "",
  DEEPSEEK_PODCAST_MODEL: "deepseek-v4-pro",
  DEEPSEEK_PODCAST_MAX_ATTEMPTS: "2",
  PODCAST_SCRIPT_MAX_OUTPUT_TOKENS: "24000",
  PODCAST_SCRIPT_TARGET_MINUTES: "30",
  PODCAST_GENERATION_MODE: "provider_script",
  PODCAST_TTS_PROVIDER: "gemini_flash",
  PODCAST_AUDIO_BITRATE: "128k",
} as const;

export function getEnv(name: string, fallback?: string) {
  return process.env[name] ?? fallback;
}

export function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getSupabaseAnonKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

export function numberEnv(name: string, fallback: number) {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function booleanEnv(name: string, fallback = false) {
  const value = process.env[name];
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function randomSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}
