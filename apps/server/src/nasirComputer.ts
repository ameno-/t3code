// Nasir Computer (fork-only): read-only views of Nasir's computer, not of the machine T3 runs on.
//
// Files: the gateway's GET /v1/computer/files and /v1/computer/file (converse scope). The gateway serves only
// Nasir's VM work dir and the Case prototype repos, and refuses hidden, secret-named and symlinked paths itself; this
// module forwards the path and shows the gateway's refusal in its own words. Live: GET
// /v1/cases/:id/tasks/:taskId/transcript (read scope), polled by the page. Nothing here writes, steers or runs a
// command. There is no shell.
import { GatewayRefusal, gatewayReader } from "./nasirGateway.ts";

export type ComputerStatus = {
  readonly source: "gateway" | "fixture" | "unconfigured";
  readonly live: boolean;
  readonly notice: string | null;
};
export type ComputerEntry = { readonly name: string; readonly path: string; readonly kind: string };
export type ComputerResult<T> =
  | ({ readonly ok: true; readonly value: T } & ComputerStatus)
  | ({ readonly ok: false; readonly error: string; readonly code: string | null; readonly status: number } & ComputerStatus);

const CASE_ID = /^case_[0-9a-z]{8,}$/;
const TASK_ID = /^task_[0-9a-z]{8,}$/;
/** An absolute path with no traversal and no control characters; the gateway's roots decide the rest. */
const SAFE_PATH = /^\/[^\u0000-\u001f]*$/;

async function through<T>(path: string, limitLabel?: string): Promise<ComputerResult<T>> {
  const reader = gatewayReader();
  if (reader.source === "unconfigured") {
    return { ok: false, error: reader.notice, code: "unconfigured", status: 503, source: "unconfigured", live: false, notice: reader.notice };
  }
  const status: ComputerStatus = { source: reader.source, live: reader.source === "gateway", notice: reader.notice };
  try {
    return { ok: true, value: (await reader.read(path)) as T, ...status };
  } catch (error) {
    if (error instanceof GatewayRefusal) {
      return {
        ok: false,
        error: error.gatewayMessage ?? error.message,
        code: error.code,
        status: error.status,
        ...status,
        live: status.live,
      };
    }
    return { ok: false, error: error instanceof Error ? error.message : String(error), code: limitLabel ?? null, status: 502, ...status, live: false };
  }
}

const invalid = (error: string): ComputerResult<never> => ({
  ok: false,
  error,
  code: "invalid_request",
  status: 400,
  source: "gateway",
  live: false,
  notice: null,
});

export type ComputerListing = { path: string; roots: string[]; entries: ComputerEntry[]; truncated: boolean };
export type ComputerFile = { path: string; size: number; text: string };
export type TranscriptTurn = { id: number; role: string; text: string };

export function listFiles(path: string): Promise<ComputerResult<ComputerListing>> {
  if (path !== "" && !SAFE_PATH.test(path)) return Promise.resolve(invalid("path must be absolute"));
  return through(`/v1/computer/files?path=${encodeURIComponent(path)}`);
}

export function readFile(path: string): Promise<ComputerResult<ComputerFile>> {
  if (!SAFE_PATH.test(path)) return Promise.resolve(invalid("path must be absolute"));
  return through(`/v1/computer/file?path=${encodeURIComponent(path)}`);
}

export function readTranscript(caseId: string, taskId: string): Promise<ComputerResult<TranscriptTurn[]>> {
  if (!CASE_ID.test(caseId) || !TASK_ID.test(taskId)) return Promise.resolve(invalid("not a Case or Task id"));
  return through(`/v1/cases/${caseId}/tasks/${taskId}/transcript?limit=50`);
}
