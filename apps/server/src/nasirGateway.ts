// Nasir gateway reader (fork-only), shared by Nasir Home and the Computer panel. Read-only: it only issues GETs with
// the same `converse`/`read` token the ACP bridge uses (NASIR_GATEWAY_URL, NASIR_GATEWAY_TOKEN_FILE).
//
// NASIR_HOME_FIXTURE=<file> reads recorded responses, keyed by request path (query string included), through the
// same code and labels everything "fixture", never "live". An entry shaped {"__status": 403, "error": "...",
// "code": "..."} stands for a refusal the gateway answered.
import { readFileSync } from "node:fs";

/** A refusal the gateway answered (4xx/5xx), with its own words and code. */
export class GatewayRefusal extends Error {
  readonly route: string;
  readonly status: number;
  readonly code: string | null;
  readonly gatewayMessage: string | null;
  constructor(route: string, status: number, code: string | null, gatewayMessage: string | null) {
    super(`the gateway answered ${status} for ${route}${gatewayMessage ? `: ${gatewayMessage}` : ""}`);
    this.route = route;
    this.status = status;
    this.code = code;
    this.gatewayMessage = gatewayMessage;
  }
}

export type GatewayReader =
  | { readonly source: "gateway" | "fixture"; readonly notice: string | null; readonly read: (path: string) => Promise<unknown> }
  | { readonly source: "unconfigured"; readonly notice: string };

const route = (path: string): string => path.split("?")[0] ?? path;

export function gatewayReader(): GatewayReader {
  const fixture = process.env.NASIR_HOME_FIXTURE?.trim();
  const url = process.env.NASIR_GATEWAY_URL?.trim();
  const tokenFile = process.env.NASIR_GATEWAY_TOKEN_FILE?.trim();
  if (fixture) {
    const recorded = JSON.parse(readFileSync(fixture, "utf8")) as Record<string, unknown>;
    return {
      source: "fixture",
      notice: "Not live: these are recorded gateway responses from a fixture file, not Nasir's current state.",
      read: async (path) => {
        const body = recorded[path];
        if (body === undefined) throw new Error(`no recorded response for ${path}`);
        if (typeof body === "object" && body !== null && "__status" in body) {
          const refusal = body as { __status: number; error?: string; code?: string };
          throw new GatewayRefusal(route(path), refusal.__status, refusal.code ?? null, refusal.error ?? null);
        }
        return body;
      },
    };
  }
  if (!url || !tokenFile) {
    return { source: "unconfigured", notice: "Not connected: this server has no NASIR_GATEWAY_URL and NASIR_GATEWAY_TOKEN_FILE, so it cannot read Nasir." };
  }
  const base = url.replace(/\/+$/, "");
  const token = readFileSync(tokenFile, "utf8").trim();
  return {
    source: "gateway",
    notice: null,
    read: async (path) => {
      const response = await fetch(`${base}${path}`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      }).catch(() => {
        throw new Error(`the gateway at ${new URL(base).host} is unreachable`);
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: unknown; code?: unknown };
        throw new GatewayRefusal(
          route(path),
          response.status,
          typeof body.code === "string" ? body.code : null,
          typeof body.error === "string" ? body.error : null,
        );
      }
      return response.json().catch(() => {
        throw new Error(`the gateway answered ${route(path)} with something that is not JSON; check NASIR_GATEWAY_URL`);
      });
    },
  };
}
