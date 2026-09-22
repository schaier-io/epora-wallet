import assert from "node:assert/strict";
import test from "node:test";
import { buildVoteJson, extractGovernanceActionId, readVoteJson } from "./vote-json";

const TX_HASH = "0ecc74fe26532cec1ab9a299f082afc436afc888ca2dc0fc6acda431c52dc60d";
const DREP_ID = "drep1y05ae0uf55xpmph3jmxmfayr6f0up2hvquwjn929zmgvlxqdjsap6";

test("builds the Mesh VoteType the builder reads, and reads it back", () => {
  const json = buildVoteJson(DREP_ID, { txHash: TX_HASH, txIndex: 3, voteKind: "Abstain" });

  assert.deepEqual(JSON.parse(json), {
    voter: { type: "DRep", drepId: DREP_ID },
    govActionId: { txHash: TX_HASH, txIndex: 3 },
    votingProcedure: { voteKind: "Abstain" }
  });
  assert.deepEqual(readVoteJson(json), { txHash: TX_HASH, txIndex: 3, voteKind: "Abstain", drepId: DREP_ID });
});

test("reads no vote from an incomplete or malformed payload", () => {
  assert.equal(readVoteJson("{}"), null);
  assert.equal(readVoteJson("not json"), null);
  assert.equal(
    readVoteJson(JSON.stringify({ govActionId: { txHash: "", txIndex: 0 }, votingProcedure: { voteKind: "Yes" } })),
    null
  );
  assert.equal(
    readVoteJson(JSON.stringify({ govActionId: { txHash: TX_HASH, txIndex: 0 }, votingProcedure: { voteKind: "yes" } })),
    null
  );
});

test("finds the action id in a bare id, a tx reference, or an explorer link", () => {
  const bech32 = "gov_action1zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygsq6dmejn";
  assert.equal(extractGovernanceActionId(`  ${bech32} `), bech32);
  assert.equal(extractGovernanceActionId(`https://explorer.example/governance/${bech32}?tab=votes`), bech32);
  assert.equal(extractGovernanceActionId(`${TX_HASH.toUpperCase()}#02`), `${TX_HASH}#2`);
  assert.equal(extractGovernanceActionId(`https://explorer.example/action/${TX_HASH}%230`), `${TX_HASH}#0`);
  assert.equal(
    extractGovernanceActionId(`https://preprod.adastat.net/governances/${TX_HASH}0a`),
    `${TX_HASH}#10`
  );
  // A bare tx hash names no action, and 66 hex characters inside a longer run is not an id.
  assert.equal(extractGovernanceActionId(TX_HASH), null);
  assert.equal(extractGovernanceActionId(`${TX_HASH}0a0b`), null);
  assert.equal(extractGovernanceActionId("drep1abc"), null);
});
