// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const FIXTURE = NodePath.join(import.meta.dirname, "../../../nasir/fixtures/home-gateway.json");

// readHome caches for a few seconds at module level, so each case loads a fresh module.
async function loadHome(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const key of ["NASIR_HOME_FIXTURE", "NASIR_GATEWAY_URL", "NASIR_GATEWAY_TOKEN_FILE", "NASIR_APPROVE_URL"]) {
    vi.stubEnv(key, env[key] ?? "");
  }
  return import("./nasirHome.ts");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("nasirHome", () => {
  it("says it is not connected, and shows nothing, when no gateway is configured", async () => {
    const { readHome } = await loadHome({});
    const home = await readHome();
    expect(home).toMatchObject({ source: "unconfigured", live: false, waiting: [], running: [], delivered: [] });
    expect(home.notice).toContain("Not connected");
  });

  it("reads recorded responses through the same code and labels them not live", async () => {
    const { readHome } = await loadHome({ NASIR_HOME_FIXTURE: FIXTURE, NASIR_APPROVE_URL: "https://approve.example/" });
    const home = await readHome();
    expect(home.source).toBe("fixture");
    expect(home.live).toBe(false);
    expect(home.notice).toContain("Not live");

    // Start and Deliver link to the approval page with only wi and action; an owner question has no button.
    const byId = Object.fromEntries(home.waiting.map((ask) => [ask.recordId, ask.action]));
    expect(byId["wi_0a1b2c3d"]).toEqual({ label: "Deliver", url: "https://approve.example/approve?wi=wi_0a1b2c3d&action=deliver" });
    expect(byId["wi_4e5f6a7b"]).toEqual({ label: "Start", url: "https://approve.example/approve?wi=wi_4e5f6a7b&action=start" });
    expect(byId["wi_8c9d0e1f"]).toBeNull();

    // Only Cases with an open Task, each Task's latest note, and closed Tasks counted but not listed.
    expect(home.running.map((c) => c.recordId)).toEqual(["case_k3m9q7x2", "case_p5r8t2v6"]);
    const first = home.running[0]!;
    expect(first.closed).toBe(1);
    expect(first.tasks.map((task) => task.recordId)).toEqual(["task_a1a1a1a1", "task_b2b2b2b2", "task_c3c3c3c3"]);
    expect(first.tasks[0]?.note).toBe("Packet draft has 9 cited claims; checking the last two.");
    expect(first.tasks[1]?.note).toBeNull();

    // Delivered: done WorkItems only, newest first; the failed one and the gone one are left out.
    expect(home.delivered.map((item) => item.recordId)).toEqual(["wi_11112222", "wi_33334444"]);
  });

  it("shows the checks of the latest validated head only, with a timeout as null", async () => {
    const { readHome, checksFromFacts } = await loadHome({ NASIR_HOME_FIXTURE: FIXTURE });
    const home = await readHome();
    const reworked = home.delivered.find((item) => item.recordId === "wi_11112222")!;
    // The first head failed typecheck and timed out; only the head that was delivered counts.
    expect(reworked.checkResults?.map((check) => [check.name, check.passed])).toEqual([
      ["setup", true],
      ["typecheck", true],
      ["test", true],
      ["lint", true],
    ]);
    expect(reworked.checks).toBe("4 of 4 checks passed at aaaaaaa");
    expect(reworked.spendUSD).toBe(0.184);

    const facts = [
      { kind: "review", body: { sha: "x", evidence: { name: "test", run: "pnpm test", exitCode: null, passed: false, tail: "" } } },
      { kind: "progress", body: { sha: "y" } },
    ];
    expect(checksFromFacts(facts)).toEqual([{ name: "test", run: "pnpm test", exitCode: null, passed: false }]);
    expect(checksFromFacts([])).toEqual([]);
  });

  it("falls back to the one-line statement when a WorkItem's facts cannot be read", async () => {
    const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "nasir-home-"));
    const file = NodePath.join(dir, "gw.json");
    const recorded = JSON.parse(NodeFS.readFileSync(FIXTURE, "utf8")) as Record<string, unknown>;
    delete recorded["/v1/workitems/wi_33334444/facts"];
    NodeFS.writeFileSync(file, JSON.stringify(recorded));
    const { readHome } = await loadHome({ NASIR_HOME_FIXTURE: file });
    const item = (await readHome()).delivered.find((entry) => entry.recordId === "wi_33334444")!;
    expect(item.checkResults).toBeNull();
    expect(item.checks).toBe("Passed validation before delivery");
  });

  it("names the failing sections instead of faking an empty Home when the gateway is unreachable", async () => {
    const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "nasir-home-"));
    const token = NodePath.join(dir, "token");
    NodeFS.writeFileSync(token, "t\n");
    const { readHome } = await loadHome({ NASIR_GATEWAY_URL: "http://127.0.0.1:9", NASIR_GATEWAY_TOKEN_FILE: token });
    const home = await readHome();
    expect(home.live).toBe(false);
    expect(home.notice).toContain("Not fully live");
    expect(Object.keys(home.sectionErrors).toSorted()).toEqual(["Delivered", "Running now", "Waiting on you"]);
    expect(home.sectionErrors["Delivered"]).toContain("unreachable");
  });
});
