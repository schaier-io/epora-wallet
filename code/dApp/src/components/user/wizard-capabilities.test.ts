import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAvailableWizardActions,
  holdsAnyRole,
  resolveTokenCapabilityMap
} from "@/components/user/wizard-capabilities";
import { deriveWalletHomeFlowAvailability } from "@/lib/user-flow/guided-helpers";
import { createDefaultStateForm, type UserFormState } from "@/lib/contracts/state-form";

const OWNER_KEY_HASH = "bc3f3eae902eaf53b3d8a1f9d7ad2e6b370f8b9ec8c9b62a9044455b";
const STRANGER_KEY_HASH = "27c006ce8c4a4f84ccb6cc9a69ba61118966599c72cb6cfdbcd36810";

function user(over: Partial<UserFormState>): UserFormState {
  return {
    id: "0",
    wallets: [],
    perDayAllowance: [],
    remainingAllowance: [],
    nextAllowanceReset: "0",
    canRenewProofOfLife: false,
    multiSigPowerMode: "none",
    multiSigPower: "",
    isAdmin: false,
    preset: "custom",
    ...over
  };
}

function capabilitiesFor(paymentKeyHash: string | null, users: UserFormState[], over = {}) {
  return resolveTokenCapabilityMap({
    state: { ...createDefaultStateForm(), users, ...over },
    paymentKeyHash,
    lockedUtxoCount: 1,
    lockedUtxosLoading: false
  });
}

/**
 * The wallet HAVING an owner is not the same as the connected key BEING one.
 *
 * `availableOperatorPaths` used to be built from `hasAdminPath` / `hasMultisigPath`, which only
 * describe the wallet's own rules. Every smart wallet on the policy is listed to every visitor
 * (`lib/mesh/detection.ts` scans the whole policy, not the connected account), so any wallet with
 * an owner offered "Send funds", "Manage people" and "Wallet settings" to a stranger. The
 * transaction builder takes its required signer from the live wallet
 * (`lib/mesh/transactions/internals/core.ts`, via `setRequiredSigners([changeAddress])`), so the
 * build reached Blockfrost and came back as an unreadable "Evaluate redeemers failed".
 *
 * VERIFIED against Preprod on 2026-09-01: smart wallet
 * `addr_test1wr5ae0uf55xpmph3jmxmfayr6f0up2hvquwjn929zmgvlxqhpgu89`, whose only user is
 * `bc3f3eae…`, offered the full owner surface to the connected account `27c006ce…`.
 */
test("a wallet's owner path is closed to a key that does not hold it", () => {
  const owners = [user({ isAdmin: true, wallets: [OWNER_KEY_HASH] })];
  const capabilities = capabilitiesFor(STRANGER_KEY_HASH, owners);

  assert.equal(capabilities.hasAdminPath, true, "the wallet does have an owner");
  assert.deepEqual(capabilities.availableOperatorPaths, []);
  assert.equal(
    buildAvailableWizardActions(capabilities).some((action) => action.kind === "use"),
    false
  );
  assert.equal(deriveWalletHomeFlowAvailability(capabilities).canSend, false);
  assert.equal(deriveWalletHomeFlowAvailability(capabilities).canManageSettings, false);
});

test("the wallet's own owner keeps the owner path", () => {
  const owners = [user({ isAdmin: true, wallets: [OWNER_KEY_HASH] })];
  const capabilities = capabilitiesFor(OWNER_KEY_HASH, owners);

  assert.deepEqual(capabilities.availableOperatorPaths, ["admin"]);
  assert.equal(
    buildAvailableWizardActions(capabilities).some((action) => action.kind === "use"),
    true
  );
  assert.equal(deriveWalletHomeFlowAvailability(capabilities).canSend, true);
});

/**
 * The workspace opens only for a key that holds a role, and the wallet picker's default
 * follows the same answer. A wallet the key holds nothing in forwards to the wallet
 * selection instead: there is no action on it that its own rules would accept.
 */
test("holding no role is what sends a viewer back to the wallet selection", () => {
  const owners = [user({ isAdmin: true, wallets: [OWNER_KEY_HASH] })];

  assert.equal(holdsAnyRole(capabilitiesFor(STRANGER_KEY_HASH, owners)), false);
  assert.equal(holdsAnyRole(capabilitiesFor(OWNER_KEY_HASH, owners)), true);
  // The demo wallet connects with no key hash at all, and reads as a stranger everywhere.
  assert.equal(holdsAnyRole(capabilitiesFor(null, owners)), false);
});

test("a spender holds a role without holding the owner path", () => {
  const users = [
    user({ isAdmin: true, wallets: [OWNER_KEY_HASH] }),
    user({ id: "1", wallets: [STRANGER_KEY_HASH] })
  ];
  const capabilities = capabilitiesFor(STRANGER_KEY_HASH, users);

  assert.equal(holdsAnyRole(capabilities), true);
  assert.deepEqual(capabilities.availableOperatorPaths, []);
  assert.equal(
    buildAvailableWizardActions(capabilities).some((action) => action.kind === "use-allowance"),
    true
  );
});

test("the co-signer path is closed to a key with no approval power", () => {
  const users = [
    user({ isAdmin: true, wallets: [OWNER_KEY_HASH] }),
    user({ id: "1", wallets: [OWNER_KEY_HASH], multiSigPowerMode: "some", multiSigPower: "1" })
  ];
  const multisig = { multiSigThresholdMode: "some" as const, multiSigThreshold: "1" };

  assert.deepEqual(
    capabilitiesFor(STRANGER_KEY_HASH, users, multisig).availableOperatorPaths,
    []
  );
});

test("a co-signer with approval power keeps the co-signer path", () => {
  const users = [
    user({ isAdmin: true, wallets: [OWNER_KEY_HASH] }),
    user({ id: "1", wallets: [STRANGER_KEY_HASH], multiSigPowerMode: "some", multiSigPower: "1" })
  ];
  const multisig = { multiSigThresholdMode: "some" as const, multiSigThreshold: "1" };

  assert.deepEqual(
    capabilitiesFor(STRANGER_KEY_HASH, users, multisig).availableOperatorPaths,
    ["multisig"]
  );
});
