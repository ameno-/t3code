// @effect-diagnostics nodeBuiltinImport:off
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { readNasirVoiceConfig } from "./nasirVoice.ts";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("nasirVoice", () => {
  it("is unconfigured, with a reason, when no voice URL is set", () => {
    vi.stubEnv("NASIR_VOICE_URL", "");
    expect(readNasirVoiceConfig()).toEqual({ url: null, reason: "NASIR_VOICE_URL is not set" });
  });

  it("keeps the origin and a path prefix, without a trailing slash", () => {
    vi.stubEnv("NASIR_VOICE_URL", "https://voice.example:8477/nasir/");
    expect(readNasirVoiceConfig()).toEqual({
      url: "https://voice.example:8477/nasir",
      reason: null,
    });
  });

  it("refuses a value that is not an http(s) URL", () => {
    vi.stubEnv("NASIR_VOICE_URL", "ws://voice.example");
    expect(readNasirVoiceConfig().url).toBeNull();
    vi.stubEnv("NASIR_VOICE_URL", "not a url");
    expect(readNasirVoiceConfig().url).toBeNull();
  });
});
