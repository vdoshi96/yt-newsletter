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
