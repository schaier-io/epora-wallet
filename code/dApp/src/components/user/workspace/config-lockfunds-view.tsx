"use client";
import { copyFeedbackAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";
import { lockingContractAtom, walletReceiveAddressAtom } from "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms";
import { walletBalanceSummaryAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import { useAtomValue } from "jotai";

import {
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  QrCode,
  Wallet2
} from "lucide-react";

import { AssetListEditor, InlineFieldError, ReceiveAddressQrCode } from "@/components/user/workspace/editors";
import { buildCardanoscanAddressUrl, getFirstFieldError } from "@/components/user/workspace/helpers";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";
import { useLockFundsForm } from "@/components/user/workspace/forms/use-lock-funds-form";

export function LockFundsConfigView() {
  const state = useWorkspaceActions();
  const copyFeedback = useAtomValue(copyFeedbackAtom);
  const lockingContract = useAtomValue(lockingContractAtom);
  const walletReceiveAddress = useAtomValue(walletReceiveAddressAtom);
  const walletBalanceSummary = useAtomValue(walletBalanceSummaryAtom);
  const {
    activeFieldErrors,
    copyTextToClipboard,
  } = state;
  const { lockFundsAssets, setLockFundsAssets } = useLockFundsForm();

      return (
        <div className="space-y-5">
          <div className="rounded-xl border border-border/60 bg-background/40 p-4">
            <p className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Download className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Receive and manage funds
            </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Share the receive address or scan the QR code when someone needs to fund this wallet.
                Use the add-funds fields below when you want to send funds from the connected
                wallet.
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/40 p-4">
            <div className="flex w-full flex-wrap items-start gap-x-3 gap-y-2">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <QrCode className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  Receive address
                </p>
                <p className="text-xs text-muted-foreground">
                  Share this address when someone needs to send funds into this wallet.
                </p>
              </div>
              {lockingContract.address ? (
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <a
                    href={buildCardanoscanAddressUrl(walletReceiveAddress ?? lockingContract.address)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/50 text-muted-foreground transition-colors hover:text-foreground"
                    title="Open address on Cardanoscan"
                    aria-label="Open address on Cardanoscan"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/50 text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => {
                      if (!lockingContract.address) {
                        return;
                      }

                      void copyTextToClipboard(
                        walletReceiveAddress ?? lockingContract.address,
                        "Deposit address copied"
                      );
                    }}
                    title={
                      copyFeedback === "Deposit address copied"
                        ? "Address copied"
                        : "Copy address"
                    }
                    aria-label={
                      copyFeedback === "Deposit address copied"
                        ? "Address copied"
                        : "Copy address"
                    }
                  >
                    {copyFeedback === "Deposit address copied" ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
              ) : null}
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-[168px_minmax(0,1fr)]">
              <div className="flex items-center justify-center rounded-2xl border border-border/60 bg-background/40 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                {lockingContract.address ? (
                  <ReceiveAddressQrCode address={walletReceiveAddress ?? lockingContract.address} />
                ) : (
                  <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
                    <Wallet2 className="h-6 w-6 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Address unavailable</p>
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <div className="rounded-lg border border-border/60 bg-background/50 px-3 py-3">
                  {lockingContract.address ? (
                    <a
                      href={buildCardanoscanAddressUrl(walletReceiveAddress ?? lockingContract.address)}
                      target="_blank"
                      rel="noreferrer"
                      className="block break-all select-all font-mono text-xs leading-relaxed tracking-tight text-foreground underline-offset-4 hover:underline"
                      title="Click to view on Cardanoscan · triple-click to select all"
                    >
                      {walletReceiveAddress ?? lockingContract.address}
                    </a>
                  ) : (
                    <p className="text-xs text-muted-foreground">{lockingContract.error}</p>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                    Send ADA or supported native assets here to fund the wallet.
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                    Use Add funds below when you want to set the exact asset mix from this app.
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-4 rounded-lg border border-border/60 bg-background/40 p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Add funds</p>
              <p className="text-xs text-muted-foreground">
                {lockingContract.address
                  ? "Set the deposit amount and choose exactly which assets to lock."
                  : lockingContract.error}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
              <p className="mb-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Deposit address
              </p>
              {lockingContract.address ? (
                <p className="break-all font-mono text-xs">{lockingContract.address}</p>
              ) : (
                <p className="text-xs text-muted-foreground">{lockingContract.error}</p>
              )}
            </div>
            <AssetListEditor
              label="Assets to lock"
              helper="ADA is shown directly in the asset row. Add token rows only when this deposit should include native assets too."
              value={lockFundsAssets}
              onChange={setLockFundsAssets}
              availableAssets={walletBalanceSummary.assets}
            />
            <InlineFieldError message={getFirstFieldError(activeFieldErrors, "Assets to lock")} />
          </div>
        </div>
      );
}
