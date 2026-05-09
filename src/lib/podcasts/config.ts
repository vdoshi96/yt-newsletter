import { numberEnv } from "../config";

export type PodcastGenerationMode = "two_host_deep_dive" | "provider_script";
export type PodcastTtsProvider = "qwen_voice_design" | "qwen_simple" | "external_manual";

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
    targetMinutes: numberEnv("PODCAST_SCRIPT_TARGET_MINUTES", 8),
    wordsPerMinute: numberEnv("PODCAST_SCRIPT_WORDS_PER_MINUTE", 145),
    generationMode: parseGenerationMode(process.env.PODCAST_GENERATION_MODE),
  };
}

export function getPodcastTargetWordCount(config = getPodcastScriptConfig()) {
  return Math.max(700, Math.round(config.targetMinutes * config.wordsPerMinute));
}

export function getPodcastAudioConfig(): PodcastAudioConfig {
  return {
    provider: parseTtsProvider(process.env.PODCAST_TTS_PROVIDER),
    ttsModel:
      process.env.PODCAST_TTS_MODEL ??
      process.env.QWEN_TTS_MODEL ??
      "qwen3-tts-vd-2026-01-26",
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
  return value === "provider_script" ? "provider_script" : "two_host_deep_dive";
}

function parseTtsProvider(value: string | undefined): PodcastTtsProvider {
  if (value === "qwen_simple" || value === "external_manual") return value;
  return "qwen_voice_design";
}

function cleanOptional(value: string | undefined) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}
