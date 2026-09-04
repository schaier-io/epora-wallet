import assert from "node:assert/strict";
import test from "node:test";
import type { ProposalBuildContext } from "./types";
import { assertProposalTransactionBinding } from "./transaction-binding";
import { InvalidProposalBuildContextError } from "./validation";

const STT_INPUT_TX_HASH = "aa".repeat(32);

// One state input with a RunOperator(Multisig, Use) spend redeemer.
const MULTISIG_USE_TX =
  "84a40081825820aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa00018182581d60bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1a004c4b40021a00030d40031a055d4a80a10581840000d8799fd8799fd87a80d87980ffff820101f5f6";
const ADMIN_USE_TX =
  "84a40081825820aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa00018182581d60bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1a004c4b40021a00030d40031a055d4a80a10581840000d8799fd8799fd87980d87980ffff820101f5f6";
const PAYOUT_TX =
  "84a40081825820aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa00018182581d60bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1a004c4b40021a00030d40031a055d4a80a10581840000d87d9f80ff820101f5f6";
const CANCEL_TX =
  "84a40081825820aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa00018182581d60bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1a004c4b40021a00030d40031a055d4a80a10581840000d87f9f01ff820101f5f6";
const UPDATE_TX =
  "84a40081825820aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa00018182581d60bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1a004c4b40021a00030d40031a055d4a80a10581840000d8799fd8799fd87a80d87a80ffff820101f5f6";
const MANAGE_STREAMS_TX =
  "84a40081825820aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa00018182581d60bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1a004c4b40021a00030d40031a055d4a80a10581840000d8799fd8799fd87a80d87b80ffff820101f5f6";
const REMOVE_ACCESS_TX =
  "84a40081825820aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa00018182581d60bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1a004c4b40021a00030d40031a055d4a80a10581840000d8799fd8799fd87a80d87c9fd8799f00ffffffff820101f5f6";
const SET_STAKE_TX =
  "84a40081825820aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa00018182581d60bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1a004c4b40021a00030d40031a055d4a80a10581840000d8799fd8799fd87a80d87d9fd87a80ffffff820101f5f6";
const CONSOLIDATE_TX =
  "84a40081825820aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa00018182581d60bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1a004c4b40021a00030d40031a055d4a80a10581840000d87e9fd87a80ff820101f5f6";
// The matching redeemer belongs to cc...#0 at spend index 1, not the claimed aa...#0 state input.
const OTHER_INPUT_REDEEMER_TX =
  "84a40082825820aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa00825820cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc00018182581d60bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1a004c4b40021a00030d40031a055d4a80a10581840001d8799fd8799fd87a80d87980ffff820101f5f6";

function useContext(authorityPath: "admin" | "multisig"): ProposalBuildContext {
  return {
    builder: "stt-spend",
    mode: "use",
    config: {},
    input: {
      sttInputTxHash: STT_INPUT_TX_HASH,
      sttInputOutputIndex: 0,
      authorityPath
    }
  } as ProposalBuildContext;
}

function context(
  builder: ProposalBuildContext["builder"],
  authorityPath: "admin" | "multisig" = "multisig",
  mode?: string
): ProposalBuildContext {
  const input = {
    sttInputTxHash: STT_INPUT_TX_HASH,
    sttInputOutputIndex: 0,
    authorityPath,
    ...(mode === "remove-access-index"
      ? { removeAccessTarget: { list: "user", index: 0 } }
      : {}),
    ...(builder === "set-intended-stake-credential"
      ? { stakeCredential: { kind: "none" } }
      : {})
  };
  return {
    builder,
    ...(mode ? { mode } : {}),
    config: {},
    input
  } as ProposalBuildContext;
}

test("accepts a redeemer that matches the state input, mode, and authority path", () => {
  assert.doesNotThrow(() =>
    assertProposalTransactionBinding({
      unsignedTxHex: MULTISIG_USE_TX,
      buildContext: useContext("multisig")
    })
  );
});

test("binds every creatable operator action to its redeemer action", () => {
  const cases = [
    ["update-state", UPDATE_TX],
    ["manage-streaming-payments", MANAGE_STREAMS_TX],
    ["remove-access-index", REMOVE_ACCESS_TX]
  ] as const;
  for (const [mode, unsignedTxHex] of cases) {
    assert.doesNotThrow(() =>
      assertProposalTransactionBinding({
        unsignedTxHex,
        buildContext: context("stt-spend", "multisig", mode)
      })
    );
  }
  assert.throws(() =>
    assertProposalTransactionBinding({
      unsignedTxHex: MULTISIG_USE_TX,
      buildContext: context("stt-spend", "multisig", "update-state")
    })
  );
});

test("binds proposal wrapper builders to their exact STT redeemer", () => {
  for (const builder of ["wallet-withdraw", "wallet-publish", "wallet-vote"] as const) {
    assert.doesNotThrow(() =>
      assertProposalTransactionBinding({
        unsignedTxHex: MULTISIG_USE_TX,
        buildContext: context(builder)
      })
    );
  }
  assert.doesNotThrow(() =>
    assertProposalTransactionBinding({
      unsignedTxHex: SET_STAKE_TX,
      buildContext: context("set-intended-stake-credential")
    })
  );
  assert.doesNotThrow(() =>
    assertProposalTransactionBinding({
      unsignedTxHex: CONSOLIDATE_TX,
      buildContext: context("consolidate-utxo")
    })
  );
});

test("rejects a payout redeemer submitted under an operator-use context", () => {
  assert.throws(() =>
    assertProposalTransactionBinding({
      unsignedTxHex: PAYOUT_TX,
      buildContext: useContext("multisig")
    })
  );
});

test("rejects a cancel redeemer submitted under an operator-use context", () => {
  assert.throws(() =>
    assertProposalTransactionBinding({
      unsignedTxHex: CANCEL_TX,
      buildContext: useContext("multisig")
    })
  );
});

test("rejects a redeemer whose operator authority path differs from the context", () => {
  assert.throws(() =>
    assertProposalTransactionBinding({
      unsignedTxHex: MULTISIG_USE_TX,
      buildContext: useContext("admin")
    })
  );
  assert.throws(() =>
    assertProposalTransactionBinding({
      unsignedTxHex: ADMIN_USE_TX,
      buildContext: useContext("multisig")
    })
  );
});

test("rejects a matching redeemer that belongs to a different transaction input", () => {
  assert.throws(() =>
    assertProposalTransactionBinding({
      unsignedTxHex: OTHER_INPUT_REDEEMER_TX,
      buildContext: useContext("multisig")
    })
  );
});

test("normalizes malformed expected redeemer data as an invalid build context", () => {
  const buildContext = context("set-intended-stake-credential");
  delete (buildContext.input as { stakeCredential?: unknown }).stakeCredential;
  assert.throws(
    () =>
      assertProposalTransactionBinding({
        unsignedTxHex: SET_STAKE_TX,
        buildContext
      }),
    InvalidProposalBuildContextError
  );
});
