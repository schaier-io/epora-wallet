import assert from "node:assert/strict";
import test from "node:test";
import { decodeEffect } from "./verify";

// The wallet-vote body from transaction-binding.test.ts: the wallet's script DRep
// (e9dcbf…cf98) votes Yes (`8201f6`) on governance action cc…cc#2.
const WALLET_VOTE_TX =
  "84a500d9010281825820aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa00018182581d60bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1a004c4b40021a00030d40031a055d4a8013a18203581ce9dcbf89a50c1d86f196cdb4f483d25fc0aaec071d29954516d0cf98a1825820cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc028201f6a105a282000082d8799fd8799fd87a80d87980ffff82010182040082d87a80820101f5f6";

test("reads the vote a co-signer is asked to sign from the body itself", () => {
  assert.deepEqual(decodeEffect(WALLET_VOTE_TX).votes, [
    {
      voterType: "dRepScriptHash",
      voterId: "drep1y05ae0uf55xpmph3jmxmfayr6f0up2hvquwjn929zmgvlxqdjsap6",
      actionTxHash: "cc".repeat(32),
      actionIndex: 2,
      vote: "Yes"
    }
  ]);
});

test("reads No and Abstain by their ledger codes", () => {
  assert.equal(decodeEffect(WALLET_VOTE_TX.replace("028201f6", "028200f6")).votes?.[0]?.vote, "No");
  assert.equal(decodeEffect(WALLET_VOTE_TX.replace("028201f6", "028202f6")).votes?.[0]?.vote, "Abstain");
});

test("finds no vote in a body that casts none", () => {
  const payout =
    "84a40081825820aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa00018182581d60bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1a004c4b40021a00030d40031a055d4a80a10581840000d87d9f80ff820101f5f6";
  assert.deepEqual(decodeEffect(payout).votes, []);
});
