import { computeSignerSatisfaction } from "@/lib/proposals/verify";
import type { StateFormState } from "@/lib/contracts/state-form";

// The workspace's draft transaction lists only the connected wallet as a required
// signer (the stt-spend builder adds the change address itself). On the multisig
// path the spend validator sums the power of the keys listed in the body's
// `required_signers` against the CONSUMED state's threshold, and the draft is
// evaluated on-chain at build time — so once the threshold exceeds the proposer's
// own power, the draft can never evaluate and "Save as approval request" dies
// before the co-signer picker that would list the other power holders ever opens.
//
// Multisig drafts whose threshold exceeds the proposer's own power therefore list
// every other power holder's wallet, so the evaluated draft matches the
// co-signed transaction the proposal flow collects signatures for. Cardano makes
// every listed key sign, which is exactly the multisig path's meaning; the
// co-signer picker can still trim the saved request, because choosing co-signers
// rebuilds the transaction with the chosen subset instead.
export function multisigDraftSignerKeyHashes(
  stateForm: StateFormState,
  proposerKeyHash: string | null | undefined
): string[] {
  const proposer = proposerKeyHash?.trim().toLowerCase() ?? "";
  const { requiredSigners, threshold } = computeSignerSatisfaction(
    stateForm,
    "multisig",
    []
  );
  if (threshold == null || threshold <= 0) {
    return [];
  }
  const proposerPower = requiredSigners
    .filter((signer) => signer.keyHash === proposer)
    .reduce((max, signer) => Math.max(max, signer.power), 0);
  if (proposerPower >= threshold) {
    return [];
  }
  return requiredSigners
    .filter((signer) => signer.keyHash !== proposer)
    .map((signer) => signer.keyHash);
}
