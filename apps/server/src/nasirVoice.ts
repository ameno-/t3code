// Nasir voice (fork-only): where the browser can reach the voice call page.
//
// The call page is served by the voice service, not by this server: it owns the microphone stream and the local
// speech pipeline, and it talks to Nasir's gateway with its own converse token. This server only tells the web app
// which origin to embed. NASIR_VOICE_URL must be an origin the browser can reach; an https page cannot embed an
// http one, so the page itself explains that case rather than leaving a blank frame.

export type NasirVoiceConfig = {
  readonly url: string | null;
  readonly reason: string | null;
};

export function readNasirVoiceConfig(): NasirVoiceConfig {
  const raw = process.env.NASIR_VOICE_URL?.trim();
  if (!raw) return { url: null, reason: "NASIR_VOICE_URL is not set" };
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { url: null, reason: "NASIR_VOICE_URL is not a valid URL" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { url: null, reason: "NASIR_VOICE_URL must be http or https" };
  }
  return { url: `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`, reason: null };
}
