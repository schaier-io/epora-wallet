"use client";
import { selectedDetectedTokenUnitAtom } from "@/components/user/workspace/atoms/workspace-selection.atoms";
import { walletReadyAtom } from "@/providers/wallet.atoms";
import { detectedSttTokensErrorAtom, detectedSttTokensLoadingAtom, permissionWalletSummariesLoadingAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";

import {
  ChevronRight,
  FolderOpen,
  Plus,
  RefreshCw,
  Search,
  Wallet2
} from "lucide-react";

import {
  AnimatedList,
  BorderGlow,
  FadeContent,
  SpotlightCard
} from "@/components/react-bits/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import { InfoHint } from "@/components/ui/info-hint";
import { Label } from "@/components/ui/label";

import {
  formatLovelaceAsAda } from "@/lib/user-flow/guided-helpers";

import { cn } from "@/lib/utils/cn";
import { getAssetQuantityByUnit } from "@/components/user/workspace/helpers";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";
import { useAtomValue, useSetAtom } from "jotai";
import { detectedTokenSearchAtom, walletConnectionDialogOpenAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";

export function WalletSelectionDialogView() {
  const state = useWorkspaceActions();
  const selectedDetectedTokenUnit = useAtomValue(selectedDetectedTokenUnitAtom);
  const walletReady = useAtomValue(walletReadyAtom);
  const detectedSttTokensLoading = useAtomValue(detectedSttTokensLoadingAtom);
  const detectedSttTokensError = useAtomValue(detectedSttTokensErrorAtom);
  const permissionWalletSummariesLoading = useAtomValue(permissionWalletSummariesLoadingAtom);
  const setWalletConnectionDialogOpen = useSetAtom(walletConnectionDialogOpenAtom);
  const detectedTokenSearch = useAtomValue(detectedTokenSearchAtom);
  const setDetectedTokenSearch = useSetAtom(detectedTokenSearchAtom);
  const {
    autoOpenDetectedWalletUnit,
    filteredPermissionWalletCards,
    handleDetectedTokenChange,
    handleFlowBranchSelect,
    permissionWalletCards,
    refreshDetectedTokens,
    refreshPermissionWalletSummaries,
  } = state;

  return (
      <div className="space-y-5">
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Smart wallets
          </p>
          <h3 className="flex items-center gap-2 text-base font-semibold leading-snug text-foreground md:text-[17px]">
            Choose or create a smart wallet
            <InfoHint label="More about opening wallets" contentClassName="max-w-sm">
              These are the smart wallets detected for the connected signer.
              Opening one changes the wallet this workspace is managing. Creating a new one keeps
              the same connected signer and starts a fresh smart wallet setup.
            </InfoHint>
          </h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Pick an existing wallet or create a new one.
          </p>
        </div>

        {!walletReady ? (
          <FadeContent
            blur
            className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border/70 bg-muted/15 px-5 py-8 text-center sm:px-8"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border/60 bg-background/70 shadow-sm">
              <Wallet2 className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
            </div>
            <div className="max-w-md space-y-2">
              <p className="text-sm font-semibold text-foreground">Finish step 1 first</p>
              <div className="flex items-center justify-center gap-2 text-sm leading-relaxed text-muted-foreground">
                <span>Connect a Preprod browser wallet.</span>
                <InfoHint label="More about wallet detection" contentClassName="max-w-sm">
                  This list fills automatically when smart wallets are found for your connected
                  address.
                </InfoHint>
              </div>
            </div>
          </FadeContent>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                setWalletConnectionDialogOpen(false);
                handleFlowBranchSelect("new-wallet");
              }}
              className="group relative isolate flex w-full min-w-0 items-center gap-3 overflow-hidden rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-4 text-left shadow-[0_0_0_1px_rgba(45,212,191,0.08)] transition-[background-color,border-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-emerald-300/45 hover:bg-emerald-400/15 hover:shadow-[0_16px_42px_rgba(15,118,110,0.22)]"
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-emerald-300/70"
              />
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-300/25 bg-emerald-300/15 text-emerald-100 transition-transform duration-200 ease-out group-hover:scale-105">
                <Plus className="h-4.5 w-4.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold leading-tight text-foreground">
                  Create new smart wallet
                </span>
                <span className="mt-1 block text-xs leading-snug text-muted-foreground">
                  Start a fresh wallet with this signer.
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-emerald-100/80 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
            </button>

            <div className="flex w-full flex-wrap items-end gap-x-3 gap-y-2">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label
                  htmlFor="walletDialogSearch"
                  className="inline-flex items-center gap-2"
                >
                  <Search className="h-3.5 w-3.5 text-muted-foreground" />
                  Search smart wallets
                </Label>
                <Input
                  id="walletDialogSearch"
                  value={detectedTokenSearch}
                  onChange={(event) => setDetectedTokenSearch(event.target.value)}
                  placeholder="Wallet name or receipt code"
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="ml-auto shrink-0"
                onClick={() => {
                  void refreshDetectedTokens();
                  void refreshPermissionWalletSummaries();
                }}
                disabled={detectedSttTokensLoading || permissionWalletSummariesLoading}
              >
                <RefreshCw
                  className={cn(
                    "h-4 w-4 transition-transform",
                    (detectedSttTokensLoading || permissionWalletSummariesLoading) && "animate-spin"
                  )}
                />
                Refresh
              </Button>
            </div>

            {autoOpenDetectedWalletUnit &&
            selectedDetectedTokenUnit === autoOpenDetectedWalletUnit ? (
              <FadeContent className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-foreground">
                Your only detected smart wallet was opened automatically.
              </FadeContent>
            ) : null}

            {detectedSttTokensError ? (
              <FadeContent className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                {detectedSttTokensError}
              </FadeContent>
            ) : null}

            <div className="user-scrollbar max-h-[420px] overflow-y-auto pr-1">
              {filteredPermissionWalletCards.length === 0 ? (
                <FadeContent className="rounded-xl border border-dashed border-border/70 bg-background/30 p-5 text-sm text-muted-foreground">
                  {detectedSttTokensLoading
                    ? "Refreshing detected wallets..."
                    : permissionWalletCards.length === 0
                      ? "No smart wallets were detected yet. Create one first or refresh after setup."
                      : "No detected wallets match the current search."}
                </FadeContent>
              ) : (
                <AnimatedList
                  className="space-y-2"
                  itemClassName="w-full"
                  stagger={55}
                  distance={18}
                  reveal="mount"
                >
                  {filteredPermissionWalletCards.map((entry) => {
                    const isSelected = entry.token.unit === selectedDetectedTokenUnit;
                    const lockedLovelace = formatLovelaceAsAda(
                      getAssetQuantityByUnit(entry.lockedSummary?.lockedAssets ?? [], "lovelace")
                    );
                    const nonLovelaceCount =
                      (entry.lockedSummary?.lockedAssets ?? []).filter(
                        (asset) => asset.unit !== "lovelace"
                      ).length;

                    return (
                      <SpotlightCard
                        key={entry.token.unit}
                        className="rounded-2xl"
                        spotlightColor="rgba(82, 255, 220, 0.16)"
                      >
                        {isSelected ? <BorderGlow /> : null}
                        <button
                          type="button"
                          onClick={() => {
                            handleDetectedTokenChange(entry.token);
                            setWalletConnectionDialogOpen(false);
                          }}
                          className={cn(
                            "relative z-10 w-full rounded-2xl border p-3 text-left transition-all",
                            isSelected
                              ? "border-primary/50 bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)/0.2)]"
                              : "border-border/70 bg-background/50 hover:border-primary/30 hover:bg-background/70"
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 space-y-1">
                              <p className="truncate font-semibold text-foreground">
                                {entry.primaryLabel}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Ref {entry.secondaryLabel}...
                              </p>
                            </div>
                            <Badge variant={isSelected ? "secondary" : "outline"}>
                              <FolderOpen className="h-3 w-3" />
                              {isSelected ? "Opened" : "Open"}
                            </Badge>
                          </div>
                          {entry.roleBadges.length > 0 || entry.warning ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {entry.roleBadges.slice(0, 3).map((badge) => (
                                <Badge key={`${entry.token.unit}-${badge}`} variant="outline">
                                  {badge}
                                </Badge>
                              ))}
                            </div>
                          ) : null}
                          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <span className="rounded-full border border-border/60 bg-muted/20 px-2.5 py-1">
                              {lockedLovelace} ADA
                            </span>
                            <span className="rounded-full border border-border/60 bg-muted/20 px-2.5 py-1">
                              {entry.lockedSummary?.lockedUtxoCount ?? 0} pools
                            </span>
                            <span className="rounded-full border border-border/60 bg-muted/20 px-2.5 py-1">
                              {nonLovelaceCount} assets
                            </span>
                          </div>
                          {entry.warning ? (
                            <p className="mt-2 text-xs text-amber-300">{entry.warning}</p>
                          ) : null}
                        </button>
                      </SpotlightCard>
                    );
                  })}
                </AnimatedList>
              )}
            </div>
          </>
        )}
      </div>
  );
}
