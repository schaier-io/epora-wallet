import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  MAX_ALLOWANCE_ENTRIES,
  MAX_BENEFICIARIES,
  MAX_BENEFICIARY_WALLETS,
  MAX_STREAMING_PAYMENTS,
  MAX_USERS,
  MAX_WALLETS_PER_USER
} from "@/lib/contracts/state-validation-records";
import { MAX_WALLET_NAME_BYTES } from "@/lib/contracts/state-wallet-name";

// The contract (`lib/constants.ak`) is the single source of truth for the
// execution-budget caps. The frontend re-states them for advisory pre-flight
// validation, so a drift means the UI would accept a state the wallet rejects
// (or warn on one it accepts). This test parses constants.ak and fails if any
// mirrored cap disagrees — and if a NEW `max_*` cap is added on-chain without a
// mirror here. It replaces the hand-maintained "keep in sync" comments with an
// enforced check. (`milliseconds_per_day` is intentionally not covered: it is a
// fixed physical constant mirrored as the private `ALLOWANCE_DAY_MS` in
// `use-allowance.ts`, not an attacker-/operator-tunable cap.)

const CONSTANTS_AK = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../smart-contract/lib/constants.ak"
);

function parseAikenIntConsts(): Map<string, number> {
  const text = readFileSync(CONSTANTS_AK, "utf8");
  const pattern = /pub\s+const\s+([a-z0-9_]+)\s*:\s*Int\s*=\s*([0-9_]+)/g;
  const consts = new Map<string, number>();
  for (const match of text.matchAll(pattern)) {
    consts.set(match[1], Number(match[2].replace(/_/g, "")));
  }
  return consts;
}

// Aiken const name -> the frontend constant that must equal it.
const MIRRORED_CAPS: Record<string, number> = {
  max_users: MAX_USERS,
  max_beneficiaries: MAX_BENEFICIARIES,
  max_streaming_payments: MAX_STREAMING_PAYMENTS,
  max_wallets_per_user: MAX_WALLETS_PER_USER,
  max_allowance_entries: MAX_ALLOWANCE_ENTRIES,
  max_beneficiary_wallets: MAX_BENEFICIARY_WALLETS,
  max_wallet_name_bytes: MAX_WALLET_NAME_BYTES
};

test("frontend caps mirror lib/constants.ak exactly", () => {
  const onChain = parseAikenIntConsts();
  assert.ok(
    onChain.size > 0,
    `parsed no \`pub const … : Int\` from ${CONSTANTS_AK}`
  );

  for (const [aikenName, frontendValue] of Object.entries(MIRRORED_CAPS)) {
    assert.ok(
      onChain.has(aikenName),
      `lib/constants.ak no longer defines \`${aikenName}\` — update the parity map`
    );
    assert.equal(
      frontendValue,
      onChain.get(aikenName),
      `frontend mirror of \`${aikenName}\` is ${frontendValue} but the contract says ${onChain.get(
        aikenName
      )} — reconcile state-validation-records.ts / state-wallet-name.ts`
    );
  }
});

// `max_*` constants that are NOT state-CONFIGURATION caps (so they have no mirror
// in state-validation-records.ts) and are deliberately excluded from the mirror
// requirement below. Each must document why it is not validated state-side.
const NON_STATE_CONFIG_MAX_CONSTS = new Set<string>([
  // A tx-VALIDITY-window bound for the PayStreamingPayment crank (ADR-0009),
  // enforced at transaction-build time by `getValidityWindow` (~6 min window,
  // well under the 1h cap), not by State datum validation.
  "max_payout_validity_window_ms"
]);

test("every on-chain max_* cap has a frontend mirror", () => {
  const onChain = parseAikenIntConsts();
  for (const aikenName of onChain.keys()) {
    if (aikenName.startsWith("max_") && !NON_STATE_CONFIG_MAX_CONSTS.has(aikenName)) {
      assert.ok(
        aikenName in MIRRORED_CAPS,
        `lib/constants.ak adds \`${aikenName}\` with no frontend mirror — add it to state-validation-records.ts and this test (or to NON_STATE_CONFIG_MAX_CONSTS if it is not a state-config cap)`
      );
    }
  }
});
