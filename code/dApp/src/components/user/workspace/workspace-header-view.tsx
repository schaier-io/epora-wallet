"use client";
import { walletTransactionsAtom } from "@/components/user/workspace/atoms/workspace-activity.atoms";
import { selectedDetectedTokenAtom } from "@/components/user/workspace/atoms/workspace-detected-token.atoms";
import { routeStateAtom } from "@/components/user/workspace/atoms/workspace-route.atoms";
import { wizardSelectedActionAtom } from "@/components/user/workspace/atoms/workspace-selection.atoms";
import { walletReadyAtom } from "@/providers/wallet.atoms";
import { lockedContractUtxosLoadingAtom, permissionWalletSummariesLoadingAtom, walletBalanceSummaryAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import { useSetAtom, useAtomValue } from "jotai";
import { walletConnectionDialogOpenAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";
import {
  ChevronRight,
  FolderOpen,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Waypoints,
  Wallet2
} from "lucide-react";

import {
  SoftAurora
} from "@/components/react-bits/primitives";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent
} from "@/components/ui/card";

import {
  formatLovelaceAsAda,
  formatLovelaceAsAdaRounded } from "@/lib/user-flow/guided-helpers";

import { cn } from "@/lib/utils/cn";
import { getAssetQuantityByUnit } from "@/components/user/workspace/helpers";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";

export function WorkspaceHeaderView() {
  const state = useWorkspaceActions();
  const walletTransactions = useAtomValue(walletTransactionsAtom);
  const routeState = useAtomValue(routeStateAtom);
  const selectedDetectedToken = useAtomValue(selectedDetectedTokenAtom);
  const walletReady = useAtomValue(walletReadyAtom);
  const wizardSelectedAction = useAtomValue(wizardSelectedActionAtom);
  const permissionWalletSummariesLoading = useAtomValue(permissionWalletSummariesLoadingAtom);
  const walletBalanceSummary = useAtomValue(walletBalanceSummaryAtom);
  const lockedContractUtxosLoading = useAtomValue(lockedContractUtxosLoadingAtom);
  const setWalletConnectionDialogOpen = useSetAtom(walletConnectionDialogOpenAtom);
  const {
    permissionWalletCards,
    refreshDetectedTokens,
    refreshPermissionWalletSummaries,
    refreshWorkspaceSummary,
    selectedActionDefinition,
  } = state;

    const browserWalletFundsLovelace = walletBalanceSummary.loading || walletBalanceSummary.error
      ? null
      : getAssetQuantityByUnit(walletBalanceSummary.assets, "lovelace");
    // Treat empty/zero-balance state as "still fetching" — a freshly-connected wallet briefly
    // reports no balances before the adapter resolves UTxOs, and a truly empty wallet still
    // owes at least the min-UTxO fee for any signed action, so 0 here is almost always loading.
    const browserWalletFundsPending =
      walletBalanceSummary.loading ||
      (walletReady &&
        !walletBalanceSummary.error &&
        (walletBalanceSummary.assets.length === 0 ||
          !browserWalletFundsLovelace ||
          browserWalletFundsLovelace === "0"));
    const browserWalletFundsLabel = browserWalletFundsPending
      ? "Checking funds…"
      : walletBalanceSummary.error
        ? "Funds unavailable"
        : `${formatLovelaceAsAdaRounded(
            browserWalletFundsLovelace ?? "0",
            2
          )} ADA available`;
    const browserWalletFundsTitle = browserWalletFundsLovelace
      ? `${formatLovelaceAsAda(browserWalletFundsLovelace)} ADA available`
      : undefined;
    const GuidedWorkspaceHeaderIcon =
      !walletReady
        ? Wallet2
        : routeState.workspaceMode === "new-wallet"
          ? Plus
          : routeState.workspaceMode === "landing"
            ? Waypoints
            : selectedDetectedToken
              ? Wallet2
              : FolderOpen;
    const guidedWorkspaceTitle: string | null = !walletReady
      ? "Welcome to Epora Wallet"
      : routeState.workspaceMode === "new-wallet"
        ? "Create wallet"
        : routeState.workspaceMode === "landing"
          ? "Choose your next step"
          : selectedDetectedToken
            ? null // top nav pill already shows the wallet name; avoid triplication
            : "Open a wallet";
    const guidedWorkspaceDescription = !walletReady
      ? "Share one non-custodial Cardano wallet across owners and spenders. On-chain daily limits, multisig, and a wake-up timer that lets recovery contacts recover the wallet if keys are lost — all enforced by Cardano smart contracts."
      : routeState.workspaceMode === "new-wallet"
        ? "Name the wallet, choose who can use it, and add its first funds."
        : routeState.workspaceMode === "landing"
          ? "Create a new smart wallet, or open one you already control."
          : selectedDetectedToken
            ? wizardSelectedAction
              ? selectedActionDefinition.label
              : null
            : "Choose the smart wallet this session should use.";

  return (
        <Card className="user-surface relative overflow-hidden border-border/70 bg-card/85 backdrop-blur">
          <SoftAurora className="opacity-85" />
          <CardContent className="relative z-10 px-4 py-5 md:px-5 md:py-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-300/20 bg-background/70 text-emerald-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  <GuidedWorkspaceHeaderIcon className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0 space-y-1">
                  {guidedWorkspaceTitle ? (
                    <h2
                      id="pw-guided-workspace-title"
                      className="truncate text-base font-semibold leading-tight tracking-tight md:text-lg"
                    >
                      {guidedWorkspaceTitle}
                    </h2>
                  ) : null}
                  {guidedWorkspaceDescription ? (
                    <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground md:text-sm">
                      {guidedWorkspaceDescription}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
                {walletReady ? (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/45 px-2.5 py-1 text-muted-foreground"
                    title={browserWalletFundsTitle}
                  >
                    {browserWalletFundsPending ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden="true" />
                    )}
                    <span className="font-medium text-foreground">
                      {browserWalletFundsLabel}
                    </span>
                  </span>
                ) : null}
                {walletReady && permissionWalletCards.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setWalletConnectionDialogOpen(true);
                      void refreshDetectedTokens();
                      void refreshPermissionWalletSummaries();
                    }}
                    className="group inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/45 px-2.5 py-1 text-muted-foreground transition-colors hover:border-sky-300/40 hover:text-foreground"
                    aria-label="Switch or create smart wallet"
                  >
                    <FolderOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>Smart wallets</span>
                    <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                      {permissionWalletCards.length}
                    </Badge>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" />
                  </button>
                ) : null}
                {walletReady && selectedDetectedToken ? (
                  <button
                    type="button"
                    onClick={() => void refreshWorkspaceSummary(true)}
                    disabled={
                      lockedContractUtxosLoading ||
                      permissionWalletSummariesLoading ||
                      walletTransactions.loading
                    }
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/45 text-muted-foreground transition-colors hover:border-sky-300/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label="Reload wallet funds, summaries, and recent activity"
                    title="Refresh wallet data"
                  >
                    <RefreshCw
                      className={cn(
                        "h-3.5 w-3.5 transition-transform",
                        (lockedContractUtxosLoading ||
                          permissionWalletSummariesLoading ||
                          walletTransactions.loading) &&
                          "animate-spin"
                      )}
                    />
                  </button>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
  );
}
