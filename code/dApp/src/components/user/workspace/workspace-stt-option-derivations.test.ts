import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TokenCapabilityMap } from "@/components/user/flow-types";
import { resolveSigningActionAvailability } from "./workspace-stt-option-derivations";

function capabilities(
  overrides: Partial<TokenCapabilityMap> = {}
): TokenCapabilityMap {
  return {
    hasAdminPath: false,
    hasDirectAdminSigner: false,
    hasMultisigPath: false,
    hasDirectUserMatch: false,
    hasDirectProofOfLifeRenewalMatch: false,
    hasBeneficiaryMatch: false,
    hasStreamingPayments: false,
    hasLockedUtxos: false,
    lockedUtxosLoading: false,
    availableOperatorPaths: [],
    availableConsolidatePaths: [],
    ...overrides
  };
}

describe("review signing actions", () => {
  it("offers direct signing and an approval request to a dual-role wallet", () => {
    assert.deepEqual(
      resolveSigningActionAvailability(
        "use",
        capabilities({ availableOperatorPaths: ["admin", "multisig"] })
      ),
      {
        canDirectSign: true,
        directAuthorityPath: "admin",
        canSaveApprovalRequest: true
      }
    );
  });

  it("offers only an approval request to a co-signer", () => {
    assert.deepEqual(
      resolveSigningActionAvailability(
        "wallet-vote",
        capabilities({ availableOperatorPaths: ["multisig"] })
      ),
      {
        canDirectSign: false,
        directAuthorityPath: null,
        canSaveApprovalRequest: true
      }
    );
  });

  it("uses a recovery contact as the direct consolidate path", () => {
    assert.deepEqual(
      resolveSigningActionAvailability(
        "consolidate-utxo",
        capabilities({ availableConsolidatePaths: ["multisig", "beneficiary"] })
      ),
      {
        canDirectSign: true,
        directAuthorityPath: "beneficiary",
        canSaveApprovalRequest: true
      }
    );
  });

  it("keeps rule-driven and allowance actions direct", () => {
    assert.deepEqual(
      resolveSigningActionAvailability("use-allowance", capabilities()),
      {
        canDirectSign: true,
        directAuthorityPath: null,
        canSaveApprovalRequest: false
      }
    );
  });
});
