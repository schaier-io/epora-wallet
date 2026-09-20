"use client";
import { useTranslations } from "next-intl";


import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAtom } from "jotai";
import { PopupDialog } from "@/components/ui/popup-dialog";
import { SparkleEasterEgg } from "@/components/layout/sparkle-easter-egg";
import { shortcutsHelpOpenAtom } from "@/components/layout/shortcuts-help.atoms";
import { SHORTCUTS } from "@/lib/shortcuts/registry";
import { createShortcutEngine } from "@/lib/shortcuts/engine";

/**
 * The registry holds chrome/focus keys and then the `sequence: true` navigation chords. A
 * flat list rendered both at one divider pitch, so the map of the app read as one run.
 * Grouping is a view concern only: the registry and every binding stay as they are.
 */
const SHORTCUT_GROUPS = [
  SHORTCUTS.filter((shortcut) => !shortcut.sequence),
  SHORTCUTS.filter((shortcut) => shortcut.sequence)
];

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

/**
 * Whether an overlay owns the current key event. Without this, `c` navigated to the
 * wallet-creation flow and `g h` navigated home while the risk gate was still up, because
 * `isTypingTarget` is false for the gate's `<button>` and nothing else looked. Matches modal
 * elements and portalled popovers marked by the shared isolation contract.
 */
function isModalOpen(target: EventTarget | null) {
  if (typeof document === "undefined") return false;
  if (target instanceof HTMLElement && target.closest("[data-modal-passthrough]")) {
    return true;
  }
  return document.querySelector('[aria-modal="true"], dialog[open]') !== null;
}

export function KeyboardShortcutsHelp() {
  const i18n = useTranslations("ComponentsLayoutShortcutsHelp");
  // Shared atom, not local state: the footer's "Press ? for shortcuts" button opens this
  // same dialog, and the footer cannot reach a `useState` that lives in here.
  const [open, setOpen] = useAtom(shortcutsHelpOpenAtom);
  const [eggOpen, setEggOpen] = useState(false);
  const router = useRouter();
  // One engine per mount, via useState's initializer rather than useMemo: the
  // engine owns the armed `g` prefix and the Konami progress, and React may
  // discard a memo cache, which would silently reset mid-sequence state.
  const [engine] = useState(createShortcutEngine);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const action = engine({
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        isTypingTarget: isTypingTarget(event.target),
        isModalOpen: isModalOpen(event.target)
      });
      switch (action.type) {
        case "none":
          return;
        case "swallow":
          event.preventDefault();
          return;
        case "openHelp":
          event.preventDefault();
          setOpen(true);
          return;
        case "showEasterEgg":
          setEggOpen(true);
          return;
        case "navigate":
          event.preventDefault();
          if (action.preserveWallet && typeof window !== "undefined") {
            try {
              // `h` used to be excluded here, so "Wallet home" dropped `?wallet`. Losing the
              // param does not just change the URL: the auto-select effect then re-picks the
              // first card with a non-"Receive only" role -- not the wallet the user was in --
              // and runs its reset block, discarding every in-progress draft. Invisible with
              // one smart wallet, a silent wallet switch plus data loss with two.
              const wallet = new URLSearchParams(window.location.search).get("wallet");
              if (wallet) {
                router.push(`${action.target}&wallet=${encodeURIComponent(wallet)}`);
                return;
              }
            } catch {
              // fall through to plain target
            }
          }
          router.push(action.target);
          return;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [engine, router, setOpen]);

  return (
    <>
    <SparkleEasterEgg open={eggOpen} onOpenChange={setEggOpen} />
    <PopupDialog
      open={open}
      onOpenChange={setOpen}
      title={i18n("keyboardShortcuts")}
      description={i18n("flyAroundWithoutTouchingTheMouse")}
      className="max-w-sm"
      >
        <div className="space-y-6">
        {SHORTCUT_GROUPS.map((group) => (
          <ul key={group[0]?.labelKey} className="divide-y divide-border/60">
            {group.map((shortcut) => (
              <li
                key={shortcut.labelKey}
                className="flex items-center justify-between gap-4 py-2 first:pt-0 last:pb-0"
              >
                <span className="text-sm text-foreground">{i18n(shortcut.labelKey)}</span>
                <span className="inline-flex items-center gap-1">
                  {shortcut.keys.map((key, index) => (
                    <span key={`${shortcut.labelKey}-${index}`} className="inline-flex items-center gap-1">
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
        ))}
      </div>
    </PopupDialog>
    </>
  );
}
