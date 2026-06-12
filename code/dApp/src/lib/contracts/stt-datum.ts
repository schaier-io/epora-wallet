import type { ConstrData } from "@/lib/types/contracts";
import { isStateDatum } from "@/lib/contracts/state-layout";

// The STT datum is the State constructor directly — there is no longer a
// wrapper that pairs it with a wallet witness (the witness merged into the
// SttAction redeemer; see `lib/contracts/action-data.ts`).
//
// These helpers keep the legacy function names so existing call sites in the
// transaction builders compile unchanged; their behaviour is now identity /
// pass-through.

/// Identity: the on-chain datum *is* the State constructor. Returns the input
/// after validating it has the expected State shape, so call sites that used
/// to wrap can still rely on the validation throwing on bad input.
export function unwrapStateDatum(
  datum: ConstrData,
  label = "STT datum"
): ConstrData {
  if (isStateDatum(datum)) {
    return datum;
  }
  throw new Error(`${label} must be a State constructor.`);
}
