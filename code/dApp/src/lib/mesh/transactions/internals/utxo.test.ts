import assert from "node:assert/strict";
import test from "node:test";
import type { UTxO } from "@meshsdk/core";
import { type RuntimeTxBuilder } from "@/lib/mesh/transactions/internals/budget-runtime-builder";
import { MIN_COLLATERAL_LOVELACE } from "@/lib/mesh/transactions/internals/constants";
import {
  addWalletInput,
  assertValidConsolidationLayout,
  compareInputRefs,
  createInputRefKey,
  dedupeUtxos,
  ensureUniqueWalletInputRefs,
  findUtxo,
  resolveManualCollateralCandidate,
  resolveExactWalletInputUtxos,
  resolveSttInputUtxo
} from "@/lib/mesh/transactions/internals/utxo";
import { composeWalletReceiveAddress } from "@/lib/contracts/payout-address";

// A real preprod address: collateral sizing serializes the output to measure
// the min-UTxO of its collateral return.
const TEST_ADDRESS =
  "addr_test1qz7r704wjqh275anmzsln4ad9e4nwrutnmyvnd32jpzy2kal8d9m8yxj9gwg0ddh4nhj6zqwad8px7u45ljczt4ajfps72xr59";

function utxo(txHash: string, outputIndex: number, lovelace = "1000000"): UTxO {
  return {
    input: { txHash, outputIndex },
    output: {
      address: TEST_ADDRESS,
      amount: [{ unit: "lovelace", quantity: lovelace }]
    }
  } as UTxO;
}

function sttUtxo(
  txHash: string,
  outputIndex: number,
  unit: string,
  lovelace = "2000000"
): UTxO {
  return {
    input: { txHash, outputIndex },
    output: {
      address: TEST_ADDRESS,
      amount: [
        { unit: "lovelace", quantity: lovelace },
        { unit, quantity: "1" }
      ]
    }
  } as UTxO;
}

const HASH_A = "aa".repeat(32);
const HASH_B = "bb".repeat(32);
// Valid hex: collateral sizing serializes the asset unit to measure the return output.
const STT_UNIT = "ab".repeat(28) + "deadbeef";

test("createInputRefKey joins txHash and outputIndex", () => {
  assert.equal(createInputRefKey(HASH_A, 3), `${HASH_A}#3`);
});

test("compareInputRefs is a case-insensitive lexical comparison", () => {
  assert.equal(compareInputRefs("aa#0", "aa#0"), 0);
  assert.ok(compareInputRefs("aa#0", "bb#0") < 0);
  assert.equal(compareInputRefs("AA#0", "aa#0"), 0);
});

test("dedupeUtxos keeps the first occurrence of each txHash#index", () => {
  const first = utxo(HASH_A, 0, "111");
  const duplicate = utxo(HASH_A, 0, "999");
  const distinctIndex = utxo(HASH_A, 1, "222");
  const distinctHash = utxo(HASH_B, 0, "333");

  const result = dedupeUtxos([first, duplicate, distinctIndex, distinctHash]);

  assert.equal(result.length, 3);
  // The first-seen object wins; the later duplicate is discarded.
  assert.equal(result[0]!.output.amount[0]!.quantity, "111");
  assert.deepEqual(
    result.map((u) => createInputRefKey(u.input.txHash, u.input.outputIndex)),
    [`${HASH_A}#0`, `${HASH_A}#1`, `${HASH_B}#0`]
  );
});

test("findUtxo locates by hash, by hash+index, and throws when absent", () => {
  const utxos = [utxo(HASH_A, 0), utxo(HASH_A, 1), utxo(HASH_B, 0)];

  assert.equal(findUtxo(utxos, HASH_A).input.outputIndex, 0);
  assert.equal(findUtxo(utxos, HASH_A, 1).input.outputIndex, 1);
  assert.throws(() => findUtxo(utxos, HASH_A, 9), /UTxO not found/);
  assert.throws(() => findUtxo(utxos, "cc".repeat(32)), /UTxO not found/);
});

test("resolveSttInputUtxo prefers the txHash reference when it exists", () => {
  const referenced = sttUtxo(HASH_A, 0, STT_UNIT);
  const utxos = [utxo(HASH_B, 0), referenced];

  // Exact reference wins even though another UTxO could hold the asset.
  assert.equal(resolveSttInputUtxo(utxos, HASH_A, 0, STT_UNIT), referenced);
});

test("resolveSttInputUtxo rejects an exact reference without exactly one configured STT", () => {
  const missing = utxo(HASH_A, 0);
  assert.throws(
    () => resolveSttInputUtxo([missing], HASH_A, 0, STT_UNIT),
    /must hold exactly one/
  );

  const doubled = sttUtxo(HASH_A, 0, STT_UNIT);
  doubled.output.amount[1]!.quantity = "2";
  assert.throws(
    () => resolveSttInputUtxo([doubled], HASH_A, 0, STT_UNIT),
    /must hold exactly one/
  );
});

