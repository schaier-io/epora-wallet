"use client";
import { useTranslations } from "next-intl";

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
  const i18n = useTranslations("ComponentsUserWorkspaceWorkspaceHeaderView");
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
    // `loading` is the whole signal. It used to be OR-ed with "the balance is zero", on the
    // grounds that a freshly-connected wallet briefly reports nothing. But `useWalletBalance`
    // already sets `loading` around the fetch, so the extra clause only caught wallets that had
    // finished loading and really were empty, and pinned them on "Checking funds…" for good.
    // VERIFIED with the demo wallet, whose `getUtxos` resolves to `[]` (`lib/wallet/demo-wallet.ts:40`):
    // the pill still read "Checking funds…", spinner turning, 15 minutes after load.
    const browserWalletFundsPending = walletBalanceSummary.loading;
    const browserWalletFundsEmpty =
      !browserWalletFundsLovelace || browserWalletFundsLovelace === "0";
    const browserWalletFundsLabel = browserWalletFundsPending
      ? i18n("checkingFunds")
      : walletBalanceSummary.error
        ? i18n("walletBalanceUnavailable")
        : browserWalletFundsEmpty
          ? i18n("noAdaAvailable")
          : i18n("value1AdaAvailable", { value1: formatLovelaceAsAdaRounded(
              browserWalletFundsLovelace ?? "0",
              2
            ) });
    // The tooltip exists to add the precision the rounded label drops. On an empty wallet it
    // has none to add: it read "0 ADA available" under a label already saying "No ADA available".
    const browserWalletFundsTitle =
      browserWalletFundsLovelace && !browserWalletFundsEmpty
        ? i18n("value1AdaAvailable", { value1: formatLovelaceAsAda(browserWalletFundsLovelace) })
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
      ? i18n("welcomeToEporaWallet")
      : routeState.workspaceMode === "new-wallet"
        ? i18n("createWallet")
        : routeState.workspaceMode === "landing"
          ? i18n("chooseYourNextStep")
          : selectedDetectedToken
            ? null // top nav pill already shows the wallet name; avoid triplication
            : i18n("openAWallet");
    const guidedWorkspaceDescription = !walletReady
      ? i18n("shareOneNonCustodialCardanoWalletAcrossOwners")
      : routeState.workspaceMode === "new-wallet"
        ? i18n("nameTheWalletChooseWhoCanUseIt")
        : routeState.workspaceMode === "landing"
          ? i18n("createANewSmartWalletOrOpenOne")
          : selectedDetectedToken
            ? wizardSelectedAction
              ? selectedActionDefinition.label
              : null
            : i18n("chooseTheSmartWalletThisSessionShouldUse");

  // Two shapes, decided by whether there is anything to name. With a title the card is a
  // header: icon, title, description, and the status pills opposite them. Without one it is a
  // toolbar. The app spends most of its life in that second state -- a wallet open, no action
  // started -- where the title and description are both deliberately null, because the top nav
  // already names the wallet. It still drew the full card: a 40px icon badging nothing, 899px
  // of empty card, then the pills. Measured at 1440px wide.
  const hasWorkspaceIdentity = Boolean(guidedWorkspaceTitle || guidedWorkspaceDescription);

  const statusControls = (
    <div
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-2 text-xs",
        // As a toolbar these are the only thing on the row, so wrapped lines have to align
        // themselves. At 390px the three controls break after the second and the refresh
        // button landed alone at the far left, opposite the two it belongs with. Inside the
        // card the surrounding flex already places the group, so it keeps its own alignment.
        !hasWorkspaceIdentity && "justify-end"
      )}
    >
      {walletReady ? (
        <span
          className="inline-flex h-8 items-center gap-2 rounded-full border border-border/60 bg-background/45 px-3 text-muted-foreground"
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
          className="group inline-flex h-8 items-center gap-2 rounded-full border border-border/60 bg-background/45 px-3 text-muted-foreground transition-colors hover:border-sky-300/40 hover:text-foreground"
          aria-label={i18n("smartWalletsValue1SwitchOrCreateOne", { value1: permissionWalletCards.length })}
        >
          <FolderOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{i18n("smartWallets")}</span>
          <Badge variant="outline" className="px-2 py-0 text-xs">
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
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/45 text-muted-foreground transition-colors hover:border-sky-300/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          aria-label={i18n("reloadWalletFundsSummariesAndRecentActivity")}
          title={i18n("refreshWalletData")}
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
  );

  if (!hasWorkspaceIdentity) {
    return statusControls;
  }

  return (
    <Card
      className={cn(
        "user-surface relative overflow-hidden border-border/70 bg-card/85 backdrop-blur",
        // Pre-connect, the only thing under this header is the onboarding card, and that card
        // is `max-w-3xl` centred so its copy keeps a readable measure. The header was not, so
        // the screen opened with two stacked cards on different rails: measured at 1440x900,
        // this one ran 40..1400 and the card under it 336..1104. Same width, same centre line,
        // for that one state. Every other state fills the container, and so does this.
        !walletReady && "mx-auto w-full max-w-3xl"
      )}
    >
      <SoftAurora className="opacity-85" />
      <CardContent className="relative z-10">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-300/20 bg-background/70 text-emerald-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <GuidedWorkspaceHeaderIcon className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 space-y-1">
              {guidedWorkspaceTitle ? (
                <h2 className="truncate text-base font-semibold leading-tight tracking-tight md:text-lg">
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
          {statusControls}
        </div>
      </CardContent>
    </Card>
  );
}
