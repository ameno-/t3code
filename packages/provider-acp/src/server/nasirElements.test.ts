import { describe, expect, it } from "vite-plus/test";

import {
  nasirActionTool,
  readNasirActionArguments,
  readNasirActionResult,
  readNasirElement,
} from "./nasirElements.ts";

const resource = {
  uri: "ui://acid-ui/inline-element",
  mimeType: "text/html;profile=mcp-app",
  text: "<!doctype html>",
};
const rawOutput = {
  output: "Showing an element.",
  structuredContent: { order: { combo: "inline" }, nonce: "n1" },
};

describe("readNasirElement", () => {
  it("reads the ui:// resource and the structured content a Nasir tool call carries in rawOutput", () => {
    expect(readNasirElement({ ...rawOutput, resource })).toEqual({
      resourceUri: "ui://acid-ui/inline-element",
      resource,
      structuredContent: rawOutput.structuredContent,
      text: "Showing an element.",
    });
  });

  it.each([
    ["no resource", rawOutput],
    [
      "a resource that is not an MCP app",
      { ...rawOutput, resource: { ...resource, mimeType: "text/html" } },
    ],
    [
      "a resource that is not ui://",
      { ...rawOutput, resource: { ...resource, uri: "https://example.com/x" } },
    ],
    [
      "a resource with no text",
      { ...rawOutput, resource: { uri: resource.uri, mimeType: resource.mimeType } },
    ],
    ["no structured content (no order or nonce to show)", { output: "x", resource }],
    ["no output at all", undefined],
  ])("reads nothing from %s", (_name, output) => {
    expect(readNasirElement(output)).toBeUndefined();
  });
});

describe("the one tool an element may call", () => {
  it("is callable by the app only and not read-only, so T3 asks before every action", () => {
    expect(nasirActionTool).toMatchObject({
      name: "inline_action",
      annotations: { title: "Send your choice to Nasir" },
      _meta: { ui: { visibility: ["app"] } },
    });
    expect(nasirActionTool.annotations).not.toHaveProperty("readOnlyHint");
  });

  it("needs a non-empty nonce and an event object", () => {
    expect(readNasirActionArguments({ nonce: "n", event: { id: "e" } })).toEqual({
      nonce: "n",
      event: { id: "e" },
    });
    expect(readNasirActionArguments({ nonce: "", event: {} })).toBeUndefined();
    expect(readNasirActionArguments({ nonce: "n", event: "text" })).toBeUndefined();
    expect(readNasirActionArguments({ event: {} })).toBeUndefined();
  });

  it("passes the bridge's answer through, including the settled marker, and fails anything else", () => {
    expect(
      readNasirActionResult({
        content: [{ type: "text", text: "This element was already answered." }],
        structuredContent: { settled: true },
        isError: true,
        extra: "dropped",
      }),
    ).toEqual({
      content: [{ type: "text", text: "This element was already answered." }],
      structuredContent: { settled: true },
      isError: true,
    });
    expect(readNasirActionResult({ content: [{ type: "text", text: "ok" }] })).toEqual({
      content: [{ type: "text", text: "ok" }],
    });
    expect(readNasirActionResult("nope")).toMatchObject({ isError: true });
    expect(readNasirActionResult(null)).toMatchObject({ isError: true });
  });
});
