// Nasir Home (fork-only): one read-only snapshot of what Nasir is waiting on, running and has delivered.
//
// Source of truth is Nasir's gateway, read with the same `converse`/`read` token the ACP bridge uses
// (NASIR_GATEWAY_URL, NASIR_GATEWAY_TOKEN_FILE). Only GET /v1/asks, /v1/cases, /v1/cases/:id and /v1/workitems are
// called. Nothing here approves, steers or stops: an ask's button is a link to the gateway's own approval page
// (NASIR_APPROVE_URL, ADR 0021), so the fork holds no approve scope.
//
// There is no demo data. Without a gateway the snapshot says so. NASIR_HOME_FIXTURE=<file> reads recorded gateway
// responses from a file through the same code and labels the snapshot "fixture", never "live".
import { readFileSync } from "node:fs";

export type HomeAsk = {
  readonly recordId: string;
  readonly title: string;
  readonly desk: string;
  readonly status: string;
  readonly reason: string;
  readonly headSha: string | null;
  readonly stale: boolean;
  /** The gateway's approval page for a Start or Deliver ask; null for any other desk (answers happen on the host). */
  readonly action: { readonly label: "Start" | "Deliver"; readonly url: string } | null;
};
export type HomeTask = {
  readonly recordId: string;
  readonly title: string;
  readonly worker: string;
  readonly status: string;
  readonly statusText: string;
  readonly note: string | null;
};
export type HomeCase = {
  readonly recordId: string;
  readonly title: string;
  readonly statusText: string;
  readonly tasks: ReadonlyArray<HomeTask>;
  readonly closed: number;
  readonly total: number;
};
export type HomeDelivered = {
  readonly recordId: string;
  readonly title: string;
  readonly pr: { readonly number: number; readonly url: string } | null;
  readonly headSha: string | null;
  readonly checks: string;
  readonly spendUSD: number | null;
  readonly budgetUSD: number | null;
  readonly at: string | null;
};
export type HomeSnapshot = {
  readonly source: "gateway" | "fixture" | "unconfigured";
  readonly live: boolean;
  readonly at: string;
  /** Plain statement of why a section may be empty or stale: gateway down, not configured, fixture. */
  readonly notice: string | null;
  readonly waiting: ReadonlyArray<HomeAsk>;
  readonly running: ReadonlyArray<HomeCase>;
  readonly delivered: ReadonlyArray<HomeDelivered>;
  /** Sections the gateway refused or failed to read, by name, with its words. */
  readonly sectionErrors: Readonly<Record<string, string>>;
};

const CACHE_MS = 3_000;
const MAX_CASES = 10;
const MAX_DELIVERED = 10;
let cached: { readonly at: number; readonly snapshot: HomeSnapshot } | undefined;

export async function readHome(): Promise<HomeSnapshot> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.snapshot;
  const snapshot = await buildSnapshot();
  cached = { at: Date.now(), snapshot };
  return snapshot;
}

