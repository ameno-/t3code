// Nasir Floor (fork-only): a live factory view of Nasir and its arms. Polls the server's read-only
// /api/nasir/floor snapshot; nothing here writes to Nasir.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { NasirCallButton } from "../nasir/NasirCall";

type FloorTask = {
  id: string;
  caseId: string;
  caseTitle: string;
  title: string;
  arm: string;
  status: string;
  note: string | null;
};
type FloorAsk = { workItemId: string; title: string; desk: string; reason: string; approveUrl: string | null };
type FloorSnapshot = {
  source: "gateway" | "demo";
  at: string;
  error: string | null;
  tasks: FloorTask[];
  asks: FloorAsk[];
};

const STATIONS = ["Intake", "Working", "Checks", "Waiting on you", "Delivered"] as const;
const POLL_MS = 3_000;

const WORKERS: Record<string, { name: string; role: string; color: string; station: number; x: number }> = {
  nasir: { name: "Nasir", role: "Orchestrator", color: "#45707e", station: 0, x: 0.5 },
  baashe: { name: "Baashe", role: "Research", color: "#3a6ab4", station: 1, x: 0.2 },
  faris: { name: "Faris", role: "Builder", color: "#4a7550", station: 1, x: 0.7 },
  qasim: { name: "Qasim", role: "Critic", color: "#8a5a6a", station: 2, x: 0.5 },
};

function stationOf(status: string): number {
  switch (status) {
    case "open":
      return 0;
    case "assigned":
    case "working":
      return 1;
    case "done_proposed":
      return 2;
    case "blocked":
    case "needs_help":
      return 3;
    default:
      return 4;
  }
}

