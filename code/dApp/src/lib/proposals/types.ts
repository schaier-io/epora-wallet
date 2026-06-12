import type {
  ActionKind,
  Asset,
  ConsolidateUtxosFormInput,
  ContractConfig,
  LockFundsFormInput,
  MintFormInput,
  SetIntendedStakeCredentialFormInput,
  SttSpendFormInput,
  WalletProposeFormInput,
  WalletPublishFormInput,
  WalletSpendFormInput,
  WalletWithdrawFormInput
} from "@/lib/types/contracts";

// Lifecycle status persisted on a proposal. Invalidity (spent UTxOs, stale
// script-data hash) is NOT a status — it is computed live at view time because
// it depends on moving chain state. See `ProposalValidity`.
export type ProposalStatus = "OPEN" | "SUBMITTED" | "CANCELLED";

export type ProposalAuthorityPath = "admin" | "multisig";

// Modes accepted by `buildSttSpendTx` — the state-forwarding family that most
// multi-sig actions belong to (people changes, settings, allowances, payouts).
export type SttSpendMode =
  | "use"
  | "renew-proof-of-life"
  | "update-state"
  | "manage-streaming-payments"
  | "use-allowance"
  | "use-beneficiary"
  | "payout-streaming-payment"
  | "remove-access-index";

// Everything needed to rebuild a proposal's transaction against fresh chain
// state. The discriminant selects which builder to replay; `config` + `input`
// are the exact serializable arguments captured when the tx was first built.
// The rebuild dispatcher refreshes the stale on-chain input references before
// replaying (see lib/proposals/rebuild.ts).
export type ProposalBuildContext =
  | { builder: "stt-spend"; mode: SttSpendMode; config: ContractConfig; input: SttSpendFormInput }
  | { builder: "wallet-spend"; config: ContractConfig; input: WalletSpendFormInput }
  | { builder: "wallet-withdraw"; config: ContractConfig; input: WalletWithdrawFormInput }
  | { builder: "wallet-publish"; config: ContractConfig; input: WalletPublishFormInput }
  | { builder: "wallet-propose"; config: ContractConfig; input: WalletProposeFormInput }
  | {
      builder: "set-intended-stake-credential";
      config: ContractConfig;
      input: SetIntendedStakeCredentialFormInput;
    }
  | { builder: "consolidate-utxo"; config: ContractConfig; input: ConsolidateUtxosFormInput }
  | { builder: "lock-funds"; config: ContractConfig; input: LockFundsFormInput }
  | { builder: "mint"; config: ContractConfig; input: MintFormInput };

export type ProposalBuilderKind = ProposalBuildContext["builder"];

// A human-readable receipt the proposer attaches at save time. Shown to signers
// as "the proposer's note" only — the authoritative effect is always decoded
// from the transaction bytes during verification, never trusted from here.
export type ProposalSummary = {
  headline: string;
  rows: { label: string; value: string }[];
};

// ---------------------------------------------------------------------------
// API DTOs
// ---------------------------------------------------------------------------

export type ProposalSignatureDto = {
  signerKeyHash: string;
  // Whether this witness signed the proposal's current body (false → stale,
  // produced before a rebuild, and ignored when assembling the final tx).
  current: boolean;
  createdAt: string;
};

// Compact shape for the browse list — omits the heavy tx hex / build context.
export type ProposalListItemDto = {
  id: string;
  walletUnit: string;
  walletPolicyId: string;
  title: string;
  description: string | null;
  actionKind: ActionKind | string;
  authorityPath: ProposalAuthorityPath;
  status: ProposalStatus;
  txBodyHash: string;
  submittedTxHash: string | null;
  createdByKeyHash: string;
  createdAt: string;
  updatedAt: string;
  signatureCount: number;
  signerKeyHashes: string[];
};

// Full detail shape — adds the unsigned tx, build context, witnesses and the
// proposer's summary needed to verify, sign, assemble and rebuild. Build context
// and summary travel as raw JSON strings (they can contain bigint/Map datum
// values that `JSON.stringify` cannot encode); the client parses them with the
// bigint-safe reviver via `parseProposalBuildContext` / `parseProposalSummary`.
export type ProposalDetailDto = ProposalListItemDto & {
  unsignedTxHex: string;
  buildContextJson: string | null;
  summaryJson: string | null;
  signatures: (ProposalSignatureDto & { witnessSetHex: string })[];
};

// Body the workspace stashes, then the create form POSTs to /api/proposals.
export type CreateProposalRequest = {
  walletUnit: string;
  walletPolicyId: string;
  title: string;
  description?: string;
  actionKind: string;
  authorityPath: ProposalAuthorityPath;
  builder: ProposalBuilderKind;
  buildContext: ProposalBuildContext;
  unsignedTxHex: string;
  txBodyHash: string;
  summary?: ProposalSummary;
};

// ---------------------------------------------------------------------------
// Local verification (computed client-side from the tx bytes + chain state)
// ---------------------------------------------------------------------------

export type ProposalValidity = "valid" | "invalid" | "checking";

export type RequiredSigner = {
  keyHash: string;
  power: number;
  isAdmin: boolean;
  label?: string;
};

export type ProposalInputRef = {
  txHash: string;
  outputIndex: number;
  // true once confirmed still unspent on-chain; false → consumed/missing.
  live: boolean;
  // true if this is the wallet's STT state UTxO (the moving part on a rebuild).
  isSttState: boolean;
};

export type ProposalOutputView = {
  address: string;
  lovelace: string;
  assets: Asset[];
  hasInlineDatum: boolean;
};

export type ProposalEffect = {
  inputs: ProposalInputRef[];
  outputs: ProposalOutputView[];
  feeLovelace: string | null;
  // Net lovelace leaving the wallet's script address (negative = inflow).
  decodeError?: string;
};

export type SignerSatisfaction = {
  authorityPath: ProposalAuthorityPath;
  requiredSigners: RequiredSigner[];
  signedKeyHashes: string[];
  // For the multisig path: cumulative power of valid signers vs threshold.
  satisfiedPower: number;
  threshold: number | null;
  satisfied: boolean;
};

export type ProposalVerification = {
  validity: ProposalValidity;
  reasons: string[];
  effect: ProposalEffect;
  signers: SignerSatisfaction | null;
  bodyHashMatches: boolean;
};
