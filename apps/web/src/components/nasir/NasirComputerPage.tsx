// Nasir Computer (fork-only): read-only views of Nasir's computer. Files come from the gateway's computer routes and
// Live from an arm Task's transcript, both through this server's /api/nasir/computer/*. Text is shown as plain text,
// never rendered as HTML. There is no shell here.
import { useCallback, useEffect, useState } from "react";

type Status = { source: "gateway" | "fixture" | "unconfigured"; live: boolean; notice: string | null };
type Ok<T> = Status & { ok: true; value: T };
type Failed = Status & { ok: false; error: string; code: string | null; status: number };
type Result<T> = Ok<T> | Failed;
type Entry = { name: string; path: string; kind: string };
type Listing = { path: string; roots: string[]; entries: Entry[]; truncated: boolean };
type FileView = { path: string; size: number; text: string };
type Turn = { id: number; role: string; text: string };
type HomeTask = { recordId: string; title: string; worker: string; statusText: string };
type HomeCase = { recordId: string; title: string; tasks: HomeTask[] };

const ROOT = "/home/agentos/work";
const card = { border: "1px solid var(--border)", borderRadius: 10, background: "var(--card)", padding: "10px 12px" } as const;
const mono = { fontFamily: "var(--font-mono, ui-monospace, monospace)", fontSize: 11, opacity: 0.65 } as const;

async function get<T>(url: string, signal?: AbortSignal): Promise<Result<T>> {
  const init: RequestInit = signal ? { credentials: "same-origin", signal } : { credentials: "same-origin" };
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => null)) as Result<T> | null;
  if (body && typeof body === "object" && "ok" in body) return body;
  return {
    ok: false,
    error: `This server answered ${response.status}`,
    code: null,
    status: response.status,
    source: "gateway",
    live: false,
    notice: null,
  };
}

function useResult<T>(url: string | null, pollMs?: number): { result: Result<T> | null; failure: string | null } {
  const [result, setResult] = useState<Result<T> | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    setResult(null);
    setFailure(null);
    if (url === null) return;
    const controller = new AbortController();
    const load = async () => {
      try {
        setResult(await get<T>(url, controller.signal));
        setFailure(null);
      } catch (error) {
        if (!controller.signal.aborted) setFailure(error instanceof Error ? error.message : String(error));
      }
    };
    void load();
    const timer = pollMs ? window.setInterval(() => void load(), pollMs) : undefined;
    return () => {
      controller.abort();
      if (timer) window.clearInterval(timer);
    };
  }, [url, pollMs]);
  return { result, failure };
}

function Refusal({ result }: { result: Failed }) {
  return (
    <div style={{ ...card, borderColor: "var(--destructive)" }}>
      The gateway refused this: {result.error}
      {result.code ? <span style={mono}> ({result.code})</span> : null}
    </div>
  );
}

const parentOf = (path: string): string | null => {
  const parent = path.replace(/\/[^/]+\/?$/, "");
  return parent && parent !== path ? parent : null;
};

function FilesTab() {
  const [path, setPath] = useState(ROOT);
  const [file, setFile] = useState<string | null>(null);
  const listing = useResult<Listing>(`/api/nasir/computer/files?path=${encodeURIComponent(path)}`);
  const content = useResult<FileView>(file ? `/api/nasir/computer/file?path=${encodeURIComponent(file)}` : null);
  const roots = listing.result?.ok ? listing.result.value.roots : [];
  const up = parentOf(path);
  const canGoUp = up !== null && roots.some((root) => up === root || up.startsWith(`${root}/`));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) minmax(0, 2fr)", gap: 12, alignItems: "start" }}>
      <div style={card}>
        <div style={{ ...mono, marginBottom: 6, wordBreak: "break-all" }}>{path}</div>
        {listing.result === null ? <div style={{ opacity: 0.7 }}>{listing.failure ?? "Loading…"}</div> : null}
        {listing.result && !listing.result.ok ? <Refusal result={listing.result} /> : null}
        {listing.result?.ok ? (
          <>
            {roots.length > 1 ? (
              <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                {roots.map((root) => (
                  <button key={root} type="button" onClick={() => { setPath(root); setFile(null); }} style={{ ...mono, textDecoration: "underline", background: "none", border: 0, cursor: "pointer", color: "inherit" }}>
                    {root.split("/").pop()}
                  </button>
                ))}
              </div>
            ) : null}
            {canGoUp ? (
              <button type="button" onClick={() => { setPath(up); setFile(null); }} style={{ display: "block", background: "none", border: 0, cursor: "pointer", color: "inherit", padding: "2px 0" }}>
                ↑ ..
              </button>
            ) : null}
            {listing.result.value.entries.length === 0 ? <div style={{ opacity: 0.7 }}>Empty folder.</div> : null}
            {listing.result.value.entries.map((entry) => (
              <button
                key={entry.path}
                type="button"
                onClick={() => (entry.kind === "directory" ? (setPath(entry.path), setFile(null)) : setFile(entry.path))}
                style={{ display: "block", width: "100%", textAlign: "left", background: file === entry.path ? "var(--accent)" : "none", border: 0, cursor: "pointer", color: "inherit", padding: "2px 4px", borderRadius: 4 }}
              >
                {entry.kind === "directory" ? "▸ " : "  "}
                {entry.name}
                {entry.kind === "directory" ? "/" : ""}
              </button>
            ))}
            {listing.result.value.truncated ? <div style={{ ...mono, marginTop: 6 }}>More entries not shown.</div> : null}
          </>
        ) : null}
      </div>
      <div style={card}>
        {file === null ? <div style={{ opacity: 0.7 }}>Pick a file to read it. Read-only; text only.</div> : null}
        {file && content.result === null ? <div style={{ opacity: 0.7 }}>{content.failure ?? "Loading…"}</div> : null}
        {content.result && !content.result.ok ? <Refusal result={content.result} /> : null}
        {content.result?.ok ? (
          <>
            <div style={{ ...mono, marginBottom: 6, wordBreak: "break-all" }}>
              {content.result.value.path} · {content.result.value.size} bytes
            </div>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "var(--font-mono, ui-monospace, monospace)", fontSize: 12 }}>
              {content.result.value.text}
            </pre>
          </>
        ) : null}
      </div>
    </div>
  );
}

