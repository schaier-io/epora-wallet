import { atom, type ExtractAtomValue, type Getter } from "jotai";
import type { BuildResult, AuthorityPath } from "@/lib/types/contracts";
import type { ProposalCapture } from "@/components/user/proposals/stash";
import { activePaymentKeyHashAtom, walletAccountRevisionAtom } from "@/providers/wallet.atoms";
import { buildRunAtom, workspaceSessionAtom } from "./atoms/transaction-flow.atoms";
import { streamingPaymentPayoutTransfersAtom } from "./atoms/workspace-transfer-derivations.atoms";
import { selectedActionAtom } from "./atoms/workspace-selection.atoms";
import { selectedDetectedTokenAtom } from "./queries/token-identity.atoms";
import { activeInferredSttStateFormAtom } from "./queries/wallet-identity.atoms";
import { spendableWalletUtxosAtom } from "./atoms/workspace-spendable-utxos.atoms";
import { selectedSigningActionAvailabilityAtom } from "./atoms/workspace-stt-options.atoms";
import { walletStateUpdatingAtom } from "./atoms/wallet-state-update.atoms";
import { mintZeroAdminConfirmedAtom } from "./atoms/forms/mint-form.atoms";
import { sttZeroAdminConfirmedAtom } from "./atoms/forms/stt-spend-form.atoms";
import { voteZeroAdminConfirmedAtom } from "./atoms/forms/vote-form.atoms";
import { publishZeroAdminConfirmedAtom } from "./atoms/forms/publish-form.atoms";
import { withdrawZeroAdminConfirmedAtom } from "./atoms/forms/withdraw-form.atoms";
import { resolveWorkspaceTransactionInputs } from "./workspace-transaction-inputs";
import { safeStringify } from "./helpers";

// Rebuild time-dependent outputs at least once a minute while the editor is open.
export const PREPARED_TRANSACTION_MAX_AGE_MS = 60_000;

// Read builder inputs directly. Display signatures omit some inputs, including
// the setup helper and the separate State update form. Do not include the render
// clock: builders update it themselves, which would cause a rebuild loop.
export const workspaceTransactionSnapshotAtom = atom(get => safeStringify({
  inputs: resolveWorkspaceTransactionInputs({ get }),
  action: get(selectedActionAtom),
  payoutTransfers: get(selectedActionAtom) === "payout-streaming-payment"
    ? get(streamingPaymentPayoutTransfersAtom) : undefined,
  accountRevision: get(walletAccountRevisionAtom),
  paymentKeyHash: get(activePaymentKeyHashAtom),
  token: get(selectedDetectedTokenAtom),
  state: get(activeInferredSttStateFormAtom),
  walletInputs: get(spendableWalletUtxosAtom),
  signing: get(selectedSigningActionAvailabilityAtom),
  confirmations: [get(mintZeroAdminConfirmedAtom), get(sttZeroAdminConfirmedAtom),
    get(voteZeroAdminConfirmedAtom), get(publishZeroAdminConfirmedAtom), get(withdrawZeroAdminConfirmedAtom)]
}));

export interface PreparedWorkspaceTransaction {
  result: BuildResult;
  snapshot: string;
  session: ExtractAtomValue<typeof workspaceSessionAtom>;
  builtAt: number;
  buildRun: number;
  authorityPathOverride?: AuthorityPath;
  proposalCapture: ProposalCapture | null;
}

export const preparedWorkspaceTransactionAtom = atom<PreparedWorkspaceTransaction | null>(null);

export function preparedWorkspaceTransactionIsCurrent(
  store: { get: Getter },
  prepared: PreparedWorkspaceTransaction,
  now = Date.now()
) {
  return store.get(buildRunAtom) === prepared.buildRun &&
    store.get(workspaceSessionAtom) === prepared.session &&
    store.get(workspaceTransactionSnapshotAtom) === prepared.snapshot &&
    !store.get(walletStateUpdatingAtom) &&
    now >= prepared.builtAt && now - prepared.builtAt < PREPARED_TRANSACTION_MAX_AGE_MS;
}
