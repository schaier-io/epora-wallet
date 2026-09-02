"use client";
import { useTranslations } from "next-intl";


import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, QrCode, ShieldCheck, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  WalletConnectMark,
  WalletConnectQr
} from "@/components/layout/walletconnect-qr";
import { cn } from "@/lib/utils/cn";
import { useWalletConnect } from "@/providers/walletconnect-provider";

type MobileWalletSectionProps = {
  variant?: "primary" | "secondary";
};

// Peer metadata comes from the phone's wallet app and is not always a valid URL.
function hostnameOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function MobileWalletSection({ variant = "secondary" }: MobileWalletSectionProps) {
  const i18n = useTranslations("ComponentsLayoutWalletConnectSection");
  const wc = useWalletConnect();
  const isPrimary = variant === "primary";

  const headingLabel = isPrimary
    ? i18n("pairACardanoMobileWallet")
    : i18n("orPairAMobileWallet");
  const headingSub = isPrimary
    ? i18n("noBrowserExtensionScanAQrWithEternl")
    : i18n("useEternlLaceVesprTokeoBeginOrAny");
  const peerUrl = wc.session?.peer?.metadata?.url;
  const peerHostname = peerUrl ? hostnameOf(peerUrl) : null;

  const heading = (
    <div className="flex items-start gap-3">
      <div
        className={cn(
          "shrink-0 overflow-hidden rounded-full",
          isPrimary ? "h-10 w-10" : "h-8 w-8"
        )}
      >
        <WalletConnectMark className="h-full w-full" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        {/*
          No size branch here. `.eyebrow` is declared unlayered in `globals.css`, so it outranks
          Tailwind's layered utilities: a `text-[10px]` alongside it is swallowed and both
          variants rendered at 11px regardless. Measured -- `text-[10px]` alone gives 10px,
          `eyebrow text-[10px]` gives 11px. One eyebrow size everywhere is the intent anyway.
        */}
        <p className="eyebrow font-semibold text-muted-foreground">{i18n("walletconnectMobile")}</p>
        <p
          className={cn(
            "leading-relaxed",
            isPrimary ? "text-base text-foreground" : "text-sm text-muted-foreground"
          )}
        >
          {headingLabel}
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">{headingSub}</p>
      </div>
    </div>
  );

  if (!wc.available) {
    return (
      <section className="space-y-3 border-t border-border/60 pt-6">
        {heading}
        <div className="rounded-2xl border border-dashed border-border/70 bg-background/40 p-3 sm:p-4 text-sm text-muted-foreground">
          {i18n("mobileWalletSupportIsStagedButNotConfigured")}{" "}
          {/*
            Bare `rounded` (4px) on purpose, below the 8px radius floor. The floor governs
            controls and panels; this is an inline code chip about 19px tall, and 8px corners
            would read as a pill instead of a highlight. Same call as the footer's `?` key cap.
          */}
          <code className="rounded bg-muted/40 px-1 py-0.5 font-mono text-[11px]">
            {i18n("nextPublicWalletconnectProjectId")}
          </code>{" "}
          {i18n("in")} <code className="font-mono text-[11px]">{i18n("envLocal")}</code> {i18n("toEnableItProjectIdsAreFreeAt")}{" "}
          <a
            href="https://cloud.reown.com"
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline-offset-4 hover:underline"
          >
            cloud.reown.com
          </a>
          .
        </div>
      </section>
    );
  }

  const isConnected = wc.status === "connected" && wc.session !== null;
  const isWaiting = wc.status === "awaiting-approval" || wc.status === "connecting";

  const containerClass = cn(
    "rounded-2xl border p-4 sm:p-6",
    isPrimary
      ? "border-[#3396ff]/30 bg-[radial-gradient(circle_at_18%_18%,rgba(51,150,255,0.18),transparent_46%),linear-gradient(160deg,rgba(15,30,52,0.92),rgba(8,18,30,0.85))] shadow-[0_18px_42px_-28px_rgba(51,150,255,0.5)]"
      : "border-border/60 bg-gradient-to-b from-muted/15 to-background/40"
  );

  const motionState = isConnected ? "connected" : isWaiting ? "waiting" : "idle";
  const motionVariants = {
    initial: { opacity: 0, y: 8, scale: 0.99 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -6, scale: 0.99 }
  } as const;
  const motionTransition = { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <section className="space-y-3 border-t border-border/60 pt-6">
      {heading}
      <div className={cn(containerClass, "relative overflow-hidden")}>
        <AnimatePresence mode="wait" initial={false}>
          {motionState === "connected" ? (
            <motion.div
              key="connected"
              variants={motionVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={motionTransition}
              className="flex flex-wrap items-start justify-between gap-3"
            >
              <div className="min-w-0 space-y-1">
                <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                  <Smartphone className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
                  {i18n("connectedViaWalletconnect")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {wc.session?.peer?.metadata?.name ?? i18n("mobileWallet")}
                  {peerHostname ? i18n("value1", { value1: peerHostname }) : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void wc.disconnect()}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                {i18n("disconnect")}
              </Button>
            </motion.div>
          ) : motionState === "waiting" ? (
            <motion.div
              key="waiting"
              variants={motionVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={motionTransition}
              className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] as const, delay: 0.06 }}
                className="relative shrink-0"
              >
                {/* Soft blue glow behind the QR while waiting. */}
                <div
                  aria-hidden="true"
                  className="absolute inset-0 -z-10 rounded-3xl bg-[radial-gradient(circle_at_50%_50%,rgba(51,150,255,0.35),transparent_70%)] blur-2xl"
                />
                <WalletConnectQr uri={wc.uri} size={248} className="shrink-0" />
              </motion.div>
              <div className="min-w-0 flex-1 space-y-3 text-center sm:text-left">
                <div className="space-y-1">
                  <p className="eyebrow inline-flex items-center gap-2 font-semibold text-[#9bd0ff]">
                    <span aria-hidden="true" className="relative flex h-2 w-2">
                      <span className="absolute inset-0 animate-ping rounded-full bg-[#3396ff]/70" />
                      <span className="relative h-2 w-2 rounded-full bg-[#3396ff]" />
                    </span>
                    {i18n("waitingForYourWallet")}
                  </p>
                  <p className="text-sm font-medium text-foreground">
                    {i18n("scanThisCodeWithYourMobileWallet")}
                  </p>
                </div>
                <ol className="space-y-1 text-xs leading-relaxed text-muted-foreground">
                  <li className="flex gap-2">
                    <span
                      aria-hidden="true"
                      className="mt-[2px] inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-[#3396ff]/40 bg-[#3396ff]/10 text-[9px] font-semibold text-[#9bd0ff]"
                    >
                      1
                    </span>
                    {i18n("openYourCardanoWalletAppAndTapThe")}
                  </li>
                  <li className="flex gap-2">
                    <span
                      aria-hidden="true"
                      className="mt-[2px] inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-[#3396ff]/40 bg-[#3396ff]/10 text-[9px] font-semibold text-[#9bd0ff]"
                    >
                      2
                    </span>
                    {i18n("scanTheCodeThenApproveTheConnectionOn")}
                  </li>
                </ol>
                <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
                  {wc.uri ? (
                    <CopyButton
                      value={wc.uri}
                      label={i18n("copyLink")}
                      copiedLabel={i18n("linkCopied")}
                      variant="outline"
                      size="sm"
                    />
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void wc.disconnect()}
                  >
                    <X className="h-3.5 w-3.5" />
                    {i18n("cancel")}
                  </Button>
                </div>
              </div>
            </motion.div>
          ) : isPrimary ? (
            <motion.div
              key="idle-primary"
              variants={motionVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={motionTransition}
              className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                  <Smartphone className="h-3.5 w-3.5 text-[#3396ff]" aria-hidden="true" />
                  {i18n("phoneSignsBrowserStaysInSync")}
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {i18n("scanOnceApproveTransactionsOnYourPhoneNo")}
                </p>
              </div>
              <Button
                type="button"
                onClick={() => void wc.connect()}
                className="shrink-0 bg-[#3396ff] text-white shadow-[0_8px_24px_-12px_rgba(51,150,255,0.7)] hover:bg-[#1f7fe6]"
              >
                <QrCode className="h-4 w-4" />
                {i18n("pairViaWalletconnect")}
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="idle-secondary"
              variants={motionVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={motionTransition}
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <div className="min-w-0 space-y-1">
                <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                  <Smartphone className="h-3.5 w-3.5 text-[#3396ff]" aria-hidden="true" />
                  {i18n("useYourPhoneWalletInstead")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {i18n("worksWithAnyCardanoMobileWalletThatSupports")}
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => void wc.connect()}>
                <QrCode className="h-3.5 w-3.5" />
                {i18n("showQr")}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
        {wc.error ? (
          <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-100">
            <div className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              {i18n("walletconnectError")}
            </div>
            <p className="mt-1 leading-relaxed">{wc.error}</p>
          </div>
        ) : null}
      </div>
      {isConnected ? (
        <p className="px-1 text-[11px] text-muted-foreground">
          {i18n("mobileSigningIsInPreviewApprovalsRouteThrough")}
        </p>
      ) : null}
    </section>
  );
}