test("resolveSttInputUtxo finds the token-bearing sibling when output index is omitted", () => {
  const tokenlessFirst = utxo(HASH_A, 0);
  const tokenBearing = sttUtxo(HASH_A, 1, STT_UNIT);

  assert.equal(
    resolveSttInputUtxo([tokenlessFirst, tokenBearing], HASH_A, undefined, STT_UNIT),
    tokenBearing
  );
});

test("resolveSttInputUtxo falls back to the unique STT-holding UTxO when the ref is stale", () => {
  // The cached reference (HASH_A) was spent; the STT moved to HASH_B. The unique NFT-holding
  // UTxO is found by asset unit instead of failing with "UTxO not found".
  const moved = sttUtxo(HASH_B, 1, STT_UNIT);
  const unrelated = utxo("cc".repeat(32), 0);
  const utxos = [unrelated, moved];

  assert.equal(resolveSttInputUtxo(utxos, HASH_A, 0, STT_UNIT), moved);
});

test("resolveSttInputUtxo throws when no UTxO holds the STT and the ref is absent", () => {
  const utxos = [utxo(HASH_B, 0)];
  assert.throws(() => resolveSttInputUtxo(utxos, HASH_A, 0, STT_UNIT), /UTxO not found/);
});

test("resolveSttInputUtxo rejects an ambiguous STT (a unique NFT must live in one UTxO)", () => {
  const utxos = [sttUtxo(HASH_A, 0, STT_UNIT), sttUtxo(HASH_B, 0, STT_UNIT)];
  // Reference matches HASH_A here, so add a case with no matching ref to force the asset path.
  assert.throws(
    () => resolveSttInputUtxo(utxos, "cc".repeat(32), 0, STT_UNIT),
    /Ambiguous STT input/
  );
});

test("resolveSttInputUtxo ignores malformed fallback quantities", () => {
  const malformed = sttUtxo(HASH_A, 0, STT_UNIT);
  malformed.output.amount[1]!.quantity = "2";
  assert.throws(
    () => resolveSttInputUtxo([malformed], HASH_B, 0, STT_UNIT),
    /UTxO not found/
  );
});

test("resolveExactWalletInputUtxos accepts any stake variant with the expected payment script", async () => {
  const paymentScriptHash = "ab".repeat(28);
  const address = composeWalletReceiveAddress(paymentScriptHash, {
    alternative: 0,
    fields: [{ alternative: 0, fields: ["cd".repeat(28)] }]
  });
  assert.ok(address);
  const exact = {
    ...utxo(HASH_A, 2),
    output: { ...utxo(HASH_A, 2).output, address }
  } as UTxO;

  const resolved = await resolveExactWalletInputUtxos(
    { async fetchUTxOs() { return [exact]; }, async get() { return { outputs: [] }; } },
    [{ txHash: HASH_A, outputIndex: 2 }],
    paymentScriptHash
  );
  assert.equal(resolved[0], exact);
});

test("resolveExactWalletInputUtxos rejects a reference the chain already consumed", async () => {
  // Mesh's fetchUTxOs still lists a spent output, so the provider's own record decides.
  const paymentScriptHash = "ab".repeat(28);
  const address = composeWalletReceiveAddress(paymentScriptHash, { alternative: 1, fields: [] });
  assert.ok(address);
  const exact = {
    ...utxo(HASH_A, 2),
    output: { ...utxo(HASH_A, 2).output, address }
  } as UTxO;

  await assert.rejects(
    resolveExactWalletInputUtxos(
      {
        async fetchUTxOs() { return [exact]; },
        async get() {
          return { outputs: [{ output_index: 2, consumed_by_tx: HASH_B }] };
        }
      },
      [{ txHash: HASH_A, outputIndex: 2 }],
      paymentScriptHash
    ),
    /was already spent by/
  );
});

test("resolveExactWalletInputUtxos rejects a reference at another payment credential", async () => {
  const expectedPaymentScriptHash = "ab".repeat(28);
  const wrongAddress = composeWalletReceiveAddress("ef".repeat(28), {
    alternative: 1,
    fields: []
  });
  assert.ok(wrongAddress);
  const exact = {
    ...utxo(HASH_A, 2),
    output: { ...utxo(HASH_A, 2).output, address: wrongAddress }
  } as UTxO;

  await assert.rejects(
    resolveExactWalletInputUtxos(
      { async fetchUTxOs() { return [exact]; }, async get() { return { outputs: [] }; } },
      [{ txHash: HASH_A, outputIndex: 2 }],
      expectedPaymentScriptHash
    ),
    /does not use this wallet's payment credential/
  );
});

test("consolidation permits one input only for address migration", () => {
  const canonical = "addr_test1_canonical";
  const sameAddress = utxo(HASH_A, 0);
  sameAddress.output.address = canonical;
  assert.throws(
    () => assertValidConsolidationLayout([sameAddress], canonical, 1),
    /needs at least two inputs/
  );

  const oldStakeVariant = utxo(HASH_B, 0);
  oldStakeVariant.output.address = "addr_test1_old_stake";
  assert.deepEqual(
    assertValidConsolidationLayout([oldStakeVariant], canonical, 1),
    { migratesAddress: true }
  );
  assert.throws(
    () => assertValidConsolidationLayout([oldStakeVariant], canonical, 2),
    /cannot increase/
  );
});

