"use client";
import { useTranslations } from "next-intl";


import { useEffect, useRef, useState } from "react";
import { BatteryCharging } from "lucide-react";
import { PopupDialog } from "@/components/ui/popup-dialog";
import { cn } from "@/lib/utils/cn";

type SparkleEasterEggProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type Tone = "ok" | "warn" | "accent" | "muted";

const DISCOUNT_CODE = "WALLET50";
const APP_URL = "https://battery-sensei.app";

// What `konami info` prints: the text about the wallet. The shell opens with
// this command already run, so the blurb is the only pre-existing content.
const INFO_LINES = [
  { key: "oneCardanoWalletManyKeysNoSinglePoint", tone: "accent" },
  { key: "ownersMakeTheRulesSpendersGetLimitsNot", tone: "muted" },
  { key: "loseYourKeysRecoveryContactsCanBringYou", tone: "muted" },
  { key: "onlyAfterAProofOfLifeNoOne", tone: "muted" },
  { key: null },
  { key: "mostWalletsGiveYouOneLifeLoseThe", tone: "warn" },
  { key: "thisOneShipsWithAOneUpRecovery", tone: "ok" },
  { key: "noThirtyLivesNeededRecoveryHasYourBack", tone: "muted" },
  { key: null },
  { key: "proofOfLifeRenewed", tone: "ok" },
  { key: "recoveryAlwaysOn", tone: "ok" }
] as const;

// Commands that exist but are walled off, for flavour. Anything here answers
// with "permission denied" instead of "command not found".
const RESTRICTED = new Set(["cd", "rm", "sudo", "chmod", "mv", "cp", "cat", "mkdir"]);

type Kind =
  | "reward"
  | "already"
  | "info"
  | "help"
  | "konami-bare"
  | "konami-opt"
  | "ls"
  | "denied"
  | "notfound";

/** Map a raw command line to how the shell should respond. */
function classify(raw: string): Kind {
  const lower = raw.toLowerCase();
  const tokens = lower.split(/\s+/).filter(Boolean);
  const first = tokens[0] ?? "";
  const isKonami = first === "konami" || first === "./konami";

  if (isKonami) {
    const sub = tokens[1];
    if (tokens.length === 1) return "konami-bare";
    if (tokens.length === 2 && sub === "redeem") return "reward";
    if (tokens.length === 2 && sub === "info") return "info";
    if (tokens.length === 2 && ["-h", "--help", "help"].includes(sub!)) return "help";
    return "konami-opt";
  }
  if (first === "ls" || first === "ll" || first === "dir") return "ls";
  if (RESTRICTED.has(first)) return "denied";
  return "notfound";
}

// Green-monochrome ramp: a proper phosphor terminal speaks in one colour, with
// brightness (not hue) carrying the hierarchy.
const TONE_CLASS: Record<Tone, string> = {
  ok: "text-emerald-300",
  warn: "text-emerald-300",
  accent: "text-emerald-100",
  muted: "text-emerald-100/45"
};

type LogEntry = { cmd: string; kind: Kind };

/**
 * Hidden reward shown when the visitor enters the Konami code. A scrollable
 * CRT-style terminal that opens with `konami info` already run (the wallet
 * blurb). `ls` reveals a lone `konami` binary; bare `konami` points at
 * `konami -h`, which lists its two commands, `info` and `redeem`. Only
 * `konami redeem` prints the reward card with the developer's other app and a
 * discount code. Entered commands and their output stay in the scrollback.
 * CSS-driven, so the global reduced-motion safety net in globals.css flattens
 * the motion.
 */