function LiveTab() {
  const [cases, setCases] = useState<HomeCase[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState<{ caseId: string; taskId: string } | null>(null);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/nasir/home", { credentials: "same-origin" });
      if (!response.ok) throw new Error(`This server answered ${response.status}`);
      const body = (await response.json()) as { running: HomeCase[]; notice: string | null; source: string };
      setCases(body.running);
      setError(body.source === "unconfigured" ? body.notice : null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const transcript = useResult<Turn[]>(
    pick ? `/api/nasir/computer/transcript?case=${pick.caseId}&task=${pick.taskId}` : null,
    4_000,
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) minmax(0, 2fr)", gap: 12, alignItems: "start" }}>
      <div style={card}>
        {cases === null ? <div style={{ opacity: 0.7 }}>{error ?? "Loading…"}</div> : null}
        {cases && cases.length === 0 ? <div style={{ opacity: 0.7 }}>No Case has an open Task.</div> : null}
        {cases?.map((item) => (
          <div key={item.recordId} style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 600 }}>{item.title}</div>
            <div style={mono}>{item.recordId}</div>
            {item.tasks.map((task) => (
              <button
                key={task.recordId}
                type="button"
                onClick={() => setPick({ caseId: item.recordId, taskId: task.recordId })}
                style={{ display: "block", width: "100%", textAlign: "left", background: pick?.taskId === task.recordId ? "var(--accent)" : "none", border: 0, cursor: "pointer", color: "inherit", padding: "3px 4px", borderRadius: 4 }}
              >
                <b style={{ textTransform: "capitalize" }}>{task.worker}</b> · {task.title} <span style={{ opacity: 0.7 }}>({task.statusText})</span>
              </button>
            ))}
          </div>
        ))}
      </div>
      <div style={card}>
        {pick === null ? <div style={{ opacity: 0.7 }}>Pick a Task to watch what its worker is saying. Refreshes every 4 seconds.</div> : null}
        {pick && transcript.result === null ? <div style={{ opacity: 0.7 }}>{transcript.failure ?? "Loading…"}</div> : null}
        {transcript.result && !transcript.result.ok ? <Refusal result={transcript.result} /> : null}
        {transcript.result?.ok ? (
          <>
            <div style={{ ...mono, marginBottom: 6 }}>
              {pick?.caseId} · {pick?.taskId}
            </div>
            {transcript.result.value.length === 0 ? <div style={{ opacity: 0.7 }}>No turns yet.</div> : null}
            {transcript.result.value.map((turn) => (
              <div key={`${turn.id}:${turn.role}`} style={{ margin: "6px 0" }}>
                <div style={mono}>{turn.role === "user" ? "Brief" : "Worker"} · #{turn.id}</div>
                <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{turn.text}</div>
              </div>
            ))}
          </>
        ) : null}
      </div>
    </div>
  );
}

export function NasirComputerPage() {
  const [tab, setTab] = useState<"files" | "live">("files");
  const status = useResult<Listing>(`/api/nasir/computer/files?path=${encodeURIComponent(ROOT)}`);
  const badge = status.result === null ? null : status.result.live ? "Live" : status.result.source === "fixture" ? "Not live: fixture" : "Not live";
  return (
    <div style={{ padding: 16, overflow: "auto", height: "100%", width: "100%", boxSizing: "border-box", maxWidth: 1100 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Nasir's computer</h1>
        {badge ? (
          <span style={{ fontSize: 11, fontWeight: 600, padding: "1px 8px", borderRadius: 10, background: status.result?.live ? "var(--success)" : "var(--warning)", color: "#fff" }}>
            {badge}
          </span>
        ) : null}
      </div>
      <p style={{ ...card, margin: "10px 0" }}>
        This is Nasir's own computer, read-only. T3's built-in terminal and file tree are different: they run on the machine that hosts this T3 server (donatello), not on Nasir's computer. There is no shell into Nasir's computer.
      </p>
      {status.result?.notice ? <p style={{ ...card, margin: "10px 0" }}>{status.result.notice}</p> : null}
      <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        {(["files", "live"] as const).map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setTab(name)}
            style={{ padding: "4px 14px", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer", background: tab === name ? "var(--primary)" : "var(--card)", color: tab === name ? "var(--primary-foreground, #fff)" : "inherit", fontWeight: 600 }}
          >
            {name === "files" ? "Files" : "Live"}
          </button>
        ))}
      </div>
      {tab === "files" ? <FilesTab /> : <LiveTab />}
    </div>
  );
}
