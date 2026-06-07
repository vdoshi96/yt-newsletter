export const requiredExternalEnvVars = [
  "YOUTUBE_API_KEY",
  "DEEPSEEK_API_KEY",
  "KIMI_API_KEY",
  "QWEN_API_KEY",
  "DASHSCOPE_API_KEY",
  "TRANSCRIPT_API_KEY",
  "FIRST_ADMIN_USERNAME",
  "FIRST_ADMIN_PASSWORD",
] as const;

export const defaultEnvValues = {
  APP_ENV: "development",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  ALLOW_PUBLIC_SIGNUP: "false",
  CATALOG_START_DATE: "2026-03-01",
  TRANSCRIPT_RETRY_MINUTES: "60",
  TRANSCRIPT_MAX_RETRY_ATTEMPTS: "48",
  TRANSCRIPT_EXTENDED_RETRY_SECONDS: "86400",
  TRANSCRIPT_FETCH_TIMEOUT_MS: "45000",
  TRANSCRIPT_API_FALLBACK_AFTER_HOURS: "2",
  MONTHLY_AI_BUDGET_USD: "25",
  AI_PROVIDER_TIMEOUT_MS: "300000",
  DEEPSEEK_PROVIDER_TIMEOUT_MS: "600000",
  INGEST_PROCESS_CONCURRENCY: "2",
  WEEKLY_DIGEST_CONCURRENCY: "2",
  MAX_BACKFILL_VIDEOS_PER_JOB: "50",
  BACKFILL_VIDEO_LOOKBACK_LIMIT: "500",
  BACKFILL_MIN_VIDEO_DURATION_SECONDS: "300",
  BACKFILL_PROCESS_LIMIT: "25",
  BACKFILL_PROCESS_MAX_LOOPS: "200",
  CREATOR_DISCOVERY_LOOKBACK_LIMIT: "10",
  BASELINE_MONTH_VIDEO_LOOKBACK_LIMIT: "150",
  BASELINE_MIN_VIDEO_DURATION_SECONDS: "300",
  MAX_VIDEOS_PROCESSED_PER_CRON_RUN: "4",
  GENERATE_IMAGES: "false",
  DEEPSEEK_DAILY_MODEL: "deepseek-v4-pro",
  DEEPSEEK_DAILY_MAX_ATTEMPTS: "2",
  QWEN_DAILY_FALLBACK_MODEL: "qwen3-max",
  DEEPSEEK_WEEKLY_MODEL: "deepseek-v4-pro",
  DEEPSEEK_WEEKLY_MAX_ATTEMPTS: "5",
  ALLOW_WEEKLY_DIGEST_FALLBACK: "false",
  KIMI_WEEKLY_MODEL: "moonshot-v1-32k",
  QWEN_IMAGE_MODEL: "wanx2.1-t2i-plus",
} as const;

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
