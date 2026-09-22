"use client";
import { useTranslations } from "next-intl";

import { walletTransactionsAtom } from "@/components/user/workspace/atoms/workspace-activity.atoms";
import { selectedDetectedTokenAtom } from "@/components/user/workspace/atoms/workspace-detected-token.atoms";
import { routeStateAtom } from "@/components/user/workspace/atoms/workspace-route.atoms";
import { wizardSelectedActionAtom } from "@/components/user/workspace/atoms/workspace-selection.atoms";
import { walletReadyAtom } from "@/providers/wallet.atoms";
import { detectedSttTokensErrorAtom, detectedSttTokensLoadingAtom, lockedContractUtxosLoadingAtom, permissionWalletSummariesLoadingAtom, walletBalanceSummaryAtom } from "@/components/user/workspace/atoms/workspace-data.atoms";
import { useSetAtom, useAtomValue } from "jotai";
import { activeInferredSttStateFormAtom } from "@/components/user/workspace/atoms/workspace-wallet-derivations.atoms";
import { normalizeWalletName } from "@/lib/contracts/state-wallet-name";
import { walletConnectionDialogOpenAtom } from "@/components/user/workspace/atoms/workspace-ui.atoms";
import {
  AlertCircle,
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
import { Skeleton } from "@/components/ui/skeleton";
import { pageHeadingClass } from "@/components/ui/page-heading";

import {
  formatLovelaceAsAda,
  formatLovelaceAsAdaRounded
} from "@/lib/units/lovelace";

import { cn } from "@/lib/utils/cn";
import { getAssetQuantityByUnit } from "@/components/user/workspace/helpers";

import { useWorkspaceActions } from "@/components/user/workspace/workspace-actions-context";

export function WorkspaceHeaderView() {
  const i18n = useTranslations("ComponentsUserWorkspaceWorkspaceHeaderView");
  const state = useWorkspaceActions();
  const walletTransactions = useAtomValue(walletTransactionsAtom);
  const activeInferredSttStateForm = useAtomValue(activeInferredSttStateFormAtom);
  const routeState = useAtomValue(routeStateAtom);
  const selectedDetectedToken = useAtomValue(selectedDetectedTokenAtom);
  const detectedSttTokensError = useAtomValue(detectedSttTokensErrorAtom);
  const detectedSttTokensLoading = useAtomValue(detectedSttTokensLoadingAtom);
  const walletReady = useAtomValue(walletReadyAtom);
  const wizardSelectedAction = useAtomValue(wizardSelectedActionAtom);
  const permissionWalletSummariesLoading = useAtomValue(permissionWalletSummariesLoadingAtom);
  const walletBalanceSummary = useAtomValue(walletBalanceSummaryAtom);
  const lockedContractUtxosLoading = useAtomValue(lockedContractUtxosLoadingAtom);
  const walletLookupFailed =
    walletReady &&
    routeState.workspaceMode === "existing-wallet" &&
    Boolean(detectedSttTokensError);
  const walletIsResolving =
    walletReady &&
    routeState.workspaceMode === "existing-wallet" &&
    !selectedDetectedToken &&
    detectedSttTokensLoading &&
    !detectedSttTokensError;
  const setWalletConnectionDialogOpen = useSetAtom(walletConnectionDialogOpenAtom);
  const {
    permissionWalletCards,
    refreshDetectedTokens,
    refreshPermissionWalletSummaries,
    refreshWorkspaceSummary,
  } = state;

    // The summaries are built from the detected-token list, so the re-scan has to finish
    // first: running both against the old list races the detection, and a wallet that just
    // appeared gets no summary (a removed one keeps its stale one) until the next refresh.
    const rescanSmartWalletList = () => {
      void (async () => {
        const detected = await refreshDetectedTokens();
        if (!detected) return;
        await refreshPermissionWalletSummaries(detected.tokens);
      })();
    };

    // This pill is the connected *browser* wallet, the key that signs and pays the fee.
    // The smart-wallet card below shows a different figure. Both used to read only
    // "wallet", so the labels now name which wallet each number belongs to.
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
        : walletLookupFailed
          ? AlertCircle
          : routeState.workspaceMode === "new-wallet"
            ? Plus
            : routeState.workspaceMode === "landing"
              ? Waypoints
              : selectedDetectedToken
                ? Wallet2
                : FolderOpen;
    const guidedWorkspaceTitle: string | null = !walletReady
      ? i18n("welcomeToEporaWallet")
      : walletLookupFailed
        ? selectedDetectedToken
          ? i18n("walletCouldNotRefresh") // a cached wallet is still open below
          : i18n("walletCouldNotLoad")
        : routeState.workspaceMode === "new-wallet"
          ? i18n("createWallet")
          : routeState.workspaceMode === "landing"
            ? i18n("chooseYourNextStep")
            : selectedDetectedToken
              ? null // the home card and, during an action, the description name the wallet
              : i18n("openAWallet");
    const guidedWorkspaceDescription = !walletReady
      ? i18n("shareOneNonCustodialCardanoWalletAcrossOwners")
      : walletLookupFailed
        ? detectedSttTokensError
        : routeState.workspaceMode === "new-wallet"
          ? i18n("nameTheWalletChooseWhoCanUseIt")
          : routeState.workspaceMode === "landing"
            ? i18n("createANewSmartWalletOrOpenOne")
            : selectedDetectedToken
              ? wizardSelectedAction
                // The smart wallet the action runs against. This was the action's label,
                // which the card below already carries as its title, while no other surface
                // named the smart wallet during an action: the top nav names the browser one.
                ? normalizeWalletName(activeInferredSttStateForm.walletName)
                : null
              : i18n("chooseTheSmartWalletThisSessionShouldUse");

  // Two shapes, decided by whether there is anything to name. With a title the card is a
  // header: icon, title, description, and the status pills opposite them. Without one it is a
  // toolbar. The app spends most of its life in that second state -- a wallet open, no action
  // started -- where the title and description are both deliberately null, because the home
  // card below names the smart wallet. It still drew the full card: a 40px icon badging nothing, 899px
  // of empty card, then the pills. Measured at 1440px wide.
  const hasWorkspaceIdentity = Boolean(guidedWorkspaceTitle || guidedWorkspaceDescription);

  if (walletIsResolving) {
    return (
      <Card
        role="status"
        aria-label={i18n("loadingYourWallet")}
        className="user-surface relative overflow-hidden border-border/70 bg-card/85"
      >
        <CardContent>
          <span className="sr-only">{i18n("loadingYourWallet")}</span>
          <div className="flex items-center gap-3" aria-hidden="true">
            <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-40 max-w-full" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </div>
            <Skeleton className="hidden h-8 w-28 sm:block" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Every control below is gated on `walletReady`, so signed out this div rendered empty and
  // still took a `gap-3` slot beside the header text.
  // One name for the refresh control, used for both the tooltip and the accessible name.
  // They used to differ: the tooltip read "Refresh wallet data" while the accessible name
  // read "Refresh the smart wallet list" (or the funds sentence in the other branch), so the
  // only name a sighted mouse user could read was not a name a speech-input user could say.
  const refreshLabel = selectedDetectedToken
    ? i18n("reloadWalletFundsSummariesAndRecentActivity")
    : i18n("reloadTheSmartWalletList");

  const statusControls = !walletReady ? null : (
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
          ) : walletBalanceSummary.error || browserWalletFundsEmpty ? (
            // A wallet with no ADA cannot pay a fee: a problem, so it is not green.
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />
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
            rescanSmartWalletList();
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
      {/* Refresh exists whenever a browser wallet is connected, not only behind an open smart
          wallet. With the list scoped to the connected key's roles, a fresh key (or a wallet
          created in another tab) sees zero cards here, and this button is then the only way
          to re-scan without reconnecting. */}
      {walletReady ? (
        <button
          type="button"
          onClick={() => {
            if (selectedDetectedToken) {
              void refreshWorkspaceSummary(true);
              return;
            }
            rescanSmartWalletList();
          }}
          disabled={
            lockedContractUtxosLoading ||
            permissionWalletSummariesLoading ||
            walletTransactions.loading
          }
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/45 text-muted-foreground transition-colors hover:border-sky-300/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          aria-label={refreshLabel}
          title={refreshLabel}
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
          {/* Top-anchored only while there are two lines to anchor to. `items-start` plus
              `mt-0.5` puts the tile's top edge on the title's em box, so its offset from the
              heading it labels never grows with the description. Measured at 1440px on the
              pre-connect state: title 28.8px, `space-y-1` 4px, a two-line description 45.5px,
              so the block runs 78.3px against a 42px tile -- `items-center` would sit the
              tile 18px below the heading, and further still as the description wraps.
              With only one of the two, the block (28.8px) is shorter than the tile and
              `items-start` would strand that single line at the top of a 42px row, so that
              state keeps `items-center` -- which is exactly right when the tile is tallest. */}
          <div
            className={cn(
              "flex min-w-0 gap-3",
              guidedWorkspaceTitle && guidedWorkspaceDescription ? "items-start" : "items-center"
            )}
          >
            <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-300/20 bg-background/70 text-emerald-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <GuidedWorkspaceHeaderIcon className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 space-y-1">
              {guidedWorkspaceTitle ? (
                // `pageHeadingClass`, not a local size. Every title this header renders --
                // "Create wallet", "Choose your next step", "Welcome to Epora Wallet" -- is
                // DESIGN.md's Headline rung, "page task and major workflow state", and
                // /setup, /payee and the proposals workspace already render that rung at
                // 1.5rem through this same class. At `text-base md:text-lg` this header
                // instead rendered 18px, the exact size and weight of the `h3`s in the card
                // below it, so the screen's own name carried no more weight than the items
                // under it. The five surfaces now agree.
                // It wraps, it does not `truncate`. At the Headline rung "Welcome to Epora
                // Wallet" needs 268px and this column offers 257px at 375px wide, so the
                // screen's own name would have been cut with no way to read the rest. A page
                // heading on two lines costs one line; a clipped one costs the sentence.
                <h2 className={pageHeadingClass}>
                  {guidedWorkspaceTitle}
                </h2>
              ) : null}
              {guidedWorkspaceDescription ? (
                // Body rung, at every width. A 12px line under a 24px headline is two rungs
                // of the scale in one step.
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
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
