import { type ProposalCapture } from "@/components/user/proposals/stash";
import type { UserActionKind } from "@/components/user/flow-types";
import { type BuildResult } from "@/lib/types/contracts";
import { type useWalletContext } from "@/providers/wallet-provider";
import { type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { type MintConfirmationState, type SttSpendActionMode } from "@/components/user/workspace/types";
import { type useWorkspaceDetectedTokenDerivations } from "@/components/user/workspace/use-workspace-detected-token-derivations";
import { type useWorkspaceWalletDerivations } from "@/components/user/workspace/use-workspace-wallet-derivations";
import { type useWorkspaceTransferDerivations } from "@/components/user/workspace/use-workspace-transfer-derivations";
import { type useWorkspaceReviewDerivations } from "@/components/user/workspace/use-workspace-review-derivations";
import { type useStore } from "jotai";
import { type useDetectedSttTokens } from "@/components/user/workspace/use-detected-stt-tokens";
import { type useLockedContractUtxos } from "@/components/user/workspace/use-locked-contract-utxos";
import { type useWalletBalance } from "@/components/user/workspace/use-wallet-balance";
import { type useRecentRecipients } from "@/components/user/workspace/use-recent-recipients";

/**
 * The full dependency surface the workspace's transaction builders close over.
 * Extracted from `workspace-transactions.ts` to keep that module under the
 * 750-line cap — this file is the type contract, that file the builder logic.
 *
 * It is the intersection of the nine form-hook return shapes (so builders read
 * form fields by name) plus the handful of controller-derived values, setters,
 * refs and helper callbacks the builders need.
 */
export type WorkspaceTransactionsCtx = {
  activeBuild: string | null;
  activeFieldErrors: ReturnType<typeof useWorkspaceReviewDerivations>["activeFieldErrors"];
  activeInferredSttStateForm: ReturnType<typeof useWorkspaceWalletDerivations>["activeInferredSttStateForm"];
  activePaymentKeyHash: ReturnType<typeof useWalletContext>["activePaymentKeyHash"];
  activeReadinessIssues: ReturnType<typeof useWorkspaceReviewDerivations>["activeReadinessIssues"];
  activeSubmit: boolean;
  activeWallet: ReturnType<typeof useWalletContext>["activeWallet"];
  activeWalletName: ReturnType<typeof useWalletContext>["activeWalletName"];
  addSubmittedTransactionToActivity: (txHash: string) => Promise<void>;
  effectiveSttAction: SttSpendActionMode;
  effectiveWalletAssetNameHex: ReturnType<typeof useWorkspaceDetectedTokenDerivations>["effectiveWalletAssetNameHex"];
  isDemoWallet: ReturnType<typeof useWalletContext>["isDemoWallet"];
  jotaiStore: ReturnType<typeof useStore>;
  lockingContract: ReturnType<typeof useWorkspaceWalletDerivations>["lockingContract"];
  networkId: ReturnType<typeof useWalletContext>["networkId"];
  postSubmitRefreshTimersRef: MutableRefObject<number[]>;
  preview: BuildResult | null;
  previewMatchesSelectedAction: ReturnType<typeof useWorkspaceReviewDerivations>["previewMatchesSelectedAction"];
  proposalCaptureRef: MutableRefObject<ProposalCapture | null>;
  refreshDetectedTokens: ReturnType<typeof useDetectedSttTokens>["refreshDetectedTokens"];
  refreshLockedContractUtxos: ReturnType<typeof useLockedContractUtxos>["refreshLockedContractUtxos"];
  refreshPermissionWalletSummaries: ReturnType<typeof useDetectedSttTokens>["refreshPermissionWalletSummaries"];
  selectedAction: UserActionKind;
  selectedDetectedToken: ReturnType<typeof useWorkspaceDetectedTokenDerivations>["selectedDetectedToken"];
  selectedDetectedTokenAssets: ReturnType<typeof useWorkspaceDetectedTokenDerivations>["selectedDetectedTokenAssets"];
  selectedDetectedTokenStateForm: ReturnType<typeof useWorkspaceDetectedTokenDerivations>["selectedDetectedTokenStateForm"];
  setActiveSubmit: Dispatch<SetStateAction<boolean>>;
  setBuildError: Dispatch<SetStateAction<string | null>>;
  setBuildErrorDetails: Dispatch<SetStateAction<string | null>>;
  setMintConfirmation: Dispatch<SetStateAction<MintConfirmationState | null>>;
  setMintedWalletName: Dispatch<SetStateAction<string>>;
  setSubmitHash: Dispatch<SetStateAction<string | null>>;
  streamingPaymentPayoutTransfers: ReturnType<typeof useWorkspaceTransferDerivations>["streamingPaymentPayoutTransfers"];
  submitHash: string | null;
  submitInFlightRef: MutableRefObject<boolean>;
  watchMintCreationConfirmation: (txHash: string) => Promise<void>;
  withBuildGuard: (label: string, run: () => Promise<BuildResult>, context?: Record<string, unknown>) => Promise<BuildResult | null>;
  rememberRecipients: ReturnType<typeof useRecentRecipients>["rememberRecipients"];
  refreshWalletBalance: ReturnType<typeof useWalletBalance>["refreshWalletBalance"];
  };
