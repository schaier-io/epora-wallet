import assert from "node:assert/strict";
import test from "node:test";

import { createDefaultStateForm, stateFormToDatum, type StateFormState } from "@/lib/contracts/state-form";
import { computeAllowancePreview } from "@/components/user/workspace/workspace-allowance-preview";
import type { ConstrData } from "@/lib/types/contracts";

const SIGNER = "03c422c5d9b8e4e15bcd660ef7a47aed2234f8118bc6e730c5786aa9";
const RECIPIENT =
  "addr_test1qqpuggk9mxuwfc2me4nqaaay0tkjyd8czx9udeesc4ux42gy6nc6cptzv8dusc4d4ae2pt5ld9u4xgdh6vekt6k04huqtu9ru2";
const ONE_ADA = [{ unit: "lovelace", quantity: "1000000" }];
const NO_INLINE_DATUM = { mode: "empty-alt-1", customAlternative: "" } as const;
// The selected fund pool: its inputs must cover what the payout asks for, or
// the preview stops at the fit check before it ever matches a spender.
const POOL_TX = "9".repeat(64);
const POOL_UTXO = {
  input: { txHash: POOL_TX, outputIndex: 0 },
  output: {
    address: "addr_test1wr8443x29yhdslnat0eywl9vncryc9jsydtl7p3fm9ws6mpq0npqrz7",
    amount: [{ unit: "lovelace", quantity: "9000000" }]
  }
} as unknown as Parameters<typeof computeAllowancePreview>[0]["lockedContractUtxos"][number];

function spenderUser(id: string, wallets: string[], perDayAda: string, isAdmin: boolean): StateFormState["users"][number] {
  return {
    id,
    wallets,
    perDayAllowance: isAdmin ? [] : [{ policyId: "", assetName: "", amount: perDayAda }],
    remainingAllowance: [],
    nextAllowanceReset: "0",
    canRenewProofOfLife: isAdmin,
    multiSigPowerMode: "none",
    multiSigPower: "",
    isAdmin,
    preset: isAdmin ? "admin" : "limited-withdrawal"
  };
}

function stateFormWithSpender(perDayAda: string): ConstrData {
  const form: StateFormState = {
    ...createDefaultStateForm(),
    users: [
      spenderUser("0", ["27c006ce8c4a4f84ccb6cc9a69ba61118966599c72cb6cfdbcd36810"], perDayAda, true),
      spenderUser("1", [SIGNER], perDayAda, false)
    ]
  };

  return stateFormToDatum(form) as unknown as ConstrData;
}

type PreviewParams = Parameters<typeof computeAllowancePreview>[0];

function runPreview(params: {
  datum: ConstrData | null;
  transfers: PreviewParams["sttExtraTransfers"];
}) {
  return computeAllowancePreview({
    effectiveSttAction: "use-allowance",
    activePaymentKeyHash: SIGNER,
    selectedDetectedToken: params.datum
      ? ({ datum: params.datum } as Parameters<typeof computeAllowancePreview>[0]["selectedDetectedToken"])
      : null,
    activeInferredSttStateForm: createDefaultStateForm(),
    sttWalletOutputs: [],
    sttExtraTransfers: params.transfers,
    sttWalletInputs: [{ txHash: POOL_TX, outputIndex: 0 }],
    lockedContractUtxos: [POOL_UTXO]
  });
}

test("with no payout staged, the preview points at the next step instead of a resolver error", () => {
  const result = runPreview({ datum: stateFormWithSpender("3"), transfers: [] });

  assert.equal(result.computation, null);
  assert.match(result.error ?? "", /[Aa]dd a payout/);
});

test("an allowance too small for the payout surfaces the real rule that blocked it", () => {
  // 0.000003 ADA is what the ledger used to hold for the daily limit after the
  // unscaled "3" write; the generic fallback used to mask this as a resolver bug.
  const result = runPreview({
    datum: stateFormWithSpender("0.000003"),
    transfers: [{ address: RECIPIENT, amount: ONE_ADA, inlineDatum: NO_INLINE_DATUM }]
  });

  assert.equal(result.computation, null);
  assert.match(
    result.error ?? "",
    /does not match any spender with enough remaining allowance/
  );
});

test("a sufficient daily limit resolves the spender and the effective allowance", () => {
  const result = runPreview({
    datum: stateFormWithSpender("3"),
    transfers: [{ address: RECIPIENT, amount: ONE_ADA, inlineDatum: NO_INLINE_DATUM }]
  });

  assert.equal(result.error, null);
  assert.equal(result.target?.matchedUserId, 1);
  assert.deepEqual(result.target?.effectiveRemainingAllowance, [
    { unit: "lovelace", quantity: "3000000" }
  ]);
});
