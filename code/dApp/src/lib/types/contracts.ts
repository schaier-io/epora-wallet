import type { Data } from "@meshsdk/common";

export type ConstrData = {
  alternative: number;
  fields: Data[];
};

export type Asset = {
  unit: string;
  quantity: string;
};

export const DEFAULT_MINT_STT_LOVELACE = "5000000";

type TxPreview = {
  action: string;
  summary: string;
  cbor: string;
  txSize?: {
    usedBytes: number;
    maxBytes: number;
    percentage: string;
  };
};

export type ExecutionRedeemerUsage = {
  tag: string;
  index: number;
  mem: string;
  steps: string;
  reference?: string;
  validator?: string;
};

export type ExecutionValidatorUsage = {
  validator: string;
  memUsed: string;
  stepsUsed: string;
  redeemerCount: number;
};

export type ExecutionUnitsSummary = {
  memUsed: string;
  stepsUsed: string;
  maxTxMem: string;
  maxTxSteps: string;
  maxBlockMem: string;
  maxBlockSteps: string;
  redeemers: ExecutionRedeemerUsage[];
  perValidator: ExecutionValidatorUsage[];
};

export type ChainMethod =
  | "fetchAccountInfo"
  | "fetchAddressUTxOs"
  | "fetchAddressTxs"
  | "fetchAssetAddresses"
  | "fetchAssetMetadata"
  | "fetchBlockInfo"
  | "fetchCollectionAssets"
  | "fetchProtocolParameters"
  | "fetchCostModels"
  | "fetchTxInfo"
  | "fetchUTxOs"
  | "fetchGovernanceProposal"
  | "evaluateTx"
  | "submitTx"
  | "get";

export type ChainRpcRequest = {
  method: ChainMethod;
  args: unknown[];
};

export type ActionKind =
  | "mint"
  | "use"
  | "renew-proof-of-life"
  | "update-state"
  | "manage-streaming-payments"
  | "use-allowance"
  | "use-beneficiary"
  | "payout-streaming-payment"
  | "consolidate-utxo"
  | "lock-funds"
  | "wallet-spend"
  | "wallet-withdraw"
  | "wallet-publish"
  | "wallet-vote"
  | "set-intended-stake-credential";

export type AuthorityPath =
  | "admin"
  | "multisig"
  | "user"
  | "beneficiary"
  | "rule-driven";

export type OperatorAuthorityPath = "admin" | "multisig";

export type ConsolidateAuthorityPath = "admin" | "multisig" | "beneficiary";

export type ContractConfig = {
  sttAssetNameHex: string;
  walletPolicyId?: string;
  walletAssetNameHex?: string;
  sttSpendReference?: string;
  walletSpendReference?: string;
  walletWithdrawReference?: string;
  walletPublishReference?: string;
  walletVoteReference?: string;
};

export const EMPTY_CONTRACT_CONFIG: ContractConfig = {
  sttAssetNameHex: "",
  walletPolicyId: "",
  walletAssetNameHex: "",
  sttSpendReference: "",
  walletSpendReference: "",
  walletWithdrawReference: "",
  walletPublishReference: "",
  walletVoteReference: ""
};

export type PayoutTransfer = {
  address: string;
  amount: Asset[];
  inlineDatum?: ConstrData;
};

export type WalletScriptOutput = {
  amount: Asset[];
  inlineDatum?: ConstrData;
};

export type MintFormInput = {
  mintLovelace?: string;
  starterAssets?: Asset[];
  stateDatum: ConstrData;
  selectedReferenceUtxo?: { txHash: string; outputIndex: number };
};

export type SttSpendFormInput = {
  sttInputTxHash: string;
  sttInputOutputIndex?: number;
  // Optional because "use-allowance", "cancel-streaming-payment" and
  // "remove-access-index" derive the forwarded State from the consumed one.
  // The builder requires both for every other action.
  outputDatum?: ConstrData;
  outputAssets?: Asset[];
  authorityPath?: AuthorityPath;
  validityWindowReferenceTimeMs?: number;
  allowanceSignerKeyHash?: string;
  beneficiarySignerKeyHash?: string;
  // For the "payout-streaming-payment" crank: the connected wallet's payment key
  // hash (the tx's sole required signer). REQUIRED for that action, because the crank is
  // not permissionless, so the builder throws when it is absent rather than
  // falling back to an unsigned crank the validator would reject. It drives two
  // decisions: whether the signer clears the AUTHORITY gate at all (admin /
  // multisig quorum / listed user / stream payee / unlocked beneficiary), and
  // whether it is an ADMIN and so must PRESERVE `last_non_admin_payout_at`
  // instead of stamping it (whitepaper: Settlement-cadence theorem).
  crankSignerKeyHash?: string;
  walletInputs?: WalletInputRef[];
  walletOutputs?: WalletScriptOutput[];
  extraTransfers?: PayoutTransfer[];
  // For the "remove-access-index" action: which access entry to remove. The
  // forwarded datum is derived from the consumed state; outputDatum/outputAssets
  // are ignored for this action (the entry is spliced out, value preserved).
  removeAccessTarget?: { list: "user" | "beneficiary"; index: number };
  // Payment key hashes the transaction lists as required signers besides the
  // connected wallet's own key: the co-signers an approval request was saved
  // for. The validator only counts keys in `extra_signatories`, so a co-signer
  // who is not listed here adds nothing by signing. Every listed key must sign
  // before the ledger accepts the transaction.
  requiredSignerKeyHashes?: string[];
  // For the "cancel-streaming-payment" action: the id of the streaming payment
  // the connected payee is stopping. The forwarded datum is derived from the
  // consumed state (that payment's end_date is shortened to the earliest safe
  // cutoff and the shared non-admin streaming-action clock is advanced).
  streamingPaymentCancelId?: number;
};

