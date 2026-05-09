import { afterEach, describe, expect, it, vi } from "vitest";
import { getPodcastAudioConfig } from "../src/lib/podcasts/config";

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

  it("keeps Qwen model selection when the Qwen provider is explicit", () => {
    vi.stubEnv("PODCAST_TTS_PROVIDER", "qwen_voice_design");
    vi.stubEnv("QWEN_TTS_MODEL", "qwen-custom-tts");

    expect(getPodcastAudioConfig()).toMatchObject({
      provider: "qwen_voice_design",
      ttsModel: "qwen-custom-tts",
    });
  });
});
