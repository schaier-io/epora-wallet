"use client";

import { Portal } from "@/components/react-bits/portal";
import { AnimatedContent } from "@/components/react-bits/primitives";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import QRCode from "qrcode";
import { type ReviewCompletion } from "@/components/user/review-panel";
import { WalletMembershipCard } from "@/components/user/wallet-membership-card";
import { formatActivityAddressLabel, formatActivityUtxoAmount, formatInputRefLabel, getUtxoRefKey, utxoContainsAsset } from "@/components/user/workspace/helpers";
import { type AssetSelectionOption, type SetupProgressStep } from "@/components/user/workspace/types";
import { resolveAssetIdentity } from "@/lib/cardano-assets";
import { cn } from "@/lib/utils/cn";
import { type UTxO } from "@meshsdk/core";
import { CheckCircle2, ChevronRight, FolderOpen, Loader2, Search, Sparkles, X } from "lucide-react";
import { motion } from "motion/react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

export function SidebarActiveGlow() {
  return (
    <motion.span
      layoutId="sidebar-active-glow"
      aria-hidden="true"
      className="pointer-events-none absolute -inset-px rounded-2xl"
      style={{
        background:
          "radial-gradient(circle at 18% 22%, rgba(82, 255, 220, 0.34), transparent 52%), radial-gradient(circle at 82% 24%, rgba(35, 174, 255, 0.24), transparent 50%), linear-gradient(125deg, transparent 0%, rgba(82, 255, 220, 0.16) 55%, rgba(35, 174, 255, 0.1) 80%, transparent 100%)"
      }}
      transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.65 }}
    />
  );
}

export function ReceiveAddressQrCode({ address }: { address: string }) {
  // Generate the QR client-side with the bundled `qrcode` library. The address
  // is sensitive (financial), so it must never be sent to a third-party QR
  // service — and a local render works offline. One <path> for all modules
  // keeps it to a single, crisp, scannable DOM node.
  const modulePath = useMemo(() => {
    if (!address) return null;
    try {
      const qr = QRCode.create(address, { errorCorrectionLevel: "M" });
      const grid = qr.modules.size;
      const data = qr.modules.data;
      let path = "";
      for (let row = 0; row < grid; row++) {
        for (let col = 0; col < grid; col++) {
          if (data[row * grid + col]) {
            path += `M${col} ${row}h1v1h-1z`;
          }
        }
      }
      return { path, grid };
    } catch {
      return null;
    }
  }, [address]);

  if (!modulePath) {
    return (
      <div className="flex h-36 w-36 items-center justify-center overflow-hidden rounded-xl bg-[hsl(195_45%_6%)] px-3 text-center text-xs text-muted-foreground ring-1 ring-inset ring-border/40">
        QR unavailable
      </div>
    );
  }

  return (
    <div className="flex h-36 w-36 items-center justify-center overflow-hidden rounded-xl bg-white p-2 shadow-[0_8px_24px_-18px_rgba(0,0,0,0.6)]">
      <svg
        viewBox={`0 0 ${modulePath.grid} ${modulePath.grid}`}
        className="h-full w-full"
        role="img"
        aria-label="QR code for the smart wallet receive address"
        shapeRendering="crispEdges"
      >
        <path d={modulePath.path} fill="#0a1a26" />
      </svg>
    </div>
  );
}

