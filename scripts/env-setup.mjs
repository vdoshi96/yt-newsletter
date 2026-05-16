import { existsSync, readFileSync, appendFileSync } from "node:fs";
import crypto from "node:crypto";

const envPath = ".env.local";
const requiredExternal = [
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
];

const defaults = {
  APP_ENV: "development",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  SUPABASE_STORAGE_BUCKET: "yt-newsletter-assets",
  ALLOW_PUBLIC_SIGNUP: "false",
  TRANSCRIPT_RETRY_MINUTES: "60",
  MONTHLY_AI_BUDGET_USD: "25",
  AI_PROVIDER_TIMEOUT_MS: "300000",
  MAX_BACKFILL_VIDEOS_PER_JOB: "50",
  BASELINE_MONTH_VIDEO_LOOKBACK_LIMIT: "150",
  BASELINE_MIN_VIDEO_DURATION_SECONDS: "300",
  MAX_VIDEOS_PROCESSED_PER_CRON_RUN: "1",
  GENERATE_IMAGES: "false",
  GENERATE_AUDIO: "false",
  DEEPSEEK_DAILY_MODEL: "deepseek-chat",
  QWEN_DAILY_FALLBACK_MODEL: "qwen-plus",
  DEEPSEEK_WEEKLY_FALLBACK_MODEL: "deepseek-chat",
  KIMI_WEEKLY_MODEL: "moonshot-v1-32k",
  WEEKLY_AI_MAX_OUTPUT_TOKENS: "12000",
  GEMINI_VIDEO_MODEL: "gemini-2.5-flash",
  GEMINI_TTS_MODEL: "gemini-2.5-flash-preview-tts",
  GEMINI_TTS_ESTIMATED_COST_PER_MINUTE: "0.015",
  QWEN_IMAGE_MODEL: "wanx2.1-t2i-plus",
  QWEN_TTS_MODEL: "qwen3-tts-vd-2026-01-26",
  QWEN_VOICE_DESIGN_MODEL: "qwen-voice-design",
  QWEN_PODCAST_FEMALE_VOICE: "",
  QWEN_PODCAST_MALE_VOICE: "",
  PODCAST_TTS_PROVIDER: "gemini_flash",
};

if (!existsSync(envPath)) {
  throw new Error(".env.local does not exist. Create it with the required external values first.");
}

const raw = readFileSync(envPath, "utf8");
const keys = new Set();
for (const line of raw.split(/\r?\n/)) {
  const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
  if (match) keys.add(match[1]);
}

const additions = [];
if (!keys.has("CRON_SECRET")) additions.push(["CRON_SECRET", randomSecret()]);
if (!keys.has("COOKIE_SECRET")) additions.push(["COOKIE_SECRET", randomSecret()]);
for (const [key, value] of Object.entries(defaults)) {
  if (!keys.has(key)) additions.push([key, value]);
}
if (!keys.has("NEXT_PUBLIC_SUPABASE_ANON_KEY") && keys.has("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")) {
  additions.push(["NEXT_PUBLIC_SUPABASE_ANON_KEY", "${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}"]);
}

if (additions.length) {
  appendFileSync(
    envPath,
    `\n# Added by npm run env:setup for local app defaults.\n${additions
      .map(([key, value]) => `${key}=${value}`)
      .join("\n")}\n`,
  );
}

const present = new Set([...keys, ...additions.map(([key]) => key)]);
const missing = requiredExternal.filter((key) => !present.has(key));

console.log(`Generated or confirmed local defaults: ${additions.map(([key]) => key).join(", ") || "none"}`);
if (missing.length) {
  console.log(`Missing required external env var names: ${missing.join(", ")}`);
  process.exitCode = 2;
} else {
  console.log("All required external env var names are present.");
}

function randomSecret() {
  return crypto.randomBytes(32).toString("base64url");
}