test("ensureUniqueWalletInputRefs passes distinct refs and rejects duplicates", () => {
  assert.doesNotThrow(() =>
    ensureUniqueWalletInputRefs([
      { txHash: HASH_A, outputIndex: 0 },
      { txHash: HASH_A, outputIndex: 1 },
      { txHash: HASH_B, outputIndex: 0 }
    ])
  );
  assert.throws(
    () =>
      ensureUniqueWalletInputRefs([
        { txHash: HASH_A, outputIndex: 0 },
        { txHash: HASH_A, outputIndex: 0 }
      ]),
    /Duplicate wallet input reference/
  );
});

// Manual collateral selection: the deposit is 5 ADA, and the UTxO must also
// leave the collateral return output above its own min-UTxO floor, so a UTxO
// holding exactly 5 ADA does not qualify. Preference: pure ADA first, then the
// smallest. Getting this wrong fails script transactions.
test("resolveManualCollateralCandidate picks the smallest qualifying pure-ADA UTxO", () => {
  const result = resolveManualCollateralCandidate(
    [
      utxo(HASH_A, 0, String(MIN_COLLATERAL_LOVELACE + 5_000_000)), // qualifies (larger)
      utxo(HASH_B, 1, String(MIN_COLLATERAL_LOVELACE + 2_000_000)), // qualifies (smallest) -> chosen
      utxo("cc".repeat(32), 2, String(MIN_COLLATERAL_LOVELACE)) // no room for the return output
    ],
    new Set()
  );

  assert.equal(result.collateral?.input.txHash, HASH_B);
  assert.equal(result.source, "manual.unreserved-wallet-utxo");
});

// Babbage returns everything above the deposit, native tokens included, so a
// token-bearing UTxO is valid collateral. The wallet no longer needs a separate
// ADA-only UTxO.
test("resolveManualCollateralCandidate accepts a token-bearing UTxO", () => {
  const result = resolveManualCollateralCandidate(
    [sttUtxo(HASH_A, 0, STT_UNIT, String(MIN_COLLATERAL_LOVELACE + 3_000_000))],
    new Set()
  );

  assert.equal(result.collateral?.input.txHash, HASH_A);
  assert.equal(result.source, "manual.unreserved-wallet-utxo");
});

test("resolveManualCollateralCandidate prefers pure ADA over a smaller token-bearing UTxO", () => {
  const result = resolveManualCollateralCandidate(
    [
      sttUtxo(HASH_A, 0, STT_UNIT, String(MIN_COLLATERAL_LOVELACE + 2_000_000)),
      utxo(HASH_B, 1, String(MIN_COLLATERAL_LOVELACE + 4_000_000))
    ],
    new Set()
  );

  assert.equal(result.collateral?.input.txHash, HASH_B);
});

test("resolveManualCollateralCandidate falls back to a reserved UTxO when it is the only candidate", () => {
  const result = resolveManualCollateralCandidate(
    [utxo(HASH_A, 0, String(MIN_COLLATERAL_LOVELACE + 2_000_000))],
    new Set([createInputRefKey(HASH_A, 0)])
  );

  assert.equal(result.collateral?.input.txHash, HASH_A);
  assert.equal(result.source, "manual.reserved-wallet-utxo");
});

test("resolveManualCollateralCandidate returns null when nothing meets the collateral minimum", () => {
  const result = resolveManualCollateralCandidate(
    [utxo(HASH_A, 0, String(MIN_COLLATERAL_LOVELACE))],
    new Set()
  );

  assert.equal(result.collateral, null);
  assert.equal(result.source, "manual.wallet-utxos-unavailable");
});

test("addWalletInput forwards the UTxO to txIn with the script-ref byte size and requires txIn()", () => {
  const calls: unknown[][] = [];
  const builder = {
    txIn: (...args: unknown[]) => {
      calls.push(args);
    }
  } as unknown as RuntimeTxBuilder;

  addWalletInput(builder, utxo(HASH_A, 0, "1000000"));
  assert.deepEqual(calls[0], [
    HASH_A,
    0,
    [{ unit: "lovelace", quantity: "1000000" }],
    TEST_ADDRESS,
    0
  ]);

  const withRef = {
    input: { txHash: HASH_B, outputIndex: 1 },
    output: {
      address: TEST_ADDRESS,
      amount: [{ unit: "lovelace", quantity: "1000000" }],
      scriptRef: "abcd" // 4 hex chars -> 2 bytes
    }
  } as UTxO;
  addWalletInput(builder, withRef);
  assert.equal((calls[1] as unknown[])[4], 2);

  assert.throws(() => addWalletInput({} as RuntimeTxBuilder, utxo(HASH_A, 0)), /missing txIn/);
});
