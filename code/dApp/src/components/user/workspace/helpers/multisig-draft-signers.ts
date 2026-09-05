import { computeSignerSatisfaction } from "@/lib/proposals/verify";
import type { StateFormState } from "@/lib/contracts/state-form";
import { MAX_TOTAL_USER_WALLETS } from "@/lib/contracts/state-validation-records";

// The workspace's draft transaction lists only the connected wallet as a required
// signer (the stt-spend builder adds the change address itself). On the multisig
// path the spend validator sums the power of the keys listed in the body's
// `required_signers` against the CONSUMED state's threshold, and the draft is
// evaluated on-chain at build time — so once the threshold exceeds the proposer's
// own power, the draft can never evaluate and "Save as approval request" dies
// before the co-signer picker that would list the other power holders ever opens.
//
// Multisig drafts whose threshold exceeds the proposer's own power therefore list
// the smallest signer subset that reaches it. Listing every wallet of each power
// holder wastes transaction bytes when one wallet supplies the record's full power.
// One wallet can also cover multiple user records.
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
  if (threshold == null || BigInt(threshold) <= 0n) {
    return [];
  }
  const candidates = requiredSigners
    .filter((signer) => signer.keyHash !== proposer)
    .map((signer) => signer.keyHash);

  // Valid State data caps this list at 15. Avoid an exponential search if an
  // invalid legacy draft exceeds that bound. Returning all candidates keeps its
  // recovery attempt available. The ledger and validator decide whether it fits.
  if (candidates.length > MAX_TOTAL_USER_WALLETS) {
    return candidates;
  }

  const listedPasses = (extraSigners: string[]) => {
    const listed = proposer ? [proposer, ...extraSigners] : extraSigners;
    return computeSignerSatisfaction(
      stateForm,
      "multisig",
      listed,
      listed
    ).satisfied;
  };

  let best: string[] | null = null;
  const subsetCount = 1 << candidates.length;
  for (let mask = 0; mask < subsetCount; mask += 1) {
    const subset = candidates.filter((_, index) => (mask & (1 << index)) !== 0);
    if (best !== null && subset.length >= best.length) {
      continue;
    }
    if (listedPasses(subset)) {
      best = subset;
    }
  }

  // An unreachable draft lists every candidate. The validator rejects the
  // transaction if those signatures still cannot meet the configured threshold.
  return best ?? candidates;
}
