// Nasir Floor (fork-only): one read-only snapshot of what Nasir and its arms are doing, for the Floor page.
//
// It reads the gateway with the same converse/read token as the ACP bridge; nothing here approves, steers or
// stops, and NASIR_FLOOR_DEMO=1 (or no gateway) serves a time-driven demo labelled "demo".
import * as NodeFS from "node:fs";

export type FloorTask = {
  readonly id: string;
  readonly caseId: string;
  readonly caseTitle: string;
  readonly title: string;
  readonly arm: string;
  readonly status: string;
  readonly note: string | null;
};
export type FloorAsk = {
  readonly workItemId: string;
  readonly title: string;
  readonly desk: string;
  readonly reason: string;
  readonly approveUrl: string | null;
};
export type FloorSnapshot = {
  readonly source: "gateway" | "demo";
  readonly at: string;
  readonly error: string | null;
  readonly tasks: ReadonlyArray<FloorTask>;
  readonly asks: ReadonlyArray<FloorAsk>;
};

const CACHE_MS = 3_000;
const MAX_CASES = 10;
let cached: { readonly at: number; readonly snapshot: FloorSnapshot } | undefined;

export async function readFloor(): Promise<FloorSnapshot> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.snapshot;
  const url = process.env.NASIR_GATEWAY_URL?.trim();
  const tokenFile = process.env.NASIR_GATEWAY_TOKEN_FILE?.trim();
  const snapshot =
    process.env.NASIR_FLOOR_DEMO === "1" || !url || !tokenFile
      ? demoSnapshot(Date.now())
      : await gatewaySnapshot(url.replace(/\/+$/, ""), tokenFile).catch(
          (error: unknown): FloorSnapshot => ({
            source: "gateway",
            at: new Date().toISOString(),
            error: error instanceof Error ? error.message : String(error),
            tasks: [],
            asks: [],
          }),
        );
  cached = { at: Date.now(), snapshot };
  return snapshot;
}

type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] =>
  Array.isArray(value)
    ? value.filter((row): row is Row => typeof row === "object" && row !== null)
    : [];
const text = (value: unknown): string =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
const record = (value: unknown): Row =>
  typeof value === "object" && value !== null ? (value as Row) : {};

async function gatewaySnapshot(url: string, tokenFile: string): Promise<FloorSnapshot> {
  const token = NodeFS.readFileSync(tokenFile, "utf8").trim();
  const read = async (path: string): Promise<unknown> => {
    const response = await fetch(`${url}${path}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`GET ${path} failed (status ${response.status})`);
    return response.json();
  };
  const [listed, asks] = await Promise.all([
    read("/v1/cases").then(rows),
    read("/v1/asks").then(rows, () => [] as Row[]),
  ]);
  // Only Cases with an open Task are read one by one, newest first, as /now does in the ACP bridge.
  const open = listed.filter((row) => Number(row.openTasks ?? 0) > 0).slice(0, MAX_CASES);
  const cases = await Promise.all(
    open.map(async (row) => ({
      row,
      snapshot: await read(`/v1/cases/${encodeURIComponent(text(row.id))}`).catch(() => undefined),
    })),
  );
  const approvePage = process.env.NASIR_APPROVE_URL?.trim();
  const tasks = cases.flatMap(({ row, snapshot }) => {
    const body = record(snapshot);
    const notes = new Map(
      rows(body.facts)
        .filter((fact) => fact.kind === "NoteAdded")
        .map(
          (fact) => [text(record(fact.payload).taskId), text(record(fact.payload).text)] as const,
        ),
    );
    return rows(body.tasks).map((task): FloorTask => ({
      id: text(task.id),
      caseId: text(row.id),
      caseTitle: text(row.title),
      title: text(task.title),
      arm: text(task.arm),
      status: text(task.status),
      note: notes.get(text(task.id)) ?? null,
    }));
  });
  return {
    source: "gateway",
    at: new Date().toISOString(),
    error: null,
    tasks,
    asks: asks
      .filter((row) => row.stale !== true)
      .map((row): FloorAsk => ({
        workItemId: text(row.workItemId),
        title: text(row.title),
        desk: text(row.desk),
        reason: text(row.reason),
        approveUrl:
          approvePage && (row.desk === "approve start" || row.desk === "approve delivery")
            ? `${approvePage.replace(/\/+$/, "")}/approve?wi=${encodeURIComponent(text(row.workItemId))}&action=${row.desk === "approve start" ? "start" : "deliver"}`
            : null,
      })),
  };
}

const DEMO_TASKS: ReadonlyArray<{ readonly title: string; readonly arm: string }> = [
  { title: "Research T3 fork options", arm: "baashe" },
  { title: "Add /now command", arm: "faris" },
  { title: "Check login drill", arm: "qasim" },
  { title: "Survey Pi extension API", arm: "baashe" },
  { title: "Wire the factory feed", arm: "faris" },
  { title: "Review PR #508", arm: "qasim" },
];
const DEMO_NOTES: Record<string, ReadonlyArray<string>> = {
  baashe: [
    "Read 14 sources, 3 conflict",
    "Packet sealed, 9 claims cited",
    "Searching for primary docs",
  ],
  faris: ["Branch pushed, 2 files changed", "Tests running in the VM", "Fixing a type error"],
  qasim: [
    "Checking claim 4 against source",
    "Verdict: 1 claim unsupported",
    "Reproduced the failure",
  ],
};

/** Six Tasks that walk the line on a 60 s loop, offset 10 s apart, so the page always has something moving. */
function demoSnapshot(now: number): FloorSnapshot {
  const seconds = now / 1000;
  const tasks = DEMO_TASKS.map((task, index): FloorTask => {
    const t = (seconds + index * 10) % 60;
    const cycle = Math.floor((seconds + index * 10) / 60);
    const status =
      t < 6
        ? "open"
        : t < 12
          ? "assigned"
          : t < 36
            ? "working"
            : t < 42
              ? index % 3 === 0
                ? "blocked"
                : "working"
              : t < 50
                ? "done_proposed"
                : "closed";
    const notes = DEMO_NOTES[task.arm] ?? [];
    return {
      id: `task_demo${index}x${cycle}`,
      caseId: "case_demo0001",
      caseTitle: "Demo Case",
      title: task.title,
      arm: task.arm,
      status,
      note:
        status === "blocked"
          ? "Needs your call on scope"
          : status === "done_proposed"
            ? "Done, waiting for Qasim's check"
            : status === "open"
              ? null
              : (notes[Math.floor(t / 8) % notes.length] ?? null),
    };
  });
  const blocked = tasks.find((task) => task.status === "blocked");
  return {
    source: "demo",
    at: new Date(now).toISOString(),
    error: null,
    tasks,
    asks: blocked
      ? [
          {
            workItemId: "wi_demo0001",
            title: blocked.title,
            desk: "approve start",
            reason: "scope: docs/**",
            approveUrl: null,
          },
        ]
      : [],
  };
}
