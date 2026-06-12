import type { Asset, TransactionInfo, UTxO } from "@meshsdk/common";
import type {
  SttParticipantRoleValue,
  SttWalletStatusValue,
  SttWalletTransitionKindValue
} from "@/lib/stt-cache/domain";

export type AddressTransactionPageEntry = {
  txHash: string;
  txIndex: number;
  blockHeight: number | null;
  blockTime: number | null;
};

export type SttChainClient = {
  fetchCollectionAssets: (
    policyId: string,
    cursor?: number | string
  ) => Promise<{ assets: Asset[]; next?: string | number | null }>;
  fetchAddressUTxOs: (address: string, asset?: string) => Promise<UTxO[]>;
  fetchAddressTransactionsPage: (
    address: string,
    page: number,
    order: "asc" | "desc"
  ) => Promise<AddressTransactionPageEntry[]>;
  fetchTxInfo: (hash: string) => Promise<TransactionInfo>;
};

export type ProjectedParticipant = {
  role: SttParticipantRoleValue;
  participantKey: string;
  onChainId: number | null;
  paymentKeyHash: string | null;
  sourceAddress: string | null;
  stakeKeyHash: string | null;
  scriptHash: string | null;
};

export type SttLookupRequest = {
  paymentKeyHash?: string;
  address?: string;
  txLimit?: number;
  cursor?: string;
};

type SttLookupTransaction = {
  txHash: string;
  transitionKind: SttWalletTransitionKindValue;
  slot: string;
  txIndex: number;
  block: string;
  blockHeight: number | null;
  blockTime: number | null;
  fees: string;
  size: number;
  deposit: string;
  invalidBefore: string;
  invalidAfter: string;
};

export type SttLookupWallet = {
  id: string;
  network: string;
  policyId: string;
  assetNameHex: string;
  unit: string;
  sttScriptAddress: string;
  walletScriptAddress: string;
  status: SttWalletStatusValue;
  currentTxHash: string | null;
  currentOutputIndex: number | null;
  lastSeenBlockHeight: number | null;
  lastSeenBlockTime: number | null;
  matchedRoles: SttParticipantRoleValue[];
  stateSummary: {
    walletName: string;
    userCount: number;
    adminCount: number;
    beneficiaryCount: number;
    streamingPaymentCount: number;
  };
  recentTransactions: SttLookupTransaction[];
};

export type SttLookupResponse = {
  normalizedPaymentKeyHash: string | null;
  sourceAddress: string | null;
  nextCursor: string | null;
  wallets: SttLookupWallet[];
  sync: {
    recentHeadTriggered: boolean;
    reconcileTriggered: boolean;
    recentHeadLastSyncedAt: string | null;
    walletReconcileLastSyncedAt: string | null;
    historyBackfillCursor: string | null;
  };
};

export type SttSyncOperationResult = {
  cursorValue: string | null;
  processedTransactions: number;
  processedWallets: number;
  pagesScanned: number;
  lastSyncedAt: string;
};

export type SttBackgroundSyncResponse = {
  recentHead: SttSyncOperationResult;
  historyBackfill: SttSyncOperationResult;
  walletReconcile: SttSyncOperationResult;
};
