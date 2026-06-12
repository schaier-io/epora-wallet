"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PopupDialog } from "@/components/ui/popup-dialog";
import { SparkleEasterEgg } from "@/components/layout/sparkle-easter-egg";

type Shortcut = { keys: string[]; label: string; sequence?: boolean };

const SHORTCUTS: Shortcut[] = [
  { keys: ["?"], label: "Show these shortcuts" },
  { keys: ["Esc"], label: "Close any open dialog or menu" },
  { keys: ["Tab"], label: "Next field" },
  { keys: ["Shift", "Tab"], label: "Previous field" },
  { keys: ["g", "h"], label: "Wallet home", sequence: true },
  { keys: ["g", "s"], label: "Send money", sequence: true },
  { keys: ["g", "r"], label: "Receive money", sequence: true },
  { keys: ["g", "p"], label: "People", sequence: true },
  { keys: ["g", "w"], label: "Wallet settings", sequence: true },
  { keys: ["g", "u"], label: "Scheduled payments", sequence: true },
  { keys: ["c"], label: "Create a new wallet" }
];

const NAV_TARGETS: Record<string, string> = {
  h: "?step=overview",
  s: "?action=send&step=configure",
  r: "?action=add-funds&step=configure",
  p: "?action=manage-people&step=configure",
  w: "?action=wallet-settings&step=configure",
  u: "?action=manage-streaming-payments&step=configure"
};

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

// Hidden reward: the Konami code (Up Up Down Down Left Right Left Right B A)
// opens a redeemable CRT terminal. A quiet nod for the curious.
const KONAMI_CODE = [
  "arrowup",
  "arrowup",
  "arrowdown",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "arrowleft",
  "arrowright",
  "b",
  "a"
];

export function KeyboardShortcutsHelp() {
  const [open, setOpen] = useState(false);
  const [eggOpen, setEggOpen] = useState(false);
  const router = useRouter();
  const pendingPrefixRef = useRef<{ key: string; expires: number } | null>(null);
  const konamiProgressRef = useRef(0);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      // Track the Konami code. Each correct key advances; any wrong key resets
      // (but a key that matches the start keeps the run alive).
      const konamiKey = event.key.toLowerCase();
      if (konamiKey === KONAMI_CODE[konamiProgressRef.current]) {
        konamiProgressRef.current += 1;
        if (konamiProgressRef.current === KONAMI_CODE.length) {
          konamiProgressRef.current = 0;
          setEggOpen(true);
        }
      } else {
        konamiProgressRef.current = konamiKey === KONAMI_CODE[0] ? 1 : 0;
      }

      if (event.key === "?") {
        event.preventDefault();
        setOpen(true);
        pendingPrefixRef.current = null;
        return;
      }

      const now = Date.now();
      const pending = pendingPrefixRef.current;
      if (pending && pending.key === "g" && now < pending.expires) {
        const key = event.key.toLowerCase();
        if (NAV_TARGETS[key]) {
          event.preventDefault();
          pendingPrefixRef.current = null;
          if (typeof window !== "undefined") {
            const target = `/user${NAV_TARGETS[key]}`;
            try {
              const wallet = new URLSearchParams(window.location.search).get("wallet");
              if (wallet && key !== "h") {
                router.push(`${target}&wallet=${wallet}`);
                return;
              }
            } catch {
              // fall through to plain target
            }
            router.push(target);
          }
          return;
        }
      }

      if (event.key.toLowerCase() === "g") {
        event.preventDefault();
        pendingPrefixRef.current = { key: "g", expires: now + 1200 };
        return;
      }

      if (event.key.toLowerCase() === "c") {
        event.preventDefault();
        pendingPrefixRef.current = null;
        router.push("/user?action=create-wallet&step=configure");
        return;
      }

      pendingPrefixRef.current = null;
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  return (
    <>
    <SparkleEasterEgg open={eggOpen} onOpenChange={setEggOpen} />
    <PopupDialog
      open={open}
      onOpenChange={setOpen}
      title="Keyboard shortcuts"
      description="Fly around without touching the mouse."
      className="max-w-md"
      >
        <ul className="divide-y divide-border/60">
        {SHORTCUTS.map((shortcut) => (
          <li
            key={shortcut.label}
            className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
          >
            <span className="text-sm text-foreground">{shortcut.label}</span>
            <span className="inline-flex items-center gap-1">
              {shortcut.keys.map((key, index) => (
                <span key={`${shortcut.label}-${index}`} className="inline-flex items-center gap-1">
                  {index > 0 ? (
                    <span aria-hidden="true" className="text-xs text-muted-foreground">
                      {shortcut.sequence ? "then" : "+"}
                    </span>
                  ) : null}
                  <kbd className="inline-flex min-w-[1.75rem] items-center justify-center rounded border border-border/70 bg-background/80 px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground">
                    {key}
                  </kbd>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </PopupDialog>
    </>
  );
}