export function SearchableAssetUnitDropdown({
  id,
  value,
  options,
  onChange,
  placeholder = "Search available assets",
  emptyLabel = "No matching assets."
}: {
  id: string;
  value: string;
  options: AssetSelectionOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setQuery("");
  }, []);

  const selectedOption = useMemo(
    () =>
      options.find((option) => option.unit === value) ??
      (value.trim()
        ? {
            unit: value,
            label: (() => {
              const id = resolveAssetIdentity(value);
              return id.knownMeta ? `${id.symbol} · ${id.knownMeta.name}` : id.symbol;
            })(),
            availableLabel: "Not in your wallet yet",
            searchableText: value.toLowerCase(),
            maxQuantity: "0"
          }
        : null),
    [options, value]
  );

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return options;
    }

    return options.filter((option) => option.searchableText.includes(normalizedQuery));
  }, [options, query]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        closeDropdown();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [closeDropdown, isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 rounded-md border border-input bg-background/70 px-3 py-2 text-left ring-offset-background transition-colors hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={() => {
          if (isOpen) {
            closeDropdown();
            return;
          }
          setIsOpen(true);
        }}
      >
        <div className="min-w-0">
          <p
            className={cn(
              "truncate text-sm",
              selectedOption ? "font-medium text-foreground" : "text-muted-foreground"
            )}
          >
            {selectedOption?.label ?? "Choose an asset"}
          </p>
        </div>
        <ChevronRight
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            isOpen && "rotate-90"
          )}
        />
      </button>

      {isOpen ? (
        <div className="absolute left-0 top-full z-30 mt-2 w-full rounded-xl border border-border/70 bg-background/95 shadow-xl backdrop-blur">
          <div className="relative border-b border-border/60 px-3 py-2">
            <Search className="pointer-events-none absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  closeDropdown();
                }
              }}
              placeholder={placeholder}
              className="border-0 bg-transparent pl-9 pr-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              autoFocus
            />
          </div>
          <div role="listbox" aria-labelledby={id} className="max-h-64 space-y-1 overflow-auto p-2">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <button
                  key={`${id}-${option.unit}`}
                  type="button"
                  role="option"
                  aria-selected={option.unit === value}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                    option.unit === value
                      ? "border-primary/40 bg-primary/10"
                      : "border-transparent bg-muted/20 hover:border-primary/20 hover:bg-background/80"
                  )}
                  onClick={() => {
                    onChange(option.unit);
                    closeDropdown();
                  }}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{option.label}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {option.availableLabel}
                    </p>
                  </div>
                  {option.unit === value ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                  ) : null}
                </button>
              ))
            ) : (
              <p className="rounded-lg border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
                {emptyLabel}
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ActivityUtxoList({
  title,
  utxos,
  walletAddress,
  activeAddress,
  sttUnit,
  emptyLabel
}: {
  title: string;
  utxos: UTxO[];
  walletAddress: string;
  activeAddress?: string | null;
  sttUnit?: string | null;
  emptyLabel: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/35 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-foreground">{title}</p>
        <Badge variant="outline" className="shrink-0">
          {utxos.length}
        </Badge>
      </div>
      {utxos.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="user-scrollbar mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
          {utxos.map((utxo) => {
            if (!utxo?.output) {
              return null;
            }
            const isWalletOutput = utxo.output.address === walletAddress;
            const isConnectedWalletOutput = activeAddress && utxo.output.address === activeAddress;
            const containsWalletToken = sttUnit ? utxoContainsAsset(utxo, sttUnit) : false;

            return (
              <div
                key={`${title}-${getUtxoRefKey(utxo)}`}
                className="rounded-lg border border-border/50 bg-background/45 px-3 py-2"
              >
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 break-all font-mono text-[11px] text-foreground">
                    {formatInputRefLabel(utxo.input.txHash, utxo.input.outputIndex)}
                  </span>
                  <div className="flex shrink-0 flex-wrap items-center gap-1">
                    {isWalletOutput ? (
                      <Badge
                        className="border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
                        variant="outline"
                      >
                        Wallet funds
                      </Badge>
                    ) : null}
                    {isConnectedWalletOutput ? (
                      <Badge
                        className="border-sky-400/30 bg-sky-500/10 text-sky-100"
                        variant="outline"
                      >
                        Connected wallet
                      </Badge>
                    ) : null}
                    {containsWalletToken ? (
                      <Badge
                        className="border-amber-400/30 bg-amber-500/10 text-amber-100"
                        variant="outline"
                      >
                        Wallet token
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {formatActivityAddressLabel(utxo.output.address, walletAddress, activeAddress)}
                </p>
                <p className="mt-1 text-xs font-medium text-foreground">
                  {formatActivityUtxoAmount(utxo)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function InlineFieldError({ message }: { message?: string | null }) {
  if (!message) {
    return null;
  }

  return <p className="text-xs text-amber-300">{message}</p>;
}

export function DisclosureSection({
  title,
  description,
  defaultOpen = false,
  children
}: {
  title: string;
  description: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const itemValue = title.replace(/\s+/g, "-").toLowerCase();
  return (
    <Accordion
      type="single"
      collapsible
      defaultValue={defaultOpen ? itemValue : undefined}
      className="min-w-0 rounded-lg border border-border/60 bg-background/30"
    >
      <AccordionItem value={itemValue} className="border-0 px-4">
        <AccordionTrigger className="py-3 text-sm font-medium text-foreground hover:no-underline">
          <span className="flex flex-col items-start gap-0.5 pr-3 text-left">
            <span>{title}</span>
            <span className="text-[11px] font-normal text-muted-foreground">
              {description}
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent className="pb-4">
          <div className="min-w-0 space-y-4">{children}</div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export function SetupProgressStepper({ steps }: { steps: SetupProgressStep[] }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">Setup path</p>
        <Badge variant="outline">
          {steps.filter((step) => step.status === "done").length}/{steps.length} done
        </Badge>
      </div>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((step, index) => {
          const isDone = step.status === "done";
          const isActive = step.status === "active";
          const isBlocked = step.status === "blocked";

          return (
            <li
              key={step.label}
              className={cn(
                "rounded-lg border px-3 py-3",
                isDone && "border-emerald-500/30 bg-emerald-500/10",
                isActive && "border-primary/35 bg-primary/10",
                isBlocked && "border-amber-500/35 bg-amber-500/10",
                step.status === "waiting" && "border-border/60 bg-muted/10"
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                    isDone
                      ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-100"
                      : isActive
                        ? "border-primary/50 bg-primary/20 text-primary"
                        : isBlocked
                          ? "border-amber-400/50 bg-amber-500/20 text-amber-100"
                          : "border-border/70 bg-background/50 text-muted-foreground"
                  )}
                >
                  {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <p className="text-sm font-medium text-foreground">{step.label}</p>
              </div>
              <p className="mt-2 text-xs leading-snug text-muted-foreground">
                {step.description}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Esc-to-close for the fullscreen mint overlays (they never dismiss on backdrop). */
function useEscapeToClose(onClose?: () => void) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

/**
 * In-progress overlay while the wallet mint is broadcasting / awaiting chain
 * confirmation. Intentionally lightweight — NO membership card and NO WebGL —
 * so the frequent confirmation-poll re-renders can't flash or ghost the card.
 * The celebration (with the sparkle card) is a separate, render-once overlay.
 * Dismiss only via Esc or the X — never on a backdrop click.
 */
export function WalletCreationFullscreenProgress({
  completion,
  submitHash,
  onClose
}: {
  completion: ReviewCompletion | null;
  submitHash: string | null;
  onClose?: () => void;
}) {
  useEscapeToClose(completion ? onClose : undefined);

  if (!completion) {
    return null;
  }

  const completionProgress = Math.max(0, Math.min(100, completion.progress));
  const progressLabel = `${Math.round(completionProgress)}%`;

  return (
    <div
      className="user-wallet-created-overlay fixed inset-0 z-50 flex min-h-dvh items-center justify-center overflow-hidden bg-background/92 px-4 py-8 backdrop-blur-xl"
      role="status"
      aria-live="polite"
    >
      <div className="user-wallet-created-grid absolute inset-0" aria-hidden="true" />
      <div
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-200/80 to-transparent"
        aria-hidden="true"
      />
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/60 text-muted-foreground transition-colors hover:border-border hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-[2rem] border border-emerald-300/25 bg-card/88 p-6 shadow-[0_30px_120px_rgba(8,47,73,0.45)] md:p-8">
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-200/30 bg-emerald-300/15 text-emerald-100">
              <Loader2 className="h-6 w-6 animate-spin" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-100/80">
                Creating wallet
              </p>
              <h2 className="mt-1 truncate text-xl font-semibold leading-tight tracking-tight text-foreground md:text-2xl">
                {completion.title}
              </h2>
            </div>
          </div>

          <p className="text-sm leading-relaxed text-muted-foreground">{completion.description}</p>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="text-emerald-50">{completion.statusLabel}</span>
              <span className="font-mono text-emerald-100/90">{progressLabel}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full border border-emerald-200/20 bg-emerald-950/55">
              <div
                className="user-wallet-created-progress h-full rounded-full"
                style={{ width: `${completionProgress}%` }}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-background/35 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Transaction
            </p>
            <p className="mt-2 break-all font-mono text-xs leading-relaxed text-foreground">
              {submitHash ?? "waiting for network…"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Celebration shown ONCE after the mint confirms — the deliberate final stop.
 * Renders the sparkle membership card (with the "#N of all wallets" number,
 * Save and Share). Mounted independently of the confirmation polling, so the
 * WebGL surface and card paint once and stay stable (no flashing / ghosting).
 */
export function MintCelebrationOverlay({
  walletName,
  sttPolicyId,
  createdWalletUnit,
  onOpenWallet,
  onCreateAnother,
  onClose
}: {
  walletName: string;
  sttPolicyId: string | null;
  createdWalletUnit: string;
  onOpenWallet: () => void;
  onCreateAnother: () => void;
  onClose: () => void;
}) {
  useEscapeToClose(onClose);
  return (
    <div className="user-wallet-created-overlay fixed inset-0 z-[60] flex min-h-dvh items-center justify-center overflow-y-auto bg-background/92 px-4 py-8 backdrop-blur-xl">
      <div className="user-wallet-created-grid absolute inset-0" aria-hidden="true" />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/60 text-muted-foreground transition-colors hover:border-border hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="pointer-events-none absolute inset-0 opacity-40" aria-hidden="true">
        <Portal
          primaryColor="#34d399"
          secondaryColor="#22d3ee"
          centerColor="#f0fdf4"
          speed={0.6}
          density={0.7}
          layerCount={5}
          waveAmplitude={0.6}
          depthIntensity={0.25}
          brightness={0.85}
          scale={1.3}
        />
      </div>
      <div
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-200/80 to-transparent"
        aria-hidden="true"
      />
      <AnimatedContent
        reveal="mount"
        distance={18}
        blur
        className="user-wallet-created-card relative z-10 my-auto w-full max-w-md overflow-hidden rounded-[2rem] border border-emerald-300/25 bg-card/88 p-6 text-center shadow-[0_30px_120px_rgba(8,47,73,0.45)] md:p-8"
      >
        <div className="flex flex-col items-center gap-5">
          <span className="user-wallet-created-badge inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-emerald-200/30 bg-emerald-300/15 text-emerald-100">
            <Sparkles className="h-7 w-7" />
          </span>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-100/80">
              Smart wallet created
            </p>
            <h2 className="text-balance text-2xl font-semibold leading-tight tracking-tight text-foreground md:text-3xl">
              {walletName} is live
            </h2>
            <p className="text-balance text-sm leading-relaxed text-muted-foreground">
              Secured on Cardano Preprod by on-chain recovery — no seed phrase to lose. Save your
              membership card, then jump in.
            </p>
          </div>

          <WalletMembershipCard
            walletName={walletName}
            policyId={sttPolicyId}
            sttUnit={createdWalletUnit}
            className="w-full max-w-sm"
          />

          <div className="w-full space-y-3 pt-1">
            <Button type="button" onClick={onOpenWallet} className="w-full">
              <FolderOpen className="h-4 w-4" />
              Open wallet
            </Button>
            <button
              type="button"
              onClick={onCreateAnother}
              className="text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              Create another wallet
            </button>
          </div>
        </div>
      </AnimatedContent>
    </div>
  );
}

