import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { SttSpendTxRequestSchema } from "@/lib/api/tx-stt-spend";
import { MAX_ON_CHAIN_STATE_INTEGER } from "@/lib/contracts/on-chain-integer";

// Four of the nine actions derive the forwarded State from the consumed one
// and never read the caller's copy. The schema must not require what the
// builder ignores, and the two lists must not drift apart.

const BUILDER_SOURCE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../mesh/transactions/stt-spend.ts"
);

const ADDRESS =
  "addr_test1qz7r704wjqh275anmzsln4ad9e4nwrutnmyvnd32jpzy2kal8d9m8yxj9gwg0ddh4nhj6zqwad8px7u45ljczt4ajfps72xr59";
const TX_HASH = "f8482092d1cf9deb9c2eddd45dea95dbcfbfdae060ce5dce851d1141db660fd0";
const HASH_HEX = "bc3f3eae902eaf53b3d8a1f9d7ad2e6b370f8b9ec8c9b62a9044455b";
const CO_SIGNER = "ab".repeat(28);

function distinctSignerKeyHashes(count: number) {
  return Array.from({ length: count }, (_, index) =>
    index.toString(16).padStart(56, "0")
  );
}

/** The fields every action needs, minus the two under test. */
function baseBody(action: string) {
  const body: Record<string, unknown> = {
    address: ADDRESS,
    config: { sttAssetNameHex: "ab" },
    sttInputTxHash: TX_HASH,
    action
  };
  if (action === "use-allowance") body.allowanceSignerKeyHash = HASH_HEX;
  if (action === "use-beneficiary" || action === "exit-beneficiary") body.beneficiarySignerKeyHash = HASH_HEX;
  if (action === "distribute-beneficiaries") { body.beneficiarySignerKeyHash=HASH_HEX; body.walletInputs=[{txHash:TX_HASH,outputIndex:1}]; }
  if (action === "stop-beneficiary-stream") { body.beneficiarySignerKeyHash = HASH_HEX; body.beneficiaryStreamStopId = 0; }
  if (action === "payout-streaming-payment") body.crankSignerKeyHash = HASH_HEX;
  if (action === "cancel-streaming-payment") body.streamingPaymentCancelId = 0;
  if (action === "remove-access-index") body.removeAccessTarget = { list: "user", index: 0 };
  return body;
}

const ALL_ACTIONS = [
  "use",
  "renew-proof-of-life",
  "update-state",
  "manage-streaming-payments",
  "use-allowance",
  "use-beneficiary",
  "exit-beneficiary",
  "stop-beneficiary-stream",
  "distribute-beneficiaries",
  "payout-streaming-payment",
  "cancel-streaming-payment",
  "remove-access-index"
];

/** The actions the builder itself excludes from the caller-supplied State. */
function buildersDerivingActions() {
  const source = readFileSync(BUILDER_SOURCE, "utf8");
  const assignment = /const derivesForwardedDatum =([\s\S]*?);/.exec(source);
  assert.ok(assignment, "stt-spend.ts no longer declares derivesForwardedDatum");
  return [...assignment[1].matchAll(/action === "([a-z-]+)"/g)].map((match) => match[1]).sort();
}

