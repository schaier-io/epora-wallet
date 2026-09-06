import type { Data } from "@meshsdk/common";
import type { UTxO } from "@meshsdk/core";
import { isConstrData, readBoolean } from "@/lib/contracts/plutus-primitives";
import { validateCurrentStateDatum } from "@/lib/contracts/state-validation";
import { decodeWalletNameFromDatum } from "@/lib/contracts/state-wallet-name";
import { deserializeTx, type CstTransactionOutput } from "@/lib/mesh/cst";
import { decodeConstrDatumFromUtxo } from "@/lib/mesh/transactions/internals/datum";
import type { ConstrData } from "@/lib/types/contracts";
import { resolveProposalBodyHash } from "./serialization";

export type StateChange = { path: string; before: string | null; after: string | null };
export type ProposalStateTransition = {
  txBodyHash: string;
  outputIndex: number;
  changes: StateChange[];
};

type ReviewValue = string | boolean | null | ReviewValue[] | { [key: string]: ReviewValue };

// Use datum values directly. Form readers deliberately normalize some fields
// (for example an admin's renewal flag), which would hide changes here.
function raw(value: Data): ReviewValue {
  if (typeof value === "number" || typeof value === "bigint") return value.toString();
  if (typeof value === "string") return `0x${value}`;
  if (Array.isArray(value)) return value.map(raw);
  if (isConstrData(value)) {
    return { constructor: value.alternative.toString(), fields: value.fields.map(raw) };
  }
  throw new Error("Unsupported State data.");
}

function record(value: Data, names: readonly string[]): Record<string, ReviewValue> {
  if (!isConstrData(value) || value.alternative !== 0 || value.fields.length !== names.length) {
    throw new Error("Unsupported State record.");
  }
  return Object.fromEntries(names.map((name, index) => [name, raw(value.fields[index]!)]));
}

function records(value: Data, names: readonly string[]): Record<string, ReviewValue>[] {
  if (!Array.isArray(value)) throw new Error("Unsupported State list.");
  return value.map((entry) => record(entry, names));
}

function option(value: Data): ReviewValue {
  if (!isConstrData(value)) throw new Error("Unsupported State option.");
  if (value.alternative === 1 && value.fields.length === 0) return null;
  if (value.alternative === 0 && value.fields.length === 1) return { some: raw(value.fields[0]!) };
  throw new Error("Unsupported State option.");
}

function describeState(state: ConstrData): ReviewValue {
  if (validateCurrentStateDatum(state).length > 0) throw new Error("Invalid State datum.");
  const result = record(state, [
    "access", "proof_of_life", "streaming_payments", "wallet_name",
    "intended_stake_credential", "last_non_admin_payout_at"
  ]);
  const access = state.fields[0] as ConstrData;
  const proof = state.fields[1] as ConstrData;
  result.access = record(access, ["users", "multi_sig_threshold", "beneficiaries"]);
  const users = access.fields[0] as Data[];
  result.access.users = users.map((user) => {
    const fields = (user as ConstrData).fields;
    const entry = record(user, [
      "id", "user_wallets", "per_day_allowance", "remaining_allowance",
      "next_allowance_reset", "can_renew_proof_of_life", "multi_sig_power", "is_admin"
    ]);
    entry.per_day_allowance = records(fields[2]!, ["policy_id", "asset_name", "quantity"]);
    entry.remaining_allowance = records(fields[3]!, ["policy_id", "asset_name", "quantity"]);
    entry.can_renew_proof_of_life = readBoolean(fields[5]!, "can_renew_proof_of_life");
    entry.multi_sig_power = option(fields[6]!);
    entry.is_admin = readBoolean(fields[7]!, "is_admin");
    return entry;
  });
  result.access.multi_sig_threshold = option(access.fields[1]!);
  result.access.beneficiaries = records(access.fields[2]!, [
    "id", "beneficiary_wallets", "unlock_after", "weight", "payout_address"
  ]);
  result.proof_of_life = {
    unlock_time: option(proof.fields[0]!), increment: option(proof.fields[1]!)
  };
  result.streaming_payments = records(state.fields[2]!, [
    "id", "payout_address", "paid_out_amount", "policy_id", "asset_name",
    "amount_per_day", "start_date", "end_date"
  ]);
  // Preserve the bytes too: invalid UTF-8 and display normalization must never
  // make distinct on-chain names appear identical.
  result.wallet_name = { text: decodeWalletNameFromDatum(state.fields[3] as string), bytes: raw(state.fields[3]!) };
  result.intended_stake_credential = option(state.fields[4]!);
  result.last_non_admin_payout_at = option(state.fields[5]!);
  return result;
}

function leaves(value: ReviewValue, path = "state", output = new Map<string, string>()): Map<string, string> {
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) output.set(path, Array.isArray(value) ? "[]" : "{}");
    for (const [key, child] of entries) {
      leaves(child, Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`, output);
    }
  } else {
    output.set(path, value === null ? "None" : String(value));
  }
  return output;
}

/** Every current State field is included, including additions and removals. */
export function compareStates(before: ConstrData, after: ConstrData): StateChange[] {
  const oldValues = leaves(describeState(before));
  const newValues = leaves(describeState(after));
  return [...new Set([...oldValues.keys(), ...newValues.keys()])].flatMap((path) => {
    const oldValue = oldValues.get(path) ?? null;
    const newValue = newValues.get(path) ?? null;
    return oldValue === newValue ? [] : [{ path, before: oldValue, after: newValue }];
  });
}

/** Bind the complete comparison to the consumed token and actual transaction bytes. */
export function reviewStateTransition(input: {
  unsignedTxHex: string;
  walletUnit: string;
  stateInput: UTxO;
}): ProposalStateTransition {
  const { stateInput, walletUnit, unsignedTxHex } = input;
  const oldState = decodeConstrDatumFromUtxo(stateInput);
  if (!oldState) throw new Error("Missing input State.");
  const unit = walletUnit.toLowerCase();
  const stateTokens = stateInput.output.amount.filter((asset) => asset.unit.toLowerCase() === unit);
  if (stateTokens.length !== 1 || stateTokens[0]!.quantity !== "1") {
    throw new Error("Input State token mismatch.");
  }
  const outputs = deserializeTx(unsignedTxHex).body().outputs() as CstTransactionOutput[];
  const continuing = outputs.flatMap((output, outputIndex) =>
    output.address().toBech32().toString() === stateInput.output.address ? [{ output, outputIndex }] : []
  );
  if (continuing.length !== 1) throw new Error("Expected one continuing State output.");
  const { output, outputIndex } = continuing[0]!;
  const tokens = outputs.flatMap((candidate, index) =>
    [...(candidate.amount().multiasset()?.entries() ?? [])].flatMap(([asset, quantity]) =>
      asset.toString().toLowerCase() === unit ? [{ index, quantity: quantity.toString() }] : []
    )
  );
  if (tokens.length !== 1 || tokens[0]!.index !== outputIndex || tokens[0]!.quantity !== "1") {
    throw new Error("Continuing State token mismatch.");
  }
  const newState = decodeConstrDatumFromUtxo({
    input: { txHash: resolveProposalBodyHash(unsignedTxHex), outputIndex },
    output: {
      address: stateInput.output.address,
      amount: [],
      plutusData: output.datum()?.asInlineData?.()?.toCbor()
    }
  });
  if (!newState) throw new Error("Missing continuing State datum.");
  return { txBodyHash: resolveProposalBodyHash(unsignedTxHex), outputIndex, changes: compareStates(oldState, newState) };
}