async function buildSnapshot(): Promise<HomeSnapshot> {
  const fixture = process.env.NASIR_HOME_FIXTURE?.trim();
  const url = process.env.NASIR_GATEWAY_URL?.trim();
  const tokenFile = process.env.NASIR_GATEWAY_TOKEN_FILE?.trim();
  if (fixture) {
    const recorded = JSON.parse(readFileSync(fixture, "utf8")) as Record<string, unknown>;
    return compose(
      async (path) => {
        const body = recorded[path];
        if (body === undefined) throw new Error(`no recorded response for ${path}`);
        return body;
      },
      "fixture",
      "Not live: these are recorded gateway responses from a fixture file, not Nasir's current state.",
    );
  }
  if (!url || !tokenFile) {
    return empty("unconfigured", "Not connected: this server has no NASIR_GATEWAY_URL and NASIR_GATEWAY_TOKEN_FILE, so it cannot read Nasir.");
  }
  const base = url.replace(/\/+$/, "");
  const token = readFileSync(tokenFile, "utf8").trim();
  const read = async (path: string): Promise<unknown> => {
    const response = await fetch(`${base}${path}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    }).catch(() => {
      throw new Error(`the gateway at ${new URL(base).host} is unreachable`);
    });
    if (!response.ok) throw new Error(`the gateway answered ${response.status} for ${path.split("?")[0]}`);
    return response.json().catch(() => {
      throw new Error(`the gateway answered ${path.split("?")[0]} with something that is not JSON; check NASIR_GATEWAY_URL`);
    });
  };
  return compose(read, "gateway", null).catch((error: unknown) =>
    empty("gateway", `The gateway could not be read: ${error instanceof Error ? error.message : String(error)}`),
  );
}

function empty(source: HomeSnapshot["source"], notice: string): HomeSnapshot {
  return { source, live: false, at: new Date().toISOString(), notice, waiting: [], running: [], delivered: [], sectionErrors: {} };
}

type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] =>
  Array.isArray(value) ? value.filter((row): row is Row => typeof row === "object" && row !== null) : [];
const record = (value: unknown): Row => (typeof value === "object" && value !== null ? (value as Row) : {});
const text = (value: unknown): string => String(value ?? "").replace(/\s+/g, " ").trim();
const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const TASK_TEXT: Record<string, string> = {
  open: "Waiting to be assigned",
  assigned: "Assigned, not started",
  working: "Working",
  blocked: "Blocked",
  needs_help: "Needs help",
  done_proposed: "Says it is done, waiting for its check",
  closed: "Done",
  cancelled: "Cancelled",
};
const isFinished = (status: string): boolean => status === "closed" || status === "cancelled";

async function compose(
  read: (path: string) => Promise<unknown>,
  source: "gateway" | "fixture",
  notice: string | null,
): Promise<HomeSnapshot> {
  const sectionErrors: Record<string, string> = {};
  const guarded = async <T>(section: string, fallback: T, run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      sectionErrors[section] = message(error);
      return fallback;
    }
  };
  const [waiting, running, delivered] = await Promise.all([
    guarded("Waiting on you", [] as HomeAsk[], async () => asksFrom(rows(await read("/v1/asks")))),
    guarded("Running now", [] as HomeCase[], () => casesFrom(read)),
    guarded("Delivered", [] as HomeDelivered[], async () => deliveredFrom(rows(await read("/v1/workitems")))),
  ]);
  return {
    source,
    live: source === "gateway" && Object.keys(sectionErrors).length === 0,
    at: new Date().toISOString(),
    notice:
      notice ??
      (Object.keys(sectionErrors).length > 0
        ? "Not fully live: the gateway could not be read for the sections marked below."
        : null),
    waiting,
    running,
    delivered,
    sectionErrors,
  };
}

/** The gateway's approval page for one WorkItem and action: only `wi` and `action`, never a token (ADR 0021). */
function approvalUrl(workItemId: string, desk: string): HomeAsk["action"] {
  const page = process.env.NASIR_APPROVE_URL?.trim();
  if (!page || !URL.canParse(page) || (desk !== "approve start" && desk !== "approve delivery")) return null;
  const base = new URL(page);
  if (base.username || base.password || base.search || base.hash) return null;
  const link = new URL(`${base.pathname.replace(/\/+$/, "")}/approve`, base);
  link.searchParams.set("wi", workItemId);
  link.searchParams.set("action", desk === "approve start" ? "start" : "deliver");
  return { label: desk === "approve start" ? "Start" : "Deliver", url: link.toString() };
}

function asksFrom(listed: Row[]): HomeAsk[] {
  return listed.map((row) => {
    const stale = row.stale === true;
    const recordId = text(row.workItemId);
    return {
      recordId,
      title: text(row.title),
      desk: text(row.desk),
      status: text(row.status),
      reason: text(row.reason),
      headSha: typeof row.sha === "string" ? row.sha : null,
      stale,
      // A stale ask's WorkItem is gone, so nothing can act on it.
      action: stale ? null : approvalUrl(recordId, text(row.desk)),
    };
  });
}

async function casesFrom(read: (path: string) => Promise<unknown>): Promise<HomeCase[]> {
  const listed = rows(await read("/v1/cases"));
  const open = listed.filter((row) => Number(row.openTasks ?? 0) > 0).slice(0, MAX_CASES);
  return Promise.all(
    open.map(async (row): Promise<HomeCase> => {
      const caseId = text(row.id);
      const body = record(await read(`/v1/cases/${encodeURIComponent(caseId)}`));
      // The latest NoteAdded fact of each Task, in the Case's own order (facts come oldest first).
      const notes = new Map<string, string>();
      for (const fact of rows(body.facts)) {
        if (fact.kind !== "NoteAdded") continue;
        const payload = record(fact.payload);
        notes.set(text(payload.taskId), text(payload.text));
      }
      const tasks = rows(body.tasks);
      return {
        recordId: caseId,
        title: text(row.title),
        statusText: text(row.status),
        tasks: tasks
          .filter((task) => !isFinished(text(task.status)))
          .map((task) => ({
            recordId: text(task.id),
            title: text(task.title),
            worker: text(task.arm),
            status: text(task.status),
            statusText: TASK_TEXT[text(task.status)] ?? text(task.status),
            note: notes.get(text(task.id)) ?? null,
          })),
        closed: tasks.filter((task) => isFinished(text(task.status))).length,
        total: tasks.length,
      };
    }),
  );
}

/** What the WorkItem's state says about its checks. The gateway's list carries no per-check result, so this says so. */
function checksText(status: Row): string {
  const rounds = Number(status.reworkRounds ?? 0);
  const reworked = rounds > 0 ? `, after ${rounds} rework ${rounds === 1 ? "round" : "rounds"}` : "";
  switch (text(status.status)) {
    case "done":
      return `Passed validation before delivery${reworked}`;
    case "failed":
      return "Failed";
    default:
      return text(status.status);
  }
}

function deliveredFrom(listed: Row[]): HomeDelivered[] {
  return listed
    .flatMap((entry) => {
      const status = record(entry.workItemStatus);
      if (text(status.status) !== "done") return [];
      const pr = record(status.pr);
      const spend = record(status.spend);
      const last = record(status.lastFact);
      return [
        {
          recordId: text(record(entry.dispatch).workItemId),
          title: text(status.title),
          pr: typeof pr.number === "number" && typeof pr.url === "string" ? { number: pr.number, url: pr.url } : null,
          headSha: typeof status.headSha === "string" ? status.headSha : null,
          checks: checksText(status),
          spendUSD: typeof spend.spend === "number" ? spend.spend : null,
          budgetUSD: typeof spend.maxBudget === "number" ? spend.maxBudget : null,
          at: typeof last.at === "string" ? last.at : null,
        } satisfies HomeDelivered,
      ];
    })
    .sort((left, right) => (right.at ?? "").localeCompare(left.at ?? ""))
    .slice(0, MAX_DELIVERED);
}
