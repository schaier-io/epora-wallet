//// Pure derivation of the forwarded STT state datum for a `RemoveAccessIndex`
//// action (the cheap per-entry access cleanup). Removes exactly the entry at
//// `index` from the targeted access list and preserves every other field, so
//// the forwarded datum equals `remove_at(input, index)` as the on-chain
//// `state_unchanged_except_access_index_removed` requires. No Mesh/browser
//// dependencies, so it can be unit-tested directly.

import type { Data } from "@meshsdk/common";
import { readStateSections } from "@/lib/contracts/state-layout";
import { unwrapStateDatum } from "@/lib/contracts/stt-datum";
import type { AccessRemovalTarget } from "@/lib/contracts/action-data";
import type { ConstrData } from "@/lib/types/contracts";

export function deriveAccessIndexRemovalStateDatum(
  stateDatum: ConstrData,
  target: AccessRemovalTarget
): ConstrData {
  const unwrapped = unwrapStateDatum(stateDatum, "Access removal state datum");
  const sections = readStateSections(unwrapped, "Access removal state datum");

  const access = sections.access;
  const users = access.fields[0];
  const beneficiaries = access.fields[2];
  if (!Array.isArray(users) || !Array.isArray(beneficiaries)) {
    throw new Error("Access removal state datum has malformed access lists.");
  }

  const list: Data[] = target.list === "user" ? users : beneficiaries;
  if (
    !Number.isInteger(target.index) ||
    target.index < 0 ||
    target.index >= list.length
  ) {
    throw new Error(
      `Access removal index ${target.index} is out of range (the ${target.list} list has ${list.length} entries).`
    );
  }

  const nextList = [...list.slice(0, target.index), ...list.slice(target.index + 1)];

  // Swap only the targeted list (field 0 = users, field 2 = beneficiaries) and
  // leave multi_sig_threshold (field 1) and the State's proof_of_life /
  // streaming_payments / wallet_name fields untouched.
  const nextAccessFields = [...access.fields];
  nextAccessFields[target.list === "user" ? 0 : 2] = nextList;

  const nextStateFields = [...unwrapped.fields];
  nextStateFields[0] = { ...access, fields: nextAccessFields };

  return { ...unwrapped, fields: nextStateFields };
}
