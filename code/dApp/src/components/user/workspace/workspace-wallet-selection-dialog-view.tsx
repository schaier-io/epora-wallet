"use client";
import { useTranslations } from "next-intl";

import { selectedDetectedTokenUnitAtom } from "@/components/user/workspace/atoms/workspace-selection.atoms";
import { networkIdAtom, walletReadyAtom } from "@/providers/wallet.atoms";
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
import { Label } from "@/components/ui/label";

import {
  formatLovelaceAsAda } from "@/lib/user-flow/guided-helpers";

import { cn } from "@/lib/utils/cn";
import { formatCountLabel, getAssetQuantityByUnit } from "@/components/user/workspace/helpers";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";
import { useAtomValue, useSetAtom } from "jotai";
import { detectedTokenSearchAtom, walletConnectionDialogOpenAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";

export function WalletSelectionDialogView() {
  const i18n = useTranslations("ComponentsUserWorkspaceWorkspaceWalletSelectionDialogView");
  const state = useWorkspaceActions();
  const selectedDetectedTokenUnit = useAtomValue(selectedDetectedTokenUnitAtom);
  const walletReady = useAtomValue(walletReadyAtom);
  const networkId = useAtomValue(networkIdAtom);
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

  // Two ways this list can stay empty, and they need different instructions. `walletReady`
  // collapses them: it is false both before a wallet connects and while one is connected to
  // the wrong network. The old copy answered only the first ("Finish step 1 first"), and it
  // pointed at a numbered step that the dialog only draws while disconnected.
  const blocked =
    networkId !== null && networkId !== 0
      ? {
          title: i18n("yourWalletIsOnTheWrongNetwork"),
          body: i18n("eporaRunsOnPreprodTheCardanoTestNetwork")
        }
      : {
          title: i18n("noWalletConnected"),
          body: i18n("connectACardanoWalletOnPreprodYourSmart")
        };

  // Badges come from `derivePermissionWalletBadgeLabels` as bare labels; the title says
  // what each one means for the connected key.
  const badgeTitles: Record<string, string> = {
    Owner: i18n("youAreAnOwnerOfThisWallet"),
    Allowance: i18n("youCanSpendFromThisWalletWithinYour"),
    Recovery: i18n("youAreARecoveryContactForThisWallet"),
    Scheduled: i18n("thisWalletHasScheduledPayments"),
    "Receive only": i18n("thisWalletCanOnlyReceiveFunds")
  };

  return (
      <div className="space-y-4">
        {!walletReady ? (
          <FadeContent
            blur
            className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border/70 bg-muted/15 p-3 sm:p-4 text-center"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-border/60 bg-background/70 shadow-sm">
              <Wallet2 className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
            </div>
            <div className="max-w-md space-y-2">
              <p className="eyebrow font-semibold text-muted-foreground">{i18n("smartWallets")}</p>
              <p className="text-sm font-semibold text-foreground">{blocked.title}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">{blocked.body}</p>
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
              aria-label={i18n("createNewSmartWallet")}
              className="group relative isolate flex w-full min-w-0 items-center gap-3 overflow-hidden rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-3 text-left shadow-[0_0_0_1px_rgba(45,212,191,0.08)] transition-[background-color,border-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-emerald-300/45 hover:bg-emerald-400/15 hover:shadow-[0_16px_42px_rgba(15,118,110,0.22)]"
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-emerald-300/70"
              />
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-emerald-300/25 bg-emerald-300/15 text-emerald-100 transition-transform duration-200 ease-out group-hover:scale-105">
                <Plus className="h-4.5 w-4.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold leading-tight text-foreground">
                  {i18n("createNewSmartWallet")}
                </span>
                <span className="mt-1 block text-xs leading-snug text-muted-foreground">
                  {i18n("setUpAnotherSmartWalletFromScratch")}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-emerald-100/80 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
            </button>

            <div className="flex w-full flex-wrap items-end gap-x-3 gap-y-2">
              <div className="min-w-0 flex-1 space-y-1">
                <Label
                  htmlFor="walletDialogSearch"
                  className="inline-flex items-center gap-2"
                >
                  <Search className="h-3.5 w-3.5 text-muted-foreground" />
                  {i18n("searchSmartWallets")}
                </Label>
                <Input
                  id="walletDialogSearch"
                  value={detectedTokenSearch}
                  onChange={(event) => setDetectedTokenSearch(event.target.value)}
                  placeholder={i18n("searchByWalletName")}
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
                {i18n("refresh")}
              </Button>
            </div>

            {autoOpenDetectedWalletUnit &&
            selectedDetectedTokenUnit === autoOpenDetectedWalletUnit ? (
              <FadeContent className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-foreground">
                {i18n("youHaveOneSmartWalletSoItWas")}
              </FadeContent>
            ) : null}

            {detectedSttTokensError ? (
              <FadeContent className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100">
                {detectedSttTokensError}
              </FadeContent>
            ) : null}

            <div className="user-scrollbar max-h-[420px] overflow-y-auto">
              {filteredPermissionWalletCards.length === 0 ? (
                <FadeContent className="rounded-lg border border-dashed border-border/70 bg-background/30 p-3 sm:p-4 text-sm text-muted-foreground">
                  {detectedSttTokensLoading
                    ? i18n("lookingForYourSmartWallets")
                    : permissionWalletCards.length === 0
                      ? i18n("noSmartWalletsForThisKeyYetWalletsAppear")
                      : i18n("noWalletsMatchThatSearch")}
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
                        className="rounded-lg"
                        spotlightColor="rgba(82, 255, 220, 0.16)"
                      >
                        {isSelected ? <BorderGlow /> : null}
                        <button
                          type="button"
                          aria-label={i18n("openName", { name: entry.primaryLabel })}
                          onClick={() => {
                            handleDetectedTokenChange(entry.token);
                            setWalletConnectionDialogOpen(false);
                          }}
                          className={cn(
                            "relative z-10 w-full rounded-lg border p-3 text-left transition-all",
                            isSelected
                              ? "border-primary/50 bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)/0.2)]"
                              : "border-border/70 bg-background/50 hover:border-primary/30 hover:bg-background/70"
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            {/* No subtitle: the detected token carries no creation time,
                                and a truncated transaction hash told the reader nothing. */}
                            <p className="min-w-0 truncate font-semibold text-foreground">
                              {entry.primaryLabel}
                            </p>
                            {isSelected ? (
                              <Badge variant="secondary">
                                <FolderOpen className="h-3 w-3" />
                                {i18n("current")}
                              </Badge>
                            ) : null}
                          </div>
                          {entry.roleBadges.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {entry.roleBadges.slice(0, 3).map((badge) => (
                                <Badge
                                  key={`${entry.token.unit}-${badge}`}
                                  variant="outline"
                                  title={badgeTitles[badge]}
                                >
                                  {badge}
                                </Badge>
                              ))}
                            </div>
                          ) : null}
                          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <span className="rounded-full border border-border/60 bg-muted/20 px-2 py-1">
                              {lockedLovelace} {i18n("ada")}
                            </span>
                            <span className="rounded-full border border-border/60 bg-muted/20 px-2 py-1">
                              {formatCountLabel(entry.lockedSummary?.lockedUtxoCount ?? 0, "fund pool")}
                            </span>
                            <span className="rounded-full border border-border/60 bg-muted/20 px-2 py-1">
                              {formatCountLabel(nonLovelaceCount, "asset")}
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
