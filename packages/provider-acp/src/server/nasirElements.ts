// Nasir's inline elements over ACP, opt-in per instance (`T3_NASIR_ELEMENTS=1`). The bridge's app and { order, nonce }
// ride the tool call's `rawOutput`, since T3 drops an embedded resource's uri and mime type. A click is `inline_action`,
// forwarded as the ACP request `_nasir/element_action`; nothing else is callable.
import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import { MCP_APP_MIME_TYPE, MCP_APP_RESOURCE_SCHEME } from "@t3tools/shared/mcpApp";
import * as Predicate from "effect/Predicate";

export const NASIR_ELEMENT_TOOL = "show_element";
export const NASIR_ELEMENT_ACTION_TOOL = "inline_action";
export const NASIR_ELEMENT_ACTION_METHOD = "_nasir/element_action";
/** Advertised in `clientCapabilities._meta`; Nasir's bridge sends a `ui://` resource only to a client that did. */
export const NASIR_ELEMENTS_CAPABILITY = "nasir.inlineElements";

export interface NasirElement {
  readonly resourceUri: string;
  /** The resource block as `snapshotMcpApp` reads it: `{ uri, mimeType, text }`. */
  readonly resource: Record<string, unknown>;
  readonly structuredContent: Record<string, unknown>;
  readonly text: string;
}

/**
 * The element a Nasir `show_element` tool call carries in its `rawOutput`, or undefined when it carries none. The app
 * cannot ride a content block: `acpContentBlockDisplayText` (runtimeModel.ts) turns an embedded resource into its text and
 * drops the uri and mime type, so Nasir's bridge puts it in `rawOutput.resource`, which reaches this adapter whole.
 */
export function readNasirElement(rawOutput: unknown): NasirElement | undefined {
  if (!Predicate.isObject(rawOutput)) return undefined;
  const { structuredContent, resource } = rawOutput;
  if (!Predicate.isObject(structuredContent) || !Predicate.isObject(resource)) return undefined;
  if (
    typeof resource.uri !== "string" ||
    !resource.uri.startsWith(MCP_APP_RESOURCE_SCHEME) ||
    typeof resource.text !== "string" ||
    typeof resource.mimeType !== "string" ||
    resource.mimeType.replace(/\s+/g, "").toLowerCase() !== MCP_APP_MIME_TYPE
  ) {
    return undefined;
  }
  return {
    resourceUri: resource.uri,
    resource: { ...resource },
    structuredContent: { ...structuredContent },
    text: typeof rawOutput.output === "string" ? rawOutput.output : "",
  };
}

/** The one tool an element may call. Read-only: it records a choice for Nasir to check, so T3 asks no second time. */
export const nasirActionTool: ProviderAdapter.ProviderAdapterV2McpTool = {
  name: NASIR_ELEMENT_ACTION_TOOL,
  inputSchema: {
    type: "object",
    properties: { nonce: { type: "string" }, event: { type: "object" } },
    required: ["nonce", "event"],
  },
  _meta: { ui: { visibility: ["app"] } },
  annotations: { readOnlyHint: true, title: "Send your choice to Nasir" },
};

export function readNasirActionArguments(
  args: Record<string, unknown>,
): { readonly nonce: string; readonly event: Record<string, unknown> } | undefined {
  return typeof args.nonce === "string" && args.nonce !== "" && Predicate.isObject(args.event)
    ? { nonce: args.nonce, event: { ...args.event } }
    : undefined;
}

const failure = (text: string): ProviderAdapter.ProviderAdapterV2McpCallToolResult => ({
  content: [{ type: "text", text }],
  isError: true,
});

export const nasirActionRefused = failure("The action needs a nonce and an event.");

/** The bridge's answer is an MCP tool result already; anything else is a failure the person can retry. */
export function readNasirActionResult(
  value: unknown,
): ProviderAdapter.ProviderAdapterV2McpCallToolResult {
  if (!Predicate.isObject(value) || !Array.isArray(value.content)) {
    return failure("Nasir's answer was not understood.");
  }
  return {
    content: value.content,
    ...(Predicate.isObject(value.structuredContent)
      ? { structuredContent: value.structuredContent }
      : {}),
    ...(value.isError === true ? { isError: true } : {}),
  };
}
