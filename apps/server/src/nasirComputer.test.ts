import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import * as NodePath from "node:path";

const FIXTURE = NodePath.join(import.meta.dirname, "../../../nasir/fixtures/home-gateway.json");

async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const key of ["NASIR_HOME_FIXTURE", "NASIR_GATEWAY_URL", "NASIR_GATEWAY_TOKEN_FILE"]) vi.stubEnv(key, env[key] ?? "");
  return import("./nasirComputer.ts");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("nasirComputer", () => {
  it("lists and reads files, labelled not live on a fixture", async () => {
    const computer = await load({ NASIR_HOME_FIXTURE: FIXTURE });
    const listing = await computer.listFiles("/home/agentos/work/notes");
    expect(listing).toMatchObject({ ok: true, source: "fixture", live: false });
    const file = await computer.readFile("/home/agentos/work/notes/hello.md");
    expect(file.ok && file.value.text).toBe("Hello from Nasir's computer.\n");
  });

  it("passes the gateway's refusal through in its own words and status", async () => {
    const computer = await load({ NASIR_HOME_FIXTURE: FIXTURE });
    const secret = await computer.readFile("/home/agentos/work/notes/imessage-options.md");
    expect(secret).toMatchObject({ ok: false, status: 403, code: "secret", error: "that file looks like a secret" });
    const link = await computer.listFiles("/home/agentos/cases/case_k3m9q7x2");
    expect(link).toMatchObject({ ok: false, status: 403, code: "symlink" });
  });

  it("refuses a relative path and a malformed Case or Task id before asking the gateway", async () => {
    const computer = await load({ NASIR_HOME_FIXTURE: FIXTURE });
    expect(await computer.readFile("notes/hello.md")).toMatchObject({ ok: false, status: 400, code: "invalid_request" });
    expect(await computer.listFiles("work\u0000")).toMatchObject({ ok: false, status: 400 });
    expect(await computer.readTranscript("../x", "task_a1a1a1a1")).toMatchObject({ ok: false, status: 400 });
    // A Case id that starts right but climbs out of the route must not reach the gateway either.
    expect(await computer.readTranscript("case_k3m9q7x2/../../stop", "task_a1a1a1a1")).toMatchObject({ ok: false, status: 400 });
    expect(await computer.readTranscript("case_k3m9q7x2", "task_a1a1a1a1 ; rm")).toMatchObject({ ok: false, status: 400 });
  });

  it("reads a transcript, and reports a Task with none as the gateway's 404", async () => {
    const computer = await load({ NASIR_HOME_FIXTURE: FIXTURE });
    const done = await computer.readTranscript("case_k3m9q7x2", "task_a1a1a1a1");
    expect(done.ok && done.value.map((turn) => turn.role)).toEqual(["user", "assistant", "assistant"]);
    expect(await computer.readTranscript("case_k3m9q7x2", "task_b2b2b2b2")).toMatchObject({ ok: false, status: 404, code: "no_transcript" });
  });

  it("is unconfigured, not empty, without a gateway", async () => {
    const computer = await load({});
    expect(await computer.listFiles("")).toMatchObject({ ok: false, status: 503, source: "unconfigured", code: "unconfigured" });
  });
});
