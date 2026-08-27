"use client";
import { copyFeedbackAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";
import { lockingContractAtom, walletReceiveAddressAtom } from "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms";
import { walletBalanceSummaryAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import { useAtomValue } from "jotai";

import {
  CheckCircle2,
  Copy,
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
        <div className="space-y-4">
          {/* No heading panel here. `UserActionConfigurationCard` already renders "Add funds
              details" and "This shows the wallet receive address and lets you add funds.", so a
              third heading followed. All the deleted panel added was a table of contents for the
              two panels below it, and each of those already describes itself. */}
          <div className="rounded-lg border border-border/60 bg-background/40 p-3 sm:p-4">
            <div className="flex w-full flex-wrap items-start gap-x-3 gap-y-2">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
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
                        "Wallet address copied"
                      );
                    }}
                    title={
                      copyFeedback === "Wallet address copied"
                        ? "Address copied"
                        : "Copy address"
                    }
                    aria-label={
                      copyFeedback === "Wallet address copied"
                        ? "Address copied"
                        : "Copy address"
                    }
                  >
                    {copyFeedback === "Wallet address copied" ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
              ) : null}
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-[168px_minmax(0,1fr)]">
              <div className="flex items-center justify-center rounded-md border border-border/60 bg-background/40 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                {lockingContract.address ? (
                  <ReceiveAddressQrCode address={walletReceiveAddress ?? lockingContract.address} />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-center">
                    <Wallet2 className="h-6 w-6 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Address unavailable</p>
                  </div>
                )}
              </div>
              <div>
                <div className="rounded-md border border-border/60 bg-background/50 p-3">
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
                {/* The two boxes that used to sit here restated the panel heading above them
                    ("Share this address when someone needs to send funds into this wallet")
                    and the panel below them, in chrome that looked like a control. */}
              </div>
            </div>
          </div>
          {/* Named for the second way money gets in, so it contrasts with "Receive address"
              above instead of repeating the card's own "Add funds details" title. */}
          <div className="space-y-4 rounded-lg border border-border/60 bg-background/40 p-3 sm:p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Add funds yourself</p>
              {/* Always the description. Falling back to `lockingContract.error` printed the
                  same sentence a third time on one screen: it is already under the QR tile and
                  again in the review rail. */}
              <p className="text-xs text-muted-foreground">
                Move ADA or tokens from the wallet you are connected with into this one.
              </p>
            </div>
            {/* No second address box. It printed `lockingContract.address` while the panel above
                prints `walletReceiveAddress ?? lockingContract.address`, so one screen showed the
                same wallet under two labels from two different derivations, and only the first
                copy had the copy button and the explorer link. */}
            <AssetListEditor
              label="What to add"
              helper="Set the ADA amount, or add any tokens the connected wallet already holds."
              value={lockFundsAssets}
              onChange={setLockFundsAssets}
              availableAssets={walletBalanceSummary.assets}
            />
            <InlineFieldError message={getFirstFieldError(activeFieldErrors, "Assets to lock")} />
          </div>
        </div>
      );
}