function useFloor(): { snapshot: FloorSnapshot | null; failure: string | null } {
  const [snapshot, setSnapshot] = useState<FloorSnapshot | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch("/api/nasir/floor", {
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`The server answered ${response.status}`);
        setSnapshot((await response.json()) as FloorSnapshot);
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
  return { snapshot, failure };
}

function Worker(props: { id: string; tasks: FloorTask[]; selected: boolean; onSelect: () => void }) {
  const worker = WORKERS[props.id]!;
  const busy =
    props.id === "nasir"
      ? props.tasks.some((task) => task.status === "open")
      : props.tasks.some((task) => task.arm === props.id && (task.status === "assigned" || task.status === "working")) ||
        (props.id === "qasim" && props.tasks.some((task) => task.status === "done_proposed"));
  return (
    <button
      type="button"
      onClick={props.onSelect}
      className={`nasir-floor-worker${busy ? " is-busy" : ""}`}
      style={{ left: `calc(${worker.station * 20 + worker.x * 20}% - 35px)` }}
      aria-pressed={props.selected}
      aria-label={`${worker.name}, ${worker.role}, ${busy ? "working" : "idle"}`}
    >
      <svg viewBox="0 0 60 80" width="60" height="80" aria-hidden="true">
        <rect x="14" y="4" width="32" height="26" rx="6" fill={worker.color} />
        <circle cx="24" cy="16" r="3.5" fill="#fff" />
        <circle cx="36" cy="16" r="3.5" fill="#fff" />
        <rect x="18" y="32" width="24" height="30" rx="5" fill={worker.color} opacity="0.85" />
        <g className="nasir-floor-arm">
          <rect x="42" y="34" width="14" height="6" rx="3" fill={worker.color} />
          <rect x="52" y="28" width="6" height="16" rx="2" fill="#555" />
        </g>
        <rect x="20" y="62" width="7" height="14" rx="2" fill="#555" />
        <rect x="33" y="62" width="7" height="14" rx="2" fill="#555" />
      </svg>
      <div style={{ fontSize: 11, fontWeight: props.selected ? 700 : 400 }}>{worker.name}</div>
      <div style={{ fontSize: 10, opacity: 0.6 }}>{busy ? "working" : "idle"}</div>
    </button>
  );
}

export function FloorPage() {
  const { snapshot, failure } = useFloor();
  const [selected, setSelected] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  useLayoutEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  const tasks = snapshot?.tasks ?? [];
  const columnWidth = width / 5;
  const crateWidth = Math.min(112, Math.max(72, columnWidth - 12));
  const perRow = Math.max(1, Math.floor((columnWidth - 8) / (crateWidth + 4)));
  const placed = useMemo(() => {
    const slots = [0, 0, 0, 0, 0];
    return tasks.map((task) => {
      const station = stationOf(task.status);
      const slot = slots[station]!++;
      return { task, station, slot };
    });
  }, [tasks]);
  const waiting = tasks.filter((task) => stationOf(task.status) === 3).length;
  const open = tasks.filter((task) => stationOf(task.status) < 4).length;
  const chosen = selected ? WORKERS[selected] : null;
  const chosenTasks = selected
    ? tasks.filter((task) => (selected === "nasir" ? task.status === "open" : task.arm === selected) && task.status !== "closed")
    : [];

  return (
    <div className="nasir-floor" style={{ padding: 16, overflow: "auto", height: "100%", width: "100%", boxSizing: "border-box" }}>
      <style>{FLOOR_CSS}</style>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Nasir Floor</h1>
        <NasirCallButton />
      </div>
      <p style={{ margin: "2px 0 10px", fontSize: 12, opacity: 0.7 }}>
        {snapshot === null
          ? failure ?? "Loading…"
          : snapshot.source === "demo"
            ? "Demo data: no Nasir gateway is configured on this server."
            : snapshot.error
              ? `The gateway could not be read: ${snapshot.error}`
              : `Live from Nasir's gateway. ${open} open, ${tasks.length - open} done.`}
        {failure && snapshot ? ` Last refresh failed: ${failure}` : ""}
      </p>
      <div ref={stageRef} className="nasir-floor-stage">
        {STATIONS.map((name, index) => (
          <div key={name} className="nasir-floor-col" style={{ left: `${index * 20}%` }}>
            <h2>{name}</h2>
            {index === 3 && waiting > 0 ? <span className="nasir-floor-badge">{waiting} need you</span> : null}
          </div>
        ))}
        <div className="nasir-floor-belt" />
        {Object.keys(WORKERS).map((id) => (
          <Worker key={id} id={id} tasks={tasks} selected={selected === id} onSelect={() => setSelected(id)} />
        ))}
        {placed.map(({ task, station, slot }) => {
          const kind = task.status === "working" || task.status === "assigned" ? "working" : stationOf(task.status) === 3 ? "blocked" : task.status === "closed" || task.status === "cancelled" ? "closed" : "";
          return (
            <div
              key={`${task.caseId}:${task.id}`}
              className={`nasir-floor-crate ${kind}`}
              title={`${task.id}: ${task.title}${task.note ? ` — ${task.note}` : ""}`}
              style={{
                width: crateWidth,
                left: station * columnWidth + 6 + (slot % perRow) * (crateWidth + 4),
                top: 182 + Math.floor(slot / perRow) * 50,
              }}
            >
              <b>{task.arm}</b>
              <span>{task.title}</span>
            </div>
          );
        })}
      </div>
      <div className="nasir-floor-panel">
        {chosen ? (
          <>
            <h3 style={{ margin: "0 0 4px", fontSize: 13 }}>
              {chosen.name} <span style={{ opacity: 0.6, fontWeight: 400 }}>· {chosen.role}</span>
            </h3>
            {chosenTasks.length === 0 ? (
              <div style={{ opacity: 0.7 }}>Nothing assigned right now.</div>
            ) : (
              chosenTasks.map((task) => (
                <div key={task.id} style={{ opacity: 0.85, margin: "2px 0" }}>
                  <b>{task.id}</b> {task.title} ({task.status})
                  <br />
                  Latest note: {task.note ?? "none yet"}
                </div>
              ))
            )}
          </>
        ) : (
          <>
            <h3 style={{ margin: "0 0 4px", fontSize: 13 }}>Tap a worker</h3>
            <div style={{ opacity: 0.7 }}>Shows what it is doing and its latest note.</div>
          </>
        )}
        {snapshot && snapshot.asks.length > 0 ? (
          <div style={{ marginTop: 8 }}>
            <b>Waiting on you</b>
            {snapshot.asks.map((ask) => (
              <div key={ask.workItemId} style={{ margin: "2px 0" }}>
                <code>{ask.workItemId}</code> {ask.title} ({ask.desk}): {ask.reason}
                {ask.approveUrl ? (
                  <>
                    {" "}
                    <a href={ask.approveUrl} target="_blank" rel="noreferrer">
                      open the approval page
                    </a>
                  </>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const FLOOR_CSS = `
.nasir-floor-stage{position:relative;height:470px;border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--background)}
.nasir-floor-col{position:absolute;top:0;bottom:0;width:20%;border-right:1px dashed var(--border)}
.nasir-floor-col:last-of-type{border-right:0}
.nasir-floor-col h2{white-space:nowrap;font-size:11px;letter-spacing:.06em;text-transform:uppercase;opacity:.6;margin:8px 0 0;text-align:center;font-weight:600}
.nasir-floor-badge{white-space:nowrap;position:absolute;top:30px;left:50%;transform:translateX(-50%);background:var(--destructive);color:#fff;border-radius:10px;padding:1px 8px;font-size:11px}
.nasir-floor-belt{position:absolute;left:0;right:0;top:214px;height:14px;background-color:var(--muted);
 background-image:repeating-linear-gradient(90deg,transparent 0 14px,rgba(0,0,0,.14) 14px 16px);animation:nasir-floor-belt 1.2s linear infinite}
@keyframes nasir-floor-belt{to{background-position:16px 0}}
.nasir-floor-crate{position:absolute;height:42px;background:var(--card);border:1.5px solid var(--border);border-radius:6px;padding:3px 5px;font-size:10.5px;transition:left .9s ease,top .9s ease,opacity .5s}
.nasir-floor-crate b,.nasir-floor-crate span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nasir-floor-crate b{font-size:10px;opacity:.6;font-weight:600;text-transform:capitalize}
.nasir-floor-crate.working{border-color:var(--primary)}
.nasir-floor-crate.blocked{border-color:var(--destructive);animation:nasir-floor-pulse 1s infinite}
.nasir-floor-crate.closed{opacity:.75}
@keyframes nasir-floor-pulse{50%{box-shadow:0 0 0 4px color-mix(in srgb,var(--destructive) 25%,transparent)}}
.nasir-floor-worker{position:absolute;top:44px;width:70px;text-align:center;cursor:pointer;background:none;border:0;color:inherit;transition:left .9s ease}
.nasir-floor-worker.is-busy svg{animation:nasir-floor-bob .7s ease-in-out infinite alternate}
.nasir-floor-arm{transform-origin:50% 50%}
.nasir-floor-worker.is-busy .nasir-floor-arm{animation:nasir-floor-hammer .35s ease-in-out infinite alternate}
@keyframes nasir-floor-bob{to{transform:translateY(-4px)}}
@keyframes nasir-floor-hammer{from{transform:rotate(-18deg)}to{transform:rotate(22deg)}}
.nasir-floor-panel{margin-top:10px;border:1px solid var(--border);border-radius:10px;padding:10px;background:var(--card);min-height:84px;font-size:13px}
@media (prefers-reduced-motion:reduce){.nasir-floor-belt,.nasir-floor-worker.is-busy svg,.nasir-floor-worker.is-busy .nasir-floor-arm,.nasir-floor-crate.blocked{animation:none}}
`;
