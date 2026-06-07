import { existsSync, readFileSync, appendFileSync } from "node:fs";
import crypto from "node:crypto";

const envPath = ".env.local";
const requiredExternal = [
  "YOUTUBE_API_KEY",
  "DEEPSEEK_API_KEY",
  "KIMI_API_KEY",
  "QWEN_API_KEY",
  "DASHSCOPE_API_KEY",
  "TRANSCRIPT_API_KEY",
  "FIRST_ADMIN_USERNAME",
  "FIRST_ADMIN_PASSWORD",
];

const defaults = {
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
