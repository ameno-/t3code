// Nasir voice (fork-only): a Call button that embeds the voice service's compact /call page.
//
// The voice service owns the microphone, the local speech pipeline and the converse token it uses with Nasir's
// gateway; this component only asks the server where that page lives. Nothing here can approve, start or deliver.
import { PhoneIcon } from "lucide-react";
import { useEffect, useState } from "react";
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

export function NasirCallButton(props: { readonly compact?: boolean }) {
  const config = useVoiceConfig();
  const [open, setOpen] = useState(false);
  if (!config?.url) return null;
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
        onClick={() => setOpen(true)}
      >
        <PhoneIcon />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup className="w-[min(620px,calc(100vw-1.5rem))] max-w-none flex-col overflow-hidden p-0 max-h-[calc(100dvh-2rem)]">
          <DialogHeader className="shrink-0 px-5 pb-3 pt-4 pr-12">
            <DialogTitle className="text-base">Call Nasir</DialogTitle>
            <DialogDescription>
              Talk and listen. Nasir can read and answer; this call cannot approve, start or deliver
              anything.
            </DialogDescription>
          </DialogHeader>
          {secure ? (
            <iframe
              src={`${config.url}/call`}
              title="Nasir call"
              allow="microphone; autoplay"
              className="block h-[min(68dvh,680px)] w-full border-0 bg-[#0e1417]"
            />
          ) : (
            <div className="px-5 pb-5 text-sm text-muted-foreground">
              The voice service is at {config.url}, but this page is HTTPS and the browser blocks an
              insecure call frame. Set NASIR_VOICE_URL to an HTTPS origin.
            </div>
          )}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t px-5 py-3 text-xs text-muted-foreground">
            <span>Approvals stay on your paired device.</span>
            <a
              href={`${config.url}/call`}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 underline underline-offset-2"
            >
              Open in a new tab
            </a>
          </div>
        </DialogPopup>
      </Dialog>
    </>
  );
}
