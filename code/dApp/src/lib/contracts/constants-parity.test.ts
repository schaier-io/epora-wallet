import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  MAX_ACCESS_RECORDS,
  MAX_ALLOWANCE_ENTRIES,
  MAX_ASSET_NAME_BYTES,
  MAX_BENEFICIARIES,
  MAX_BENEFICIARY_WALLETS,
  MAX_ON_CHAIN_STATE_INTEGER,
  MAX_TOTAL_BENEFICIARY_WALLETS,
  MAX_STREAMING_PAYMENTS,
  MAX_TOTAL_ALLOWANCE_ENTRIES,
  MAX_USERS,
  MAX_TOTAL_USER_WALLETS,
  MAX_WALLETS_PER_USER
} from "@/lib/contracts/state-validation-records";
import { MAX_WALLET_NAME_BYTES } from "@/lib/contracts/state-wallet-name";
import {
  MAX_NON_ADMIN_STREAMING_ACTION_VALIDITY_WINDOW_MS,
  NON_ADMIN_STREAMING_ACTION_COOLDOWN_MS
} from "@/lib/contracts/crank-cooldown";
import {
  MAX_BOUNDED_WALLET_NATIVE_ASSETS,
  MAX_GOVERNANCE_TRANSACTION_REDEEMERS,
  MAX_STREAMING_PAYOUTS_PER_TRANSACTION,
  MAX_TRANSACTION_INPUTS,
  MAX_TRANSACTION_OUTPUTS,
  MAX_TRANSACTION_REDEEMERS,
  MAX_TRANSACTION_SIGNATORIES,
  MAX_WALLET_INPUTS_PER_CONSOLIDATION,
  MAX_WALLET_INPUTS_PER_SPEND
} from "@/lib/contracts/transaction-limits";

// The contract (`lib/constants.ak`) is the single source of truth for the
// state and transaction rules. The frontend re-states them for advisory
// pre-flight validation, so drift can make the UI accept a transaction the
// wallet rejects. This test parses constants.ak and fails if a mirrored
// constant disagrees, and if a NEW `max_*` cap is added on-chain without a
// mirror here. It replaces the hand-maintained "keep in sync" comments with an
// enforced check. (`milliseconds_per_day` is intentionally not covered: it is a
// fixed physical constant mirrored as the private `ALLOWANCE_DAY_MS` in
// `use-allowance.ts`, not an attacker-/operator-tunable cap.)

const CONSTANTS_AK = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../smart-contract/lib/constants.ak"
);

function parseAikenIntConsts(): Map<string, bigint> {
  const text = readFileSync(CONSTANTS_AK, "utf8");
  const pattern = /pub\s+const\s+([a-z0-9_]+)\s*:\s*Int\s*=\s*([0-9_]+)/g;
  const consts = new Map<string, bigint>();
  for (const match of text.matchAll(pattern)) {
    consts.set(match[1]!, BigInt(match[2]!.replace(/_/g, "")));
  }
  return consts;
}

// Aiken const name -> the frontend constant that must equal it.
const exact = (value: number) => BigInt(value);

const MIRRORED_CONSTANTS: Record<string, bigint> = {
  max_users: exact(MAX_USERS),
  max_beneficiaries: exact(MAX_BENEFICIARIES),
  max_access_records: exact(MAX_ACCESS_RECORDS),
  max_streaming_payments: exact(MAX_STREAMING_PAYMENTS),
  max_wallets_per_user: exact(MAX_WALLETS_PER_USER),
  max_allowance_entries: exact(MAX_ALLOWANCE_ENTRIES),
  max_asset_name_bytes: exact(MAX_ASSET_NAME_BYTES),
  max_beneficiary_wallets: exact(MAX_BENEFICIARY_WALLETS),
  max_total_beneficiary_wallets: exact(MAX_TOTAL_BENEFICIARY_WALLETS),
  max_total_user_wallets: exact(MAX_TOTAL_USER_WALLETS),
  max_total_allowance_entries: exact(MAX_TOTAL_ALLOWANCE_ENTRIES),
  max_state_integer: MAX_ON_CHAIN_STATE_INTEGER,
  max_streaming_payouts_per_transaction: exact(MAX_STREAMING_PAYOUTS_PER_TRANSACTION),
  max_wallet_inputs_per_spend: exact(MAX_WALLET_INPUTS_PER_SPEND),
  max_wallet_inputs_per_consolidation: exact(MAX_WALLET_INPUTS_PER_CONSOLIDATION),
  max_transaction_inputs: exact(MAX_TRANSACTION_INPUTS),
  max_transaction_outputs: exact(MAX_TRANSACTION_OUTPUTS),
  max_transaction_signatories: exact(MAX_TRANSACTION_SIGNATORIES),
  max_transaction_redeemers: exact(MAX_TRANSACTION_REDEEMERS),
  max_governance_transaction_redeemers: exact(MAX_GOVERNANCE_TRANSACTION_REDEEMERS),
  max_bounded_wallet_native_assets: exact(MAX_BOUNDED_WALLET_NATIVE_ASSETS),
  max_wallet_name_bytes: exact(MAX_WALLET_NAME_BYTES),
  max_payout_validity_window_ms: exact(MAX_NON_ADMIN_STREAMING_ACTION_VALIDITY_WINDOW_MS),
  non_admin_payout_cooldown_ms: exact(NON_ADMIN_STREAMING_ACTION_COOLDOWN_MS)
};

test("frontend constants mirror lib/constants.ak exactly", () => {
  const onChain = parseAikenIntConsts();
  assert.ok(
    onChain.size > 0,
    `parsed no \`pub const … : Int\` from ${CONSTANTS_AK}`
  );

  for (const [aikenName, frontendValue] of Object.entries(MIRRORED_CONSTANTS)) {
    assert.ok(
      onChain.has(aikenName),
      `lib/constants.ak no longer defines \`${aikenName}\`; update the parity map`
    );
    assert.equal(
      frontendValue,
      onChain.get(aikenName),
      `frontend mirror of \`${aikenName}\` is ${frontendValue} but the contract says ${onChain.get(
        aikenName
      )}; reconcile the frontend enforcement constant`
    );
  }
});

test("every on-chain max_* cap has a frontend mirror", () => {
  const onChain = parseAikenIntConsts();
  for (const aikenName of onChain.keys()) {
    if (aikenName.startsWith("max_")) {
      assert.ok(
        aikenName in MIRRORED_CONSTANTS,
        `lib/constants.ak adds \`${aikenName}\` with no frontend mirror; add it to the module that enforces the cap and this test`
      );
    }
  }
});