export function SparkleEasterEgg({ open, onOpenChange }: SparkleEasterEggProps) {
  const i18n = useTranslations("ComponentsLayoutSparkleEasterEgg");
  // Re-key the terminal each open so the boot animation replays.
  const [runId, setRunId] = useState(0);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [redeemed, setRedeemed] = useState(false);
  const [input, setInput] = useState("");
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Shell-style command history: arrow-up/down walk previously entered lines.
  const [history, setHistory] = useState<string[]>([]);
  const [histIndex, setHistIndex] = useState<number | null>(null);
  const draftRef = useRef(""); // the in-progress line, parked while browsing history

  useEffect(() => {
    if (!open) return;
    // Replay the boot sequence each time the dialog opens: reset all terminal
    // state, then focus after the intro. An effect is the right home here: it
    // owns the focus timer and its cleanup.
    /* eslint-disable react-hooks/set-state-in-effect */
    setRunId((n) => n + 1);
    // Open with `konami info` already run: the wallet blurb is the only
    // pre-existing content; everything else is for the visitor to discover.
    setLog([{ cmd: "konami info", kind: "info" }]);
    setRedeemed(false);
    setInput("");
    setCopied(false);
    setHistory(["konami info"]); // up-arrow recalls the seeded command first
    setHistIndex(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    draftRef.current = "";

    const reduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => inputRef.current?.focus(), reduced ? 120 : 360);
    return () => window.clearTimeout(timer);
  }, [open]);

  // Keep the newest output and the prompt in view as the session grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log, redeemed]);

  const submit = () => {
    const cmd = input.trim();
    if (!cmd) return;
    let kind = classify(cmd);
    if (kind === "reward" && redeemed) kind = "already";
    setLog((prev) => [...prev, { cmd, kind }]);
    if (kind === "reward") setRedeemed(true);
    setHistory((prev) => (prev[prev.length - 1] === cmd ? prev : [...prev, cmd]));
    setHistIndex(null);
    draftRef.current = "";
    setInput("");
  };

  // Walk command history (-1 = older / up, +1 = newer / down), parking the
  // in-progress line so arrow-down past the newest entry restores it.
  const recallHistory = (direction: -1 | 1) => {
    if (history.length === 0) return;
    let nextIndex: number | null;
    if (direction === -1) {
      if (histIndex === null) {
        draftRef.current = input;
        nextIndex = history.length - 1;
      } else {
        nextIndex = Math.max(0, histIndex - 1);
      }
    } else {
      if (histIndex === null) return;
      nextIndex = histIndex >= history.length - 1 ? null : histIndex + 1;
    }
    setHistIndex(nextIndex);
    const value = nextIndex === null ? draftRef.current : history[nextIndex]!;
    setInput(value);
    const el = inputRef.current;
    if (el && typeof window !== "undefined") {
      // Caret to end once React has written the new value.
      window.requestAnimationFrame(() => {
        try {
          el.setSelectionRange(value.length, value.length);
        } catch {
          // setSelectionRange can throw on some input types, so it is safe to ignore.
        }
      });
    }
  };

  const copyCode = () => {
    // Fire the feedback animation on every click; attempt the copy independently
    // so a blocked clipboard (insecure context) never swallows the interaction.
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
    navigator.clipboard?.writeText(DISCOUNT_CODE)?.catch(() => {
      // Clipboard unavailable: the code stays selectable.
    });
  };

  const rewardCard = (
    <div className="egg-reward mb-2 mt-2 space-y-3">
      {/* Launch reward: terminal-style panel, code first */}
      <div className="rounded-md border border-emerald-300/20 bg-emerald-400/[0.05] px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[10px] uppercase tracking-[0.16em] text-emerald-200/45">
              {i18n("launchReward")}
            </span>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="text-emerald-400/50">$</span>
              <span
                className={cn(
                  "egg-code select-all font-mono text-[15px] font-bold tracking-[0.18em] text-emerald-200 [text-shadow:0_0_10px_rgba(52,211,153,0.18)]",
                  copied && "egg-code-flash"
                )}
              >
                {DISCOUNT_CODE}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={copyCode}
            aria-label={i18n("copyDiscountCodeDiscountCode", { DISCOUNT_CODE: DISCOUNT_CODE })}
            className={cn(
              "shrink-0 rounded border px-2.5 py-1 font-mono text-[11px] transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/40",
              copied
                ? "egg-copy-pop border-emerald-300/45 bg-emerald-400/10 text-emerald-200"
                : "border-emerald-300/25 bg-emerald-400/[0.06] text-emerald-200/80 hover:border-emerald-300/45 hover:bg-emerald-400/10"
            )}
          >
            {copied ? <span className="egg-check-pop inline-block">{i18n("copied")}</span> : i18n("copy")}
          </button>
        </div>
      </div>

      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300/60">
        {i18n("moreFromThisDeveloper")}
      </p>

      {/* App promo: flat terminal panel; the url underlines L→R on card hover */}
      <a
        href={APP_URL}
        target="_blank"
        rel="noreferrer noopener"
        className="group block rounded-md border border-emerald-300/20 bg-emerald-400/[0.04] p-3 transition-colors duration-200 hover:border-emerald-300/45 hover:bg-emerald-400/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/40"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-emerald-300/25 bg-emerald-400/10 text-emerald-200">
            <BatteryCharging className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-sans text-sm font-semibold text-emerald-50">{i18n("batterySensei")}</span>
              <span className="rounded border border-emerald-300/25 px-1 py-px font-mono text-[9px] uppercase tracking-[0.1em] text-emerald-200/70">
                {i18n("app")}
              </span>
            </div>
            <p className="mt-0.5 font-sans text-xs leading-relaxed text-emerald-100/60">
              {i18n("aBatteryHealthCoachChargeSmarterSlowDown")}
            </p>
          </div>
        </div>
        <div className="mt-2.5 flex items-center justify-between border-t border-emerald-300/12 pt-2">
          <span className="egg-link-underline font-mono text-[11px] text-emerald-300/75">
            battery-sensei.app
          </span>
          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-200/80 transition-transform duration-200 group-hover:translate-x-0.5">
            {i18n("visit")} <span aria-hidden="true">↗</span>
          </span>
        </div>
      </a>
    </div>
  );

  const renderResponse = (entry: LogEntry) => {
    const firstRaw = entry.cmd.split(/\s+/)[0] ?? entry.cmd;
    switch (entry.kind) {
      case "reward":
        return (
          <div className="mt-0.5 space-y-0.5">
            <div className={TONE_CLASS.ok}>{i18n("accessGranted")}</div>
            {rewardCard}
          </div>
        );
      case "already":
        return (
          <div className="text-emerald-100/45">
            {i18n("rewardAlreadyClaimed")} <span className="text-cyan-300/80">{DISCOUNT_CODE}</span>
          </div>
        );
      case "info":
        return (
          <div className="mt-0.5 space-y-0.5">
            {INFO_LINES.map((line, i) =>
              line.key === null ? (
                <div key={i}>{i18n("nbsp")}</div>
              ) : (
                <div key={i} className={line.tone ? TONE_CLASS[line.tone] : undefined}>
                  {i18n(line.key)}
                </div>
              )
            )}
          </div>
        );
      case "help":
        return (
          <div className="mt-0.5 text-emerald-100/70">
            <div className="text-emerald-100/85">{i18n("konamiRecoveryWalletShell")}</div>
            <div className="mt-1 text-emerald-100/40">{i18n("commands")}</div>
            <div>
              <span className="text-emerald-300">{i18n("konamiInfo")}</span>
              <span className="text-emerald-100/45"> {i18n("whatThisWalletDoes")}</span>
            </div>
            <div>
              <span className="text-emerald-300">{i18n("konamiRedeem")}</span>
              <span className="text-emerald-100/45"> {i18n("claimYourLaunchReward")}</span>
            </div>
            <div>
              <span className="text-emerald-300">{i18n("konamiH")}</span>
              <span className="text-emerald-100/45"> {i18n("showThisHelp")}</span>
            </div>
          </div>
        );
      case "konami-bare":
        return (
          <div className="text-emerald-100/45">
            {i18n.rich("konamiMissingCommand", {
              command: (children) => <span className="text-emerald-300/80">{children}</span>
            })}
          </div>
        );
      case "konami-opt":
        return (
          <div className="text-emerald-100/45">
            {i18n.rich("konamiUnknownCommand", {
              command: (children) => <span className="text-emerald-300/80">{children}</span>
            })}
          </div>
        );
      case "ls":
        // `konami` is the executable, bold green with the ls -F "*" classifier.
        return (
          <div className="flex flex-wrap gap-x-5 gap-y-0.5">
            <span className="text-emerald-100/40">{i18n("recoveryLog")}</span>
            <span className="text-emerald-100/40">{i18n("notesTxt")}</span>
            <span className="font-bold text-emerald-300">
              {i18n("konami")}<span className="font-normal text-emerald-400/50">*</span>
            </span>
          </div>
        );
      case "denied":
        return <div className="text-emerald-100/45">{i18n("permissionDenied", { command: firstRaw })}</div>;
      default:
        return <div className="text-emerald-100/40">{i18n("commandNotFound", { command: firstRaw })}</div>;
    }
  };

  return (
    <PopupDialog
      open={open}
      onOpenChange={onOpenChange}
      title={i18n("bA")}
      className="max-w-md"
    >
      <div
        key={runId}
        className="egg-crt egg-boot relative overflow-hidden rounded-xl border border-emerald-300/20 bg-[#03110d] shadow-[inset_0_0_40px_rgba(16,185,129,0.08)]"
      >
        {/* Title bar: traffic lights + a neutral shell label */}
        <div className="flex items-center gap-2 border-b border-emerald-300/15 bg-emerald-950/30 px-3 py-2">
          <span className="flex gap-1.5" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
          </span>
          <span className="ml-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-emerald-200/50">
            {i18n("secureShell")}
          </span>
        </div>

        {/* Scrollable body: clicking anywhere refocuses the prompt */}
        <div
          ref={scrollRef}
          className="user-scrollbar relative max-h-[55vh] overflow-y-auto px-4 py-4 font-mono text-[12.5px] leading-relaxed text-emerald-200/90"
          onClick={(event) => {
            if (!(event.target as HTMLElement).closest("a,button")) {
              inputRef.current?.focus();
            }
          }}
        >
          <div className="space-y-2">
            {/* Entered commands + their responses, appended in order. The first
                entry (`konami info`) is seeded on open. */}
            {log.map((entry, i) => (
              <div key={i} className="egg-line">
                <div>
                  <span className="text-emerald-400">$</span>{" "}
                  <span className="text-emerald-100/85">{entry.cmd}</span>
                </div>
                {renderResponse(entry)}
              </div>
            ))}

            {/* Live prompt: stays available so the session continues */}
            <div className="flex items-center gap-1.5">
              <span className="text-emerald-400">$</span>
              <input
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  // The dialog owns Escape (close) and Tab (focus trap).
                  if (event.key === "Escape" || event.key === "Tab") return;
                  event.stopPropagation(); // don't trip global shortcuts while typing
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submit();
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    recallHistory(-1);
                  } else if (event.key === "ArrowDown") {
                    event.preventDefault();
                    recallHistory(1);
                  }
                }}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                aria-label={i18n("terminalCommand")}
                className="min-w-0 flex-1 bg-transparent text-[12.5px] text-emerald-100 caret-emerald-300 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* tmux-style status bar: green session segment, window, and key hints */}
        <div className="flex items-center justify-between gap-2 border-t border-emerald-300/15 bg-emerald-950/40 px-2.5 py-1.5 font-mono text-[10px]">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="rounded-[3px] bg-emerald-400/85 px-1.5 py-0.5 font-semibold text-emerald-950">
              {i18n("secureShell")}
            </span>
            <span className="truncate text-emerald-200/40">{i18n("message_0Konami")}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2.5 text-emerald-200/40">
            <span>
              <span className="text-emerald-300/70">↑↓</span> {i18n("history")}
            </span>
            <span>
              <span className="text-emerald-300/70">⏎</span> {i18n("run")}
            </span>
            <span className="hidden sm:inline">
              <span className="text-emerald-300/70">{i18n("esc")}</span> {i18n("exit")}
            </span>
          </div>
        </div>

        {/* Scanlines overlay: fixed over the whole window, ignores pointer events */}
        <div className="egg-scanlines pointer-events-none absolute inset-0" aria-hidden="true" />
      </div>
    </PopupDialog>
  );
}
