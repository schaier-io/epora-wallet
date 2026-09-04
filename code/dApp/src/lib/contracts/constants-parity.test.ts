import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  MAX_ALLOWANCE_ENTRIES,
  MAX_ASSET_NAME_BYTES,
  MAX_BENEFICIARIES,
  MAX_BENEFICIARY_WALLETS,
  MAX_STREAMING_PAYMENTS,
  MAX_USERS,
  MAX_WALLETS_PER_USER
} from "@/lib/contracts/state-validation-records";
import { MAX_WALLET_NAME_BYTES } from "@/lib/contracts/state-wallet-name";
import {
  MAX_NON_ADMIN_STREAMING_ACTION_VALIDITY_WINDOW_MS,
  NON_ADMIN_STREAMING_ACTION_COOLDOWN_MS
} from "@/lib/contracts/crank-cooldown";

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

function parseAikenIntConsts(): Map<string, number> {
  const text = readFileSync(CONSTANTS_AK, "utf8");
  const pattern = /pub\s+const\s+([a-z0-9_]+)\s*:\s*Int\s*=\s*([0-9_]+)/g;
  const consts = new Map<string, number>();
  for (const match of text.matchAll(pattern)) {
    consts.set(match[1]!, Number(match[2]!.replace(/_/g, "")));
  }
  return consts;
}

// Aiken const name -> the frontend constant that must equal it.
const MIRRORED_CONSTANTS: Record<string, number> = {
  max_users: MAX_USERS,
  max_beneficiaries: MAX_BENEFICIARIES,
  max_streaming_payments: MAX_STREAMING_PAYMENTS,
  max_wallets_per_user: MAX_WALLETS_PER_USER,
  max_allowance_entries: MAX_ALLOWANCE_ENTRIES,
  max_asset_name_bytes: MAX_ASSET_NAME_BYTES,
  max_beneficiary_wallets: MAX_BENEFICIARY_WALLETS,
  max_wallet_name_bytes: MAX_WALLET_NAME_BYTES,
  max_payout_validity_window_ms: MAX_NON_ADMIN_STREAMING_ACTION_VALIDITY_WINDOW_MS,
  non_admin_payout_cooldown_ms: NON_ADMIN_STREAMING_ACTION_COOLDOWN_MS
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
