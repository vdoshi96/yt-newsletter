import { numberEnv } from "../config";

export type PodcastGenerationMode = "two_host_deep_dive" | "provider_script";
export type PodcastTtsProvider =
  | "gemini_flash"
  | "qwen_voice_design"
  | "qwen_simple"
  | "external_manual";

export type PodcastScriptConfig = {
  targetMinutes: number;
  wordsPerMinute: number;
  generationMode: PodcastGenerationMode;
};

export type PodcastAudioConfig = {
  provider: PodcastTtsProvider;
  ttsModel: string;
  voiceDesignModel: string;
  femaleVoice: string | null;
  maleVoice: string | null;
  audioBitrate: string;
};

export function getPodcastScriptConfig(): PodcastScriptConfig {
  return {
    targetMinutes: numberEnv("PODCAST_SCRIPT_TARGET_MINUTES", 30),
    wordsPerMinute: numberEnv("PODCAST_SCRIPT_WORDS_PER_MINUTE", 145),
    generationMode: parseGenerationMode(process.env.PODCAST_GENERATION_MODE),
  };
}

export function getPodcastTargetWordCount(config = getPodcastScriptConfig()) {
  return Math.max(700, Math.round(config.targetMinutes * config.wordsPerMinute));
}

export function getPodcastAudioConfig(): PodcastAudioConfig {
  const provider = parseTtsProvider(process.env.PODCAST_TTS_PROVIDER);
  return {
    provider,
    ttsModel:
      cleanOptional(process.env.PODCAST_TTS_MODEL) ??
      (provider === "gemini_flash"
        ? cleanOptional(process.env.GEMINI_TTS_MODEL) ?? "gemini-2.5-flash-preview-tts"
        : cleanOptional(process.env.QWEN_TTS_MODEL) ?? "qwen3-tts-vd-2026-01-26"),
    voiceDesignModel: process.env.QWEN_VOICE_DESIGN_MODEL ?? "qwen-voice-design",
    femaleVoice:
      cleanOptional(process.env.PODCAST_FEMALE_VOICE) ??
      cleanOptional(process.env.QWEN_PODCAST_FEMALE_VOICE),
    maleVoice:
      cleanOptional(process.env.PODCAST_MALE_VOICE) ??
      cleanOptional(process.env.QWEN_PODCAST_MALE_VOICE),
    audioBitrate: process.env.PODCAST_AUDIO_BITRATE ?? "128k",
  };
}

function parseGenerationMode(value: string | undefined): PodcastGenerationMode {
  return value === "two_host_deep_dive" ? "two_host_deep_dive" : "provider_script";
}

function parseTtsProvider(value: string | undefined): PodcastTtsProvider {
  if (value === "gemini_flash") return value;
  if (value === "qwen_voice_design" || value === "qwen_simple" || value === "external_manual") {
    return value;
  }
  return "gemini_flash";
}

function cleanOptional(value: string | undefined) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}