export type WalletSpendFormInput = {
  walletInputTxHash: string;
  walletInputOutputIndex?: number;
  redeemer: ConstrData;
  outputs: PayoutTransfer[];
};

export type WalletInputRef = {
  txHash: string;
  outputIndex: number;
};

export type LockFundsFormInput = {
  assets: Asset[];
  inlineDatum?: ConstrData;
  // The wallet's current `intended_stake_credential` (from its STT State). A
  // deposit has no STT input to read it from, so the caller passes it: a staking
  // (Some) wallet receives the deposit at its base address; omitted/None →
  // the enterprise address, unchanged from before.
  intendedStakeCredential?: ConstrData;
};

type ConsolidateWalletOutput = WalletScriptOutput;

export type ConsolidateUtxosFormInput = {
  sttInputTxHash: string;
  sttInputOutputIndex?: number;
  outputDatum: ConstrData;
  outputAssets: Asset[];
  authorityPath?: ConsolidateAuthorityPath;
  walletInputs: WalletInputRef[];
  walletOutputs?: ConsolidateWalletOutput[];
};

export type WalletWithdrawFormInput = {
  rewardAddress: string;
  amountLovelace: string;
  sttInputTxHash: string;
  sttInputOutputIndex?: number;
  sttOutputDatum: ConstrData;
  sttOutputAssets: Asset[];
  authorityPath?: OperatorAuthorityPath;
};

export type WalletPublishFormInput = {
  certificate: unknown;
  sttInputTxHash: string;
  sttInputOutputIndex?: number;
  sttOutputDatum: ConstrData;
  sttOutputAssets: Asset[];
  authorityPath?: OperatorAuthorityPath;
};

export type WalletVoteFormInput = {
  vote: unknown;
  sttInputTxHash: string;
  sttInputOutputIndex?: number;
  sttOutputDatum: ConstrData;
  sttOutputAssets: Asset[];
  authorityPath?: OperatorAuthorityPath;
};

/// The intended stake credential to set: none (enterprise address), a payment/
/// stake key hash, or a script hash. `hashHex` is the 28-byte blake2b-224 digest.
export type StakeCredentialSelection =
  | { kind: "none" }
  | { kind: "key"; hashHex: string }
  | { kind: "script"; hashHex: string };

// Admin/multisig-only: set the wallet's `intended_stake_credential`. The caller
// supplies the new State datum with field[4] already set to the desired
// Option<Credential> (e.g. Some(Script(walletScriptHash)) to delegate via the
// wallet's own staking script). Forwards the STT only, with no wallet spend. The
// continuing wallet funds are moved to the new base address in a follow-up
// consolidate/migrate step.
export type SetIntendedStakeCredentialFormInput = {
  sttInputTxHash: string;
  sttInputOutputIndex?: number;
  sttOutputDatum: ConstrData;
  sttOutputAssets: Asset[];
  authorityPath?: OperatorAuthorityPath;
  stakeCredential: StakeCredentialSelection;
};

export type BuildResult = {
  txHex: string;
  preview: TxPreview;
  estimatedFeeLovelace?: string;
  executionUnits?: ExecutionUnitsSummary;
  /**
   * Non-blocking advisories about the forwarded/minted state datum (e.g. a
   * lapsed proof of life, or a beneficiary-only recovery time-locked far out).
   * Accepted on-chain; surfaced in the review panel so the operator sees them
   * before signing. Populated by the mint and STT-spend builders.
   */
  warnings?: string[];
  /**
   * Address whose signature the built transaction requires, exactly as
   * `setupTransaction` resolved it for `setRequiredSigners`. This build-time
   * change address can differ from the wallet's current `usedAddresses[0]`,
   * so the review panel shows it instead of guessing from the address list.
   */
  signerAddress?: string;
};
