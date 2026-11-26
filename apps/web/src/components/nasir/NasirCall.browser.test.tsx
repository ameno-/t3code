import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import { render, stubGlobal } from "../../../test/render";

function voiceConfig(body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
}

async function loadCallButton(fetchImpl: () => Promise<Response>) {
  vi.resetModules();
  const restore = stubGlobal("fetch", fetchImpl);
  const { NasirCallButton } = await import("./NasirCall");
  return { NasirCallButton, restore };
}

it("opens the voice service's /call page in a microphone-enabled frame", async () => {
  const { NasirCallButton, restore } = await loadCallButton(
    voiceConfig({ url: "https://voice.example", reason: null }),
  );
  try {
    await using screen = await render(<NasirCallButton />);
    const button = screen.getByRole("button", { name: "Call Nasir" });
    await expect.element(button).toBeVisible();
    await button.click();

    await expect.element(page.getByRole("dialog")).toBeVisible();
    const frame = document.querySelector<HTMLIFrameElement>('iframe[title="Nasir call"]');
    expect(frame?.getAttribute("src")).toBe("https://voice.example/call");
    expect(frame?.getAttribute("allow")).toContain("microphone");
    await expect.element(page.getByText("Approvals stay on your paired device.")).toBeVisible();
  } finally {
    restore[Symbol.dispose]();
  }
});

it("shows no Call button when the server has no voice URL", async () => {
  const fetchImpl = voiceConfig({ url: null, reason: "NASIR_VOICE_URL is not set" });
  const { NasirCallButton, restore } = await loadCallButton(fetchImpl);
  try {
    await using screen = await render(<NasirCallButton />);
    await expect.poll(() => fetchImpl.mock.calls.length).toBe(1);
    expect(screen.getByRole("button", { name: "Call Nasir" }).query()).toBeNull();
  } finally {
    restore[Symbol.dispose]();
  }
});
