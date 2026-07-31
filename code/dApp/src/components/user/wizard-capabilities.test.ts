import assert from "node:assert/strict";
import test from "node:test";
import { buildAdvancedWizardActions } from "@/components/user/wizard-capabilities";
import type { TokenCapabilityMap } from "@/components/user/flow-types";

test("advanced actions never expose the invalid raw wallet-spend builder", () => {
  const capabilities: TokenCapabilityMap = {
    hasAdminPath: true,
    hasDirectAdminSigner: true,
    hasMultisigPath: false,
    hasDirectUserMatch: true,
    hasDirectProofOfLifeRenewalMatch: true,
    hasBeneficiaryMatch: true,
    hasStreamingPayments: false,
    hasLockedUtxos: true,
    lockedUtxosLoading: false,
    availableOperatorPaths: ["admin"],
    availableConsolidatePaths: ["admin", "beneficiary"]
  };

  assert.equal(
    buildAdvancedWizardActions(capabilities).includes("wallet-spend"),
    false
  );
});
