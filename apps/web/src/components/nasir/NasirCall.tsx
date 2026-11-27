// Nasir voice (fork-only): a Call button that embeds the voice service's compact /call page.
//
// The voice service owns the microphone, the local speech pipeline and the converse token it uses with Nasir's
// gateway; this component only asks the server where that page lives. Nothing here can approve, start or deliver.
//
// From a thread, the call joins that thread's Nasir conversation: the server trades the thread for a single-use
// ticket each time the dialog opens. Without one (the Floor page, or a thread Nasir has not answered in yet) the call
// is an ordinary one, and the dialog says so.
import { PhoneIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogPopup, DialogTitle } from "../ui/dialog";

type VoiceConfig = { readonly url: string | null; readonly reason: string | null };

/** A server without NASIR_VOICE_URL simply shows no Call button. */
async function loadVoiceConfig(): Promise<VoiceConfig> {
  try {
    const response = await fetch("/api/nasir/voice", { credentials: "same-origin" });
    if (!response.ok) throw new Error(`the server answered ${response.status}`);
    return (await response.json()) as VoiceConfig;
  } catch {
    return { url: null, reason: "the voice configuration could not be read" };
  }
}

function useVoiceConfig(): VoiceConfig | null {
  const [config, setConfig] = useState<VoiceConfig | null>(null);
  useEffect(() => {
    let live = true;
    void loadVoiceConfig().then((loaded) => {
      if (live) setConfig(loaded);
    });
    return () => {
      live = false;
    };
  }, []);
  return config;
}

type CallTicket = { readonly ticket: string | null; readonly reason: string | null };

async function loadCallTicket(threadId: string): Promise<CallTicket> {
  try {
    const response = await fetch(
      `/api/nasir/voice/ticket?threadId=${encodeURIComponent(threadId)}`,
      { method: "POST", credentials: "same-origin" },
    );
    if (!response.ok) throw new Error(`the server answered ${response.status}`);
    return (await response.json()) as CallTicket;
  } catch {
    return { ticket: null, reason: "the server could not issue a call ticket" };
  }
}

export function NasirCallButton(props: {
  readonly compact?: boolean;
  /** The thread whose Nasir conversation the call joins. */
  readonly threadId?: string;
}) {
  const config = useVoiceConfig();
  const [open, setOpen] = useState(false);
  // Null while a thread's ticket loads; a call outside a thread has none to wait for.
  const [threadTicket, setThreadTicket] = useState<CallTicket | null>(null);
  const ticket = props.threadId ? threadTicket : { ticket: null, reason: null };
  // A ticket is single use, so each open asks for its own and ignores an answer meant for an earlier one.
  const opened = useRef(0);
  const { threadId } = props;
  const changeOpen = (next: boolean) => {
    const current = ++opened.current;
    setOpen(next);
    setThreadTicket(null);
    if (next && threadId) {
      void loadCallTicket(threadId).then((loaded) => {
        if (opened.current === current) setThreadTicket(loaded);
      });
    }
  };
  if (!config?.url) return null;
  const callUrl = ticket?.ticket
    ? `${config.url}/call?ticket=${encodeURIComponent(ticket.ticket)}`
    : `${config.url}/call`;
  const secure =
    typeof window === "undefined" ||
    window.location.protocol !== "https:" ||
    config.url.startsWith("https:");
  const label = props.compact ? null : "Call Nasir";
  return (
    <>
      <Button
        type="button"
        size={props.compact ? "icon-sm" : "sm"}
        variant="ghost"
        aria-label="Call Nasir"
        title="Call Nasir"
        onClick={() => changeOpen(true)}
      >
        <PhoneIcon />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogPopup className="w-[min(620px,calc(100vw-1.5rem))] max-w-none flex-col overflow-hidden p-0 max-h-[calc(100dvh-2rem)]">
          <DialogHeader className="shrink-0 px-5 pb-3 pt-4 pr-12">
            <DialogTitle className="text-base">Call Nasir</DialogTitle>
            <DialogDescription>
              Talk and listen. Nasir can read and answer; this call cannot approve, start or deliver
              anything.
            </DialogDescription>
          </DialogHeader>
          {!secure ? (
            <div className="px-5 pb-5 text-sm text-muted-foreground">
              The voice service is at {config.url}, but this page is HTTPS and the browser blocks an
              insecure call frame. Set NASIR_VOICE_URL to an HTTPS origin.
            </div>
          ) : ticket ? (
            <iframe
              src={callUrl}
              title="Nasir call"
              allow="microphone; autoplay"
              className="block h-[min(68dvh,680px)] w-full border-0 bg-[#0e1417]"
            />
          ) : (
            <div className="h-[min(68dvh,680px)] w-full bg-[#0e1417]" />
          )}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t px-5 py-3 text-xs text-muted-foreground">
            {ticket?.ticket ? (
              <span>This call continues this thread's conversation.</span>
            ) : ticket?.reason ? (
              <span>Not tied to this thread: {ticket.reason}.</span>
            ) : null}
            <span>Approvals stay on your paired device.</span>
            {/* A ticket is single use and the frame spends it, so only an ordinary call opens in a tab. */}
            {ticket && !ticket.ticket ? (
              <a
                href={callUrl}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 underline underline-offset-2"
              >
                Open in a new tab
              </a>
            ) : null}
          </div>
        </DialogPopup>
      </Dialog>
    </>
  );
}
