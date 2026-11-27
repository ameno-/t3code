// Nasir voice (fork-only): a call ticket that puts a call in one thread's Nasir conversation. The thread's ACP session
// id is the conversation id; the voice service trades it for a single-use ticket (POST /api/call-tickets, with the
// gateway token both servers read). Only the ticket reaches the browser, and every refusal comes back as a reason.
import * as NodeFS from "node:fs";

import { readNasirVoiceConfig } from "./nasirVoice.ts";

/** The Nasir entry under providerInstances in this fork's settings. */
export const NASIR_PROVIDER = { driver: "acpRegistry", instanceId: "acpRegistry_nasir" } as const;

export type NasirCallTicket = {
  readonly ticket: string | null;
  readonly reason: string | null;
};

const refused = (reason: string): NasirCallTicket => ({ ticket: null, reason });

export async function mintNasirCallTicket(
  nativeSessionId: string | null,
): Promise<NasirCallTicket> {
  if (!nativeSessionId) return refused("this thread has no Nasir conversation yet");
  if (!/^[1-9]\d*$/.test(nativeSessionId)) {
    return refused("this thread's Nasir session is not a conversation id");
  }
  const voice = readNasirVoiceConfig();
  if (!voice.url) return refused(voice.reason ?? "NASIR_VOICE_URL is not set");
  const tokenFile = process.env.NASIR_GATEWAY_TOKEN_FILE?.trim();
  if (!tokenFile) return refused("NASIR_GATEWAY_TOKEN_FILE is not set");
  let token: string;
  try {
    token = NodeFS.readFileSync(tokenFile, "utf8").trim();
  } catch {
    return refused("the gateway token file could not be read");
  }
  let response: Response;
  try {
    response = await fetch(`${voice.url}/api/call-tickets`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ conversation_id: Number(nativeSessionId) }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return refused("the voice service is unreachable");
  }
  if (!response.ok) return refused(`the voice service answered ${response.status}`);
  const body = (await response.json().catch(() => null)) as { ticket?: unknown } | null;
  return typeof body?.ticket === "string" && body.ticket
    ? { ticket: body.ticket, reason: null }
    : refused("the voice service answered without a ticket");
}
