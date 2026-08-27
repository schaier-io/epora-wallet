"use client";
import { useTranslations } from "next-intl";


import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PopupDialog } from "@/components/ui/popup-dialog";

type Shortcut = {
  keys: string[];
  labelKey:
    | "showShortcuts"
    | "closeDialogs"
    | "nextField"
    | "previousField"
    | "walletHome"
    | "sendFunds"
    | "receiveFunds"
    | "people"
    | "walletSettings"
    | "scheduledPayments"
    | "createWallet";
  sequence?: boolean;
};

const SHORTCUTS: Shortcut[] = [
  { keys: ["?"], labelKey: "showShortcuts" },
  { keys: ["Esc"], labelKey: "closeDialogs" },
  { keys: ["Tab"], labelKey: "nextField" },
  { keys: ["Shift", "Tab"], labelKey: "previousField" },
  { keys: ["g", "h"], labelKey: "walletHome", sequence: true },
  { keys: ["g", "s"], labelKey: "sendFunds", sequence: true },
  { keys: ["g", "r"], labelKey: "receiveFunds", sequence: true },
  { keys: ["g", "p"], labelKey: "people", sequence: true },
  { keys: ["g", "w"], labelKey: "walletSettings", sequence: true },
  { keys: ["g", "u"], labelKey: "scheduledPayments", sequence: true },
  { keys: ["c"], labelKey: "createWallet" }
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

export function KeyboardShortcutsHelp() {
  const i18n = useTranslations("ComponentsLayoutShortcutsHelp");
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pendingPrefixRef = useRef<{ key: string; expires: number } | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

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
    <PopupDialog
      open={open}
      onOpenChange={setOpen}
      title={i18n("keyboardShortcuts")}
      description={i18n("jumpToAWalletTaskWithoutReachingFor")}
      className="max-w-md"
      >
        <ul className="divide-y divide-border/60">
        {SHORTCUTS.map((shortcut) => (
          <li
            key={shortcut.labelKey}
            className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
          >
            <span className="text-sm text-foreground">{i18n(shortcut.labelKey)}</span>
            <span className="inline-flex items-center gap-1">
              {shortcut.keys.map((key, index) => (
                <span key={`${shortcut.labelKey}-${index}`} className="inline-flex items-center gap-1">
                  {index > 0 ? (
                    <span aria-hidden="true" className="text-xs text-muted-foreground">
                      {shortcut.sequence ? i18n("then") : "+"}
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
  );
}