describe("SttSpendTxRequestSchema", () => {
  it("accepts the deriving actions without outputDatum or outputAssets", () => {
    for (const action of buildersDerivingActions()) {
      const result = SttSpendTxRequestSchema.safeParse(baseBody(action));
      assert.equal(result.success, true, `${action}: ${result.success ? "" : result.error.message}`);
    }
  });

  it("still requires both fields for every forwarding action", () => {
    const deriving = new Set([...buildersDerivingActions(), "distribute-beneficiaries"]);
    const forwarding = ALL_ACTIONS.filter((action) => !deriving.has(action));
    assert.equal(forwarding.length, 5);
    for (const action of forwarding) {
      const result = SttSpendTxRequestSchema.safeParse(baseBody(action));
      assert.equal(result.success, false, `${action} should reject a body without the State`);
      const missing = result.success
        ? []
        : result.error.issues.map((issue) => issue.path.join("."));
      assert.ok(missing.includes("outputDatum"), `${action}: ${missing.join(", ")}`);
      assert.ok(missing.includes("outputAssets"), `${action}: ${missing.join(", ")}`);
    }
  });

  it("covers every action the union declares", () => {
    const declared = ALL_ACTIONS.map((action) => {
      const body = action === "distribute-beneficiaries" ? baseBody(action) : { ...baseBody(action), outputDatum: { alternative: 0, fields: [] }, outputAssets: [] };
      return SttSpendTxRequestSchema.safeParse(body).success;
    });
    assert.deepEqual(declared, ALL_ACTIONS.map(() => true));
  });

  it("preserves required multisig signer hashes", () => {
    const parsed = SttSpendTxRequestSchema.parse({
      ...baseBody("use"),
      outputDatum: { alternative: 0, fields: [] },
      outputAssets: [],
      authorityPath: "multisig",
      requiredSignerKeyHashes: [CO_SIGNER]
    });

    assert.deepEqual(parsed.requiredSignerKeyHashes, [CO_SIGNER]);
  });

  it("rejects malformed required signers and accepts a 15-signer list", () => {
    const body = {
      ...baseBody("use"),
      outputDatum: { alternative: 0, fields: [] },
      outputAssets: [],
      authorityPath: "multisig"
    };

    assert.equal(
      SttSpendTxRequestSchema.safeParse({ ...body, requiredSignerKeyHashes: ["ab"] }).success,
      false
    );
    assert.equal(
      SttSpendTxRequestSchema.safeParse({
        ...body,
        requiredSignerKeyHashes: distinctSignerKeyHashes(15)
      }).success,
      true
    );
  });

  it("accepts multiple wallet-script inputs for an STT spend", () => {
    const body = {
      ...baseBody("use"),
      outputDatum: { alternative: 0, fields: [] },
      outputAssets: []
    };
    const walletInputs = Array.from(
      { length: 3 },
      (_, outputIndex) => ({ txHash: TX_HASH, outputIndex })
    );

    assert.equal(
      SttSpendTxRequestSchema.safeParse({ ...body, walletInputs }).success,
      true
    );
  });

  it("accepts every streaming-payment payout transfer in the request", () => {
    const transfers = Array.from(
      { length: 3 },
      () => ({
        address: ADDRESS,
        amount: [{ unit: "lovelace", quantity: "1" }]
      })
    );
    const forwardingFields = {
      outputDatum: { alternative: 0, fields: [] },
      outputAssets: []
    };

    assert.equal(
      SttSpendTxRequestSchema.safeParse({
        ...baseBody("payout-streaming-payment"),
        ...forwardingFields,
        extraTransfers: transfers
      }).success,
      true
    );
  });

  it("parses an exact uint64 cancellation id at the route boundary", () => {
    const parsed = SttSpendTxRequestSchema.parse({
      ...baseBody("cancel-streaming-payment"),
      streamingPaymentCancelId: {
        int: MAX_ON_CHAIN_STATE_INTEGER.toString()
      }
    });

    if (parsed.action !== "cancel-streaming-payment") {
      assert.fail("Expected the cancellation request variant.");
    }
    assert.equal(parsed.streamingPaymentCancelId, MAX_ON_CHAIN_STATE_INTEGER);
  });
});

it("beneficiary stop requires a signer and target, accepts uint64, and rejects every fund movement", () => {
  const body = baseBody("stop-beneficiary-stream");
  assert.equal(SttSpendTxRequestSchema.safeParse(body).success, true);
  for (const key of ["beneficiarySignerKeyHash", "beneficiaryStreamStopId"]) {
    assert.equal(SttSpendTxRequestSchema.safeParse({...body,[key]:undefined}).success,false);
  }
  const parsed = SttSpendTxRequestSchema.parse({...body,beneficiaryStreamStopId:{int:MAX_ON_CHAIN_STATE_INTEGER.toString()}});
  assert.equal(parsed.action === "stop-beneficiary-stream" && parsed.beneficiaryStreamStopId,MAX_ON_CHAIN_STATE_INTEGER);
  for (const extra of [
    {walletInputs:[{txHash:TX_HASH,outputIndex:0}]},
    {walletOutputs:[{amount:[{unit:"lovelace",quantity:"2000000"}]}]},
    {extraTransfers:[{address:ADDRESS,amount:[{unit:"lovelace",quantity:"2000000"}]}]}
  ]) assert.equal(SttSpendTxRequestSchema.safeParse({...body,...extra}).success,false);
});

it("exact distribution API requires one input and rejects caller outputs, transfers and authority",()=>{
  const body=baseBody("distribute-beneficiaries");
  assert.equal(SttSpendTxRequestSchema.safeParse(body).success,true);
  for(const changes of [
    {walletInputs:[]},{walletInputs:[{txHash:TX_HASH,outputIndex:1},{txHash:TX_HASH,outputIndex:2}]},
    {beneficiarySignerKeyHash:undefined},{outputDatum:{alternative:0,fields:[]}},{outputAssets:[]},
    {authorityPath:"admin"},{authorityPath:"beneficiary"},
    {walletOutputs:[{amount:[{unit:"lovelace",quantity:"2000000"}]}]},
    {extraTransfers:[{address:ADDRESS,amount:[{unit:"lovelace",quantity:"2000000"}]}]}
  ]) assert.equal(SttSpendTxRequestSchema.safeParse({...body,...changes}).success,false);
});
