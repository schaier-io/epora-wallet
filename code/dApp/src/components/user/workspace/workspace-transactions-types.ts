import { type ProposalCapture } from "@/components/user/proposals/stash";
import type { UserActionKind } from "@/components/user/flow-types";
import { type BuildResult } from "@/lib/types/contracts";
import { type useWalletContext } from "@/providers/wallet-provider";
import { type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { type MintConfirmationState, type SttSpendActionMode } from "@/components/user/workspace/types";
import { type useWorkspaceDetectedTokenDerivations } from "@/components/user/workspace/use-workspace-detected-token-derivations";
import { type useWorkspaceWalletDerivations } from "@/components/user/workspace/use-workspace-wallet-derivations";
import { type useWorkspaceReviewDerivations } from "@/components/user/workspace/use-workspace-review-derivations";
import { type useStore } from "jotai";
import { type useDetectedSttTokens } from "@/components/user/workspace/use-detected-stt-tokens";
import { type useLockedContractUtxos } from "@/components/user/workspace/use-locked-contract-utxos";
import { type useWalletBalance } from "@/components/user/workspace/use-wallet-balance";
import { type useRecentRecipients } from "@/components/user/workspace/use-recent-recipients";
import type { PreparedStreamingPaymentPayout } from "@/components/user/workspace/workspace-payout-preparation";

// The dependency surface the workspace's transaction builders close over, split
// by concern. Builders still receive one flat object (WorkspaceTransactionsCtx
// is the intersection of these groups, so `ctx.activeWallet` etc. read exactly
// as before): the grouping is a map of where each dependency lives, so adding a
// new action's dependency has an obvious home instead of the bottom of one
// 39-field blob.

// Who is signing, on which network, and the jotai store the builders read the
// live form snapshot from.
type WalletIdentityFields = {
  activeWallet: ReturnType<typeof useWalletContext>["activeWallet"];
  activeWalletName: ReturnType<typeof useWalletContext>["activeWalletName"];
  activePaymentKeyHash: ReturnType<typeof useWalletContext>["activePaymentKeyHash"];
  networkId: ReturnType<typeof useWalletContext>["networkId"];
  isDemoWallet: ReturnType<typeof useWalletContext>["isDemoWallet"];
  jotaiStore: ReturnType<typeof useStore>;
};

// Build/submit lifecycle: the in-flight flags, the current preview, the error
// setters, the submit hash, and the guard that wraps every build.
type BuildStatusFields = {
  activeBuild: string | null;
  activeSubmit: boolean;
  setActiveSubmit: Dispatch<SetStateAction<boolean>>;
  preview: BuildResult | null;
  previewMatchesSelectedAction: ReturnType<typeof useWorkspaceReviewDerivations>["previewMatchesSelectedAction"];
  submitHash: string | null;
  setSubmitHash: Dispatch<SetStateAction<string | null>>;
  submitInFlightRef: MutableRefObject<boolean>;
  setBuildError: Dispatch<SetStateAction<string | null>>;
  setBuildErrorExpected: Dispatch<SetStateAction<boolean>>;
  withBuildGuard: (label: string, run: () => Promise<BuildResult>, context?: Record<string, unknown>) => Promise<BuildResult | null>;
};

// Which action is selected and its current validation/readiness state.
type ActionSelectionFields = {
  selectedAction: UserActionKind;
  effectiveSttAction: SttSpendActionMode;
  activeFieldErrors: ReturnType<typeof useWorkspaceReviewDerivations>["activeFieldErrors"];
  activeReadinessIssues: ReturnType<typeof useWorkspaceReviewDerivations>["activeReadinessIssues"];
};

// The detected STT token being acted on and everything derived from it (its
// assets, inferred state form, wallet asset name, locking contract).
type DetectedTokenFields = {
  selectedDetectedToken: ReturnType<typeof useWorkspaceDetectedTokenDerivations>["selectedDetectedToken"];
  selectedDetectedTokenAssets: ReturnType<typeof useWorkspaceDetectedTokenDerivations>["selectedDetectedTokenAssets"];
  selectedDetectedTokenStateForm: ReturnType<typeof useWorkspaceDetectedTokenDerivations>["selectedDetectedTokenStateForm"];
  effectiveWalletAssetNameHex: ReturnType<typeof useWorkspaceDetectedTokenDerivations>["effectiveWalletAssetNameHex"];
  activeInferredSttStateForm: ReturnType<typeof useWorkspaceWalletDerivations>["activeInferredSttStateForm"];
  lockingContract: ReturnType<typeof useWorkspaceWalletDerivations>["lockingContract"];
};

// Transfer-shaped inputs (streaming payouts, recipient memory).
type TransferFields = {
  streamingPaymentPayout: PreparedStreamingPaymentPayout;
  rememberRecipients: ReturnType<typeof useRecentRecipients>["rememberRecipients"];
};

// Mint-confirmation surface used by the mint builder + post-submit watcher.
type MintFields = {
  setMintConfirmation: Dispatch<SetStateAction<MintConfirmationState | null>>;
  setMintedWalletName: Dispatch<SetStateAction<string>>;
  watchMintCreationConfirmation: (txHash: string) => Promise<void>;
};

// Post-submit data refreshers run once a transaction lands.
type RefreshFields = {
  addSubmittedTransactionToActivity: (txHash: string) => Promise<void>;
  refreshDetectedTokens: ReturnType<typeof useDetectedSttTokens>["refreshDetectedTokens"];
  refreshLockedContractUtxos: ReturnType<typeof useLockedContractUtxos>["refreshLockedContractUtxos"];
  refreshPermissionWalletSummaries: ReturnType<typeof useDetectedSttTokens>["refreshPermissionWalletSummaries"];
  refreshWalletBalance: ReturnType<typeof useWalletBalance>["refreshWalletBalance"];
};

// Refs that outlive a single build (pending refresh timers, captured proposal).
type PostSubmitRefs = {
  postSubmitRefreshTimersRef: MutableRefObject<number[]>;
  proposalCaptureRef: MutableRefObject<ProposalCapture | null>;
};

/**
 * The full dependency surface the workspace's transaction builders close over.
 * Extracted from `workspace-transactions.ts` to keep that module under the
 * 750-line cap: this file is the type contract, that file the builder logic.
 *
 * Composed from the per-concern groups above; the flat intersection preserves
 * `ctx.<field>` access for every builder.
 */
export type WorkspaceTransactionsCtx = WalletIdentityFields &
  BuildStatusFields &
  ActionSelectionFields &
  DetectedTokenFields &
  TransferFields &
  MintFields &
  RefreshFields &
  PostSubmitRefs;
