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
const WALLET_WITHDRAW_TX =
  "84a500d9010281825820aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa00018182581d60bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1a004c4b40021a00030d40031a055d4a8005a1581df0e9dcbf89a50c1d86f196cdb4f483d25fc0aaec071d29954516d0cf981a0012d687a105a282000082d8799fd8799fd87a80d87980ffff82010182030082d87a80820101f5f6";
const WALLET_WITHDRAW_WRONG_PURPOSE_REDEEMER_TX = WALLET_WITHDRAW_TX.replace(
  "82030082d87a80820101f5f6",
  "82030082d87980820101f5f6"
);
const WALLET_PUBLISH_TX =
  "84a500d9010281825820aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa00018182581d60bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1a004c4b40021a00030d40031a055d4a8004d901028182008201581ce9dcbf89a50c1d86f196cdb4f483d25fc0aaec071d29954516d0cf98a105a282000082d8799fd8799fd87a80d87980ffff82010182020082d87a80820101f5f6";
const WALLET_VOTE_TX =
  "84a500d9010281825820aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa00018182581d60bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1a004c4b40021a00030d40031a055d4a8013a18203581ce9dcbf89a50c1d86f196cdb4f483d25fc0aaec071d29954516d0cf98a1825820cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc028201f6a105a282000082d8799fd8799fd87a80d87980ffff82010182040082d87a80820101f5f6";
// The matching redeemer belongs to cc...#0 at spend index 1, not the claimed aa...#0 state input.
const OTHER_INPUT_REDEEMER_TX =
  "84a40082825820aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa00825820cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc00018182581d60bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1a004c4b40021a00030d40031a055d4a80a10581840001d8799fd8799fd87a80d87980ffff820101f5f6";

const REWARD_ADDRESS =
  "stake_test17r5ae0uf55xpmph3jmxmfayr6f0up2hvquwjn929zmgvlxqhfkys0";
const CERTIFICATE = { type: "RegisterStake", stakeKeyAddress: REWARD_ADDRESS };
const VOTE = {
  voter: {
    type: "DRep",
    drepId: "drep1y05ae0uf55xpmph3jmxmfayr6f0up2hvquwjn929zmgvlxqdjsap6"
  },
  govActionId: { txHash: "cc".repeat(32), txIndex: 2 },
  votingProcedure: { voteKind: "Yes" }
};

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
      : {}),
    ...(builder === "wallet-withdraw"
      ? { rewardAddress: REWARD_ADDRESS, amountLovelace: "1234567" }
      : {}),
    ...(builder === "wallet-publish" ? { certificate: CERTIFICATE } : {}),
    ...(builder === "wallet-vote" ? { vote: VOTE } : {})
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

test("binds proposal wrapper builders to their exact body purpose and purpose redeemer", () => {
  const cases = [
    ["wallet-withdraw", WALLET_WITHDRAW_TX],
    ["wallet-publish", WALLET_PUBLISH_TX],
    ["wallet-vote", WALLET_VOTE_TX]
  ] as const;
  for (const [builder, unsignedTxHex] of cases) {
    assert.doesNotThrow(() =>
      assertProposalTransactionBinding({
        unsignedTxHex,
        buildContext: context(builder)
      })
    );
    assert.throws(() =>
      assertProposalTransactionBinding({
        unsignedTxHex: MULTISIG_USE_TX,
        buildContext: context(builder)
      })
    );
  }
});

test("rejects proposal wrapper bodies that differ from the stored build context", () => {
  const withdrawContext = context("wallet-withdraw");
  (withdrawContext.input as { amountLovelace: string }).amountLovelace = "7654321";
  assert.throws(() =>
    assertProposalTransactionBinding({
      unsignedTxHex: WALLET_WITHDRAW_TX,
      buildContext: withdrawContext
    })
  );

  const publishContext = context("wallet-publish");
  (publishContext.input as { certificate: unknown }).certificate = {
    type: "DeregisterStake",
    stakeKeyAddress: REWARD_ADDRESS
  };
  assert.throws(() =>
    assertProposalTransactionBinding({
      unsignedTxHex: WALLET_PUBLISH_TX,
      buildContext: publishContext
    })
  );

  const voteContext = context("wallet-vote");
  (voteContext.input as { vote: typeof VOTE }).vote = {
    ...VOTE,
    govActionId: { ...VOTE.govActionId, txIndex: 3 }
  };
  assert.throws(() =>
    assertProposalTransactionBinding({
      unsignedTxHex: WALLET_VOTE_TX,
      buildContext: voteContext
    })
  );
});

test("rejects a wrapper purpose redeemer whose authority differs from the context", () => {
  assert.throws(() =>
    assertProposalTransactionBinding({
      unsignedTxHex: WALLET_WITHDRAW_WRONG_PURPOSE_REDEEMER_TX,
      buildContext: context("wallet-withdraw")
    })
  );
});

test("binds remaining proposal builders to their exact STT redeemer", () => {
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
