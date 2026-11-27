// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { mintNasirCallTicket } from "./nasirCallTicket.ts";

function configure() {
  const tokenFile = NodePath.join(
    NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "nasir-ticket-")),
    "token",
  );
  NodeFS.writeFileSync(tokenFile, "gateway-token\n");
  vi.stubEnv("NASIR_VOICE_URL", "https://voice.example:8477/");
  vi.stubEnv("NASIR_GATEWAY_TOKEN_FILE", tokenFile);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("nasirCallTicket", () => {
  it("trades the thread's conversation id for a ticket, with the gateway token", async () => {
    configure();
    const fetchImpl = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(JSON.stringify({ ticket: "t-1", conversation_id: 41, expires_at: 0 })),
    );
    vi.stubGlobal("fetch", fetchImpl);

    expect(await mintNasirCallTicket("41")).toEqual({ ticket: "t-1", reason: null });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://voice.example:8477/api/call-tickets");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ authorization: "Bearer gateway-token" });
    expect(JSON.parse(String(init.body))).toEqual({ conversation_id: 41 });
  });

  it("does not ask the voice service when the thread has no conversation id", async () => {
    configure();
    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);

    expect(await mintNasirCallTicket(null)).toEqual({
      ticket: null,
      reason: "this thread has no Nasir conversation yet",
    });
    for (const id of ["", "0", "-3", "4.5", "abc", "41 "]) {
      expect((await mintNasirCallTicket(id)).ticket).toBeNull();
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("gives a reason when voice or the token is not configured", async () => {
    configure();
    vi.stubEnv("NASIR_VOICE_URL", "");
    expect(await mintNasirCallTicket("41")).toEqual({
      ticket: null,
      reason: "NASIR_VOICE_URL is not set",
    });
    configure();
    vi.stubEnv("NASIR_GATEWAY_TOKEN_FILE", "/nonexistent/nasir-token");
    expect(await mintNasirCallTicket("41")).toEqual({
      ticket: null,
      reason: "the gateway token file could not be read",
    });
  });

  it("gives a reason when the voice service refuses or cannot be reached", async () => {
    configure();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 401 })),
    );
    expect(await mintNasirCallTicket("41")).toEqual({
      ticket: null,
      reason: "the voice service answered 401",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    expect(await mintNasirCallTicket("41")).toEqual({
      ticket: null,
      reason: "the voice service is unreachable",
    });
  });
});
