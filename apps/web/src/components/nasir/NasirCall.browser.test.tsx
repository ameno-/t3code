import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { render, stubGlobal } from "../../../test/render";

function voiceConfig(body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
}

async function loadCallButton(fetchImpl: typeof fetch) {
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

/** Answers the voice config, and each ticket request with the next ticket body. */
function voiceWithTickets(tickets: ReadonlyArray<unknown>) {
  let issued = 0;
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/nasir/voice") {
      return new Response(JSON.stringify({ url: "https://voice.example", reason: null }));
    }
    expect(url).toBe("/api/nasir/voice/ticket?threadId=thread%2F1");
    expect(init?.method).toBe("POST");
    return new Response(JSON.stringify(tickets[issued++]));
  });
}

const callFrame = () =>
  document.querySelector<HTMLIFrameElement>('iframe[title="Nasir call"]')?.getAttribute("src");

it("joins the thread's conversation with a fresh ticket each time the call opens", async () => {
  const { NasirCallButton, restore } = await loadCallButton(
    voiceWithTickets([
      { ticket: "t one", reason: null },
      { ticket: "t-two", reason: null },
    ]),
  );
  try {
    await using screen = await render(<NasirCallButton threadId="thread/1" />);
    const button = screen.getByRole("button", { name: "Call Nasir" });
    await button.click();
    await expect.poll(callFrame).toBe("https://voice.example/call?ticket=t%20one");
    await expect
      .element(page.getByText("This call continues this thread's conversation."))
      .toBeVisible();
    // The frame spends the ticket, so a second tab could not use it.
    expect(page.getByRole("link", { name: "Open in a new tab" }).query()).toBeNull();

    await userEvent.keyboard("{Escape}");
    await expect.poll(callFrame).toBeUndefined();
    await button.click();
    await expect.poll(callFrame).toBe("https://voice.example/call?ticket=t-two");
  } finally {
    restore[Symbol.dispose]();
  }
});

it("places an ordinary call, and says why, when the thread has no Nasir conversation", async () => {
  const { NasirCallButton, restore } = await loadCallButton(
    voiceWithTickets([{ ticket: null, reason: "this thread has no Nasir conversation yet" }]),
  );
  try {
    await using screen = await render(<NasirCallButton threadId="thread/1" />);
    await screen.getByRole("button", { name: "Call Nasir" }).click();
    await expect.poll(callFrame).toBe("https://voice.example/call");
    await expect
      .element(
        page.getByText("Not tied to this thread: this thread has no Nasir conversation yet."),
      )
      .toBeVisible();
    await expect.element(page.getByRole("link", { name: "Open in a new tab" })).toBeVisible();
  } finally {
    restore[Symbol.dispose]();
  }
});
