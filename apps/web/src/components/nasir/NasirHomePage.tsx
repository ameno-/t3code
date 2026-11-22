// Nasir Home (fork-only): what Nasir is waiting on, running and has delivered, read from the gateway through the
// server's /api/nasir/home. Read-only. An ask's button opens the gateway's own approval page; nothing here approves.
import { useEffect, useState } from "react";

type Ask = {
  recordId: string;
  title: string;
  desk: string;
  status: string;
  reason: string;
  headSha: string | null;
  stale: boolean;
  action: { label: "Start" | "Deliver"; url: string } | null;
};
type Task = { recordId: string; title: string; worker: string; status: string; statusText: string; note: string | null };
type CaseView = { recordId: string; title: string; statusText: string; tasks: Task[]; closed: number; total: number };
type Delivered = {
  recordId: string;
  title: string;
  pr: { number: number; url: string } | null;
  headSha: string | null;
  checks: string;
  spendUSD: number | null;
  budgetUSD: number | null;
  at: string | null;
};
type Home = {
  source: "gateway" | "fixture" | "unconfigured";
  live: boolean;
  at: string;
  notice: string | null;
  waiting: Ask[];
  running: CaseView[];
  delivered: Delivered[];
  sectionErrors: Record<string, string>;
};

const POLL_MS = 4_000;

function useHome(): { home: Home | null; failure: string | null } {
  const [home, setHome] = useState<Home | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch("/api/nasir/home", { credentials: "same-origin", signal: controller.signal });
        if (!response.ok) throw new Error(`This server answered ${response.status}`);
        setHome((await response.json()) as Home);
        setFailure(null);
      } catch (error) {
        if (!controller.signal.aborted) setFailure(error instanceof Error ? error.message : String(error));
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, []);
  return { home, failure };
}

const mono = { fontFamily: "var(--font-mono, ui-monospace, monospace)", fontSize: 11, opacity: 0.65 } as const;
const card = { border: "1px solid var(--border)", borderRadius: 10, background: "var(--card)", padding: "10px 12px" } as const;
const usd = (value: number | null) => (value === null ? "unknown" : `$${value.toFixed(2)}`);

function Section(props: { title: string; count: number; error?: string | undefined; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 20 }}>
      <h2 style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 8px", opacity: 0.7 }}>
        {props.title} <span style={{ opacity: 0.6 }}>· {props.count}</span>
      </h2>
      {props.error ? (
        <div style={{ ...card, borderColor: "var(--destructive)" }}>Could not read this section: {props.error}</div>
      ) : (
        props.children
      )}
    </section>
  );
}

function AskRow({ ask }: { ask: Ask }) {
  return (
    <div style={{ ...card, display: "flex", gap: 12, alignItems: "flex-start", opacity: ask.stale ? 0.6 : 1 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{ask.title}</div>
        <div style={{ margin: "2px 0" }}>{ask.reason}</div>
        <div style={mono}>
          {ask.recordId} · {ask.desk}
          {ask.headSha ? ` · head ${ask.headSha}` : ""}
          {ask.stale ? " · stale: its WorkItem is gone" : ""}
        </div>
      </div>
      {ask.action ? (
        <a
          href={ask.action.url}
          target="_blank"
          rel="noreferrer"
          style={{ background: "var(--primary)", color: "var(--primary-foreground, #fff)", borderRadius: 8, padding: "6px 14px", fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}
        >
          {ask.action.label}
        </a>
      ) : (
        <span style={{ fontSize: 12, opacity: 0.7, maxWidth: 160, textAlign: "right" }}>
          {ask.stale ? "Nothing to approve" : "Answer on the host"}
        </span>
      )}
    </div>
  );
}

function CaseCard({ item }: { item: CaseView }) {
  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontWeight: 600 }}>{item.title}</div>
        <div style={mono}>
          {item.recordId} · {item.closed} of {item.total} done
        </div>
      </div>
      {item.tasks.length === 0 ? <div style={{ opacity: 0.7, marginTop: 4 }}>No open Tasks.</div> : null}
      {item.tasks.map((task) => (
        <div key={task.recordId} style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--border)" }}>
          <div>
            <b style={{ textTransform: "capitalize" }}>{task.worker}</b> · {task.title} <span style={{ opacity: 0.7 }}>({task.statusText})</span>
          </div>
          <div style={{ opacity: 0.8 }}>{task.note ? `Latest note: ${task.note}` : "No note yet."}</div>
          <div style={mono}>{task.recordId}</div>
        </div>
      ))}
    </div>
  );
}

function DeliveredRow({ item }: { item: Delivered }) {
  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontWeight: 600 }}>{item.title}</div>
        <div style={mono}>{item.recordId}</div>
      </div>
      <div style={{ margin: "2px 0" }}>
        {item.pr ? (
          <a href={item.pr.url} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
            PR #{item.pr.number}
          </a>
        ) : (
          "No PR recorded"
        )}{" "}
        · {item.checks} · spent {usd(item.spendUSD)}
        {item.budgetUSD !== null ? ` of ${usd(item.budgetUSD)}` : ""}
      </div>
      <div style={mono}>
        {item.headSha ? `head ${item.headSha}` : ""}
        {item.at ? ` · ${new Date(item.at).toLocaleString()}` : ""}
      </div>
    </div>
  );
}

export function NasirHomePage() {
  const { home, failure } = useHome();
  const badge = home === null ? null : home.live ? "Live" : home.source === "fixture" ? "Not live: fixture" : "Not live";
  return (
    <div style={{ padding: 16, overflow: "auto", height: "100%", width: "100%", boxSizing: "border-box", maxWidth: 920 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Nasir</h1>
        {badge ? (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "1px 8px",
              borderRadius: 10,
              background: home?.live ? "var(--success)" : "var(--warning)",
              color: "#fff",
            }}
          >
            {badge}
          </span>
        ) : null}
        {home ? <span style={mono}>read {new Date(home.at).toLocaleTimeString()}</span> : null}
      </div>
      {home === null ? <p style={{ opacity: 0.7 }}>{failure ?? "Loading…"}</p> : null}
      {failure && home ? <p style={{ color: "var(--destructive)" }}>The last refresh failed: {failure}</p> : null}
      {home?.notice ? <p style={{ ...card, marginTop: 10 }}>{home.notice}</p> : null}
      {home ? (
        <>
          <Section title="Waiting on you" count={home.waiting.length} error={home.sectionErrors["Waiting on you"]}>
            {home.waiting.length === 0 ? <div style={{ opacity: 0.7 }}>Nothing is waiting on you.</div> : null}
            <div style={{ display: "grid", gap: 8 }}>{home.waiting.map((ask) => <AskRow key={`${ask.recordId}:${ask.desk}`} ask={ask} />)}</div>
          </Section>
          <Section title="Running now" count={home.running.length} error={home.sectionErrors["Running now"]}>
            {home.running.length === 0 ? <div style={{ opacity: 0.7 }}>No Case has an open Task.</div> : null}
            <div style={{ display: "grid", gap: 8 }}>{home.running.map((item) => <CaseCard key={item.recordId} item={item} />)}</div>
          </Section>
          <Section title="Delivered" count={home.delivered.length} error={home.sectionErrors["Delivered"]}>
            {home.delivered.length === 0 ? <div style={{ opacity: 0.7 }}>Nothing delivered yet.</div> : null}
            <div style={{ display: "grid", gap: 8 }}>{home.delivered.map((item) => <DeliveredRow key={item.recordId} item={item} />)}</div>
          </Section>
        </>
      ) : null}
    </div>
  );
}
