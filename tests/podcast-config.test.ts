import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getPodcastAudioConfig,
  getPodcastScriptConfig,
  getPodcastTargetWordCount,
} from "../src/lib/podcasts/config";

describe("podcast audio config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to Gemini Flash TTS for high-quality podcast audio", () => {
    vi.stubEnv("PODCAST_TTS_PROVIDER", "");
    vi.stubEnv("PODCAST_TTS_MODEL", "");
    vi.stubEnv("GEMINI_TTS_MODEL", "");

    expect(getPodcastAudioConfig()).toMatchObject({
      provider: "gemini_flash",
      ttsModel: "gemini-2.5-flash-preview-tts",
      geminiChunkMaxCharacters: 4800,
      geminiLineMaxCharacters: 1800,
    });
  });

  it("allows Gemini TTS chunk sizes to be tuned without changing the provider", () => {
    vi.stubEnv("PODCAST_TTS_PROVIDER", "gemini_flash");
    vi.stubEnv("GEMINI_TTS_CHUNK_MAX_CHARACTERS", "7200");
    vi.stubEnv("GEMINI_TTS_LINE_MAX_CHARACTERS", "2400");

    expect(getPodcastAudioConfig()).toMatchObject({
      provider: "gemini_flash",
      geminiChunkMaxCharacters: 7200,
      geminiLineMaxCharacters: 2400,
    });
  });

  it("defaults weekly podcast scripts to roughly thirty minutes", () => {
    vi.stubEnv("PODCAST_SCRIPT_TARGET_MINUTES", "");
    vi.stubEnv("PODCAST_SCRIPT_WORDS_PER_MINUTE", "");

    const config = getPodcastScriptConfig();

    expect(config).toMatchObject({
      targetMinutes: 30,
      wordsPerMinute: 145,
    });
    expect(getPodcastTargetWordCount(config)).toBeGreaterThanOrEqual(4300);
  });

  it("keeps Qwen model selection when the Qwen provider is explicit", () => {
    vi.stubEnv("PODCAST_TTS_PROVIDER", "qwen_voice_design");
    vi.stubEnv("QWEN_TTS_MODEL", "qwen-custom-tts");

    expect(getPodcastAudioConfig()).toMatchObject({
      provider: "qwen_voice_design",
      ttsModel: "qwen-custom-tts",
    });
  });
});
