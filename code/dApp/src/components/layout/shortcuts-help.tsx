"use client";
import { useTranslations } from "next-intl";


import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PopupDialog } from "@/components/ui/popup-dialog";
import { SparkleEasterEgg } from "@/components/layout/sparkle-easter-egg";
import {
  CREATE_WALLET_TARGET,
  NAV_TARGETS,
  SHORTCUTS
} from "@/components/layout/shortcuts-catalog";

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

/**
 * Whether a modal owns the screen right now. Without this, `c` navigated to the
 * wallet-creation flow and `g h` navigated home while the risk gate was still up, because
 * `isTypingTarget` is false for the gate's `<button>` and nothing else looked. Matches both
 * the gate (`role="alertdialog"`) and `PopupDialog` (`role="dialog"`).
 */
function isModalOpen() {
  if (typeof document === "undefined") return false;
  return document.querySelector('[aria-modal="true"]') !== null;
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
  const i18n = useTranslations("ComponentsLayoutShortcutsHelp");
  const [open, setOpen] = useState(false);
  const [eggOpen, setEggOpen] = useState(false);
  const router = useRouter();
  const pendingPrefixRef = useRef<{ key: string; expires: number } | null>(null);
  const konamiProgressRef = useRef(0);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      // Before the Konami tracker too: nothing here should reach behind a modal.
      if (isModalOpen()) return;

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
        // Creating a wallet used to answer to a bare `c`. `c` is a browse-mode quick-nav key
        // in NVDA and JAWS, and the guard above only skips text fields, so a screen-reader
        // user pressing it anywhere else landed in the wallet-creation flow. It keeps the
        // same destination; it just asks for the same `g` prefix as every other jump.
        if (key === "c") {
          event.preventDefault();
          pendingPrefixRef.current = null;
          router.push(`/user${CREATE_WALLET_TARGET}`);
          return;
        }
        if (NAV_TARGETS[key]) {
          event.preventDefault();
          pendingPrefixRef.current = null;
          if (typeof window !== "undefined") {
            const target = `/user${NAV_TARGETS[key]}`;
            try {
              // `h` used to be excluded here, so "Wallet home" dropped `?wallet`. Losing the
              // param does not just change the URL: the auto-select effect then re-picks the
              // first card with a non-"Receive only" role -- not the wallet the user was in --
              // and runs its reset block, discarding every in-progress draft. Invisible with
              // one smart wallet, a silent wallet switch plus data loss with two.
              const wallet = new URLSearchParams(window.location.search).get("wallet");
              if (wallet) {
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
      title={i18n("keyboardShortcuts")}
      description={i18n("flyAroundWithoutTouchingTheMouse")}
      className="max-w-md"
      >
        <ul className="divide-y divide-border/60">
        {SHORTCUTS.map((shortcut) => (
          <li
            key={shortcut.label}
            className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0"
          >
            <span className="text-sm text-foreground">{shortcut.label}</span>
            <span className="inline-flex items-center gap-1">
              {shortcut.keys.map((key, index) => (
                <span key={`${shortcut.label}-${index}`} className="inline-flex items-center gap-1">
                  {index > 0 ? (
                    // Not `aria-hidden`: without it a reader says "g c", which is the same
                    // thing it says for a chord. The word is what tells them to press the
                    // keys one after the other.
                    <span className="text-xs text-muted-foreground">
                      {shortcut.sequence ? i18n("then") : "+"}
                    </span>
                  ) : null}
                  <kbd className="inline-flex min-w-[1.75rem] items-center justify-center rounded-md border border-border/70 bg-background/80 px-2 py-1 font-mono text-xs font-medium text-foreground">
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
