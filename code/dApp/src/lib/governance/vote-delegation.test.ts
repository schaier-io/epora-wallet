import assert from "node:assert/strict";
import { test } from "node:test";
import { buildVoteDelegationJson, readVoteDelegationJson } from "@/lib/governance/vote-delegation";

const STAKE = "stake_test17rphkx6acpnf78fuvxn0mkew3l0fd058hzquvz7w36x4gtcljw6kf";
const DREP_ID = "drep1ygqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq7vlc9n";

test("a registered address only delegates", () => {
  assert.deepEqual(JSON.parse(buildVoteDelegationJson(STAKE, { kind: "drep", drepId: DREP_ID }, { registered: true })), {
    type: "VoteDelegation",
    stakeKeyAddress: STAKE,
    drep: { dRepId: DREP_ID }
  });
});

test("an unregistered address registers in the same certificate and locks the deposit", () => {
  // Mesh's `toCardanoCert` calls `BigInt(cert.coin)`, so a missing deposit throws at build time.
  assert.deepEqual(
    JSON.parse(buildVoteDelegationJson(STAKE, { kind: "alwaysAbstain" }, { registered: false, depositLovelace: 2_000_000 })),
    { type: "VoteRegistrationAndDelegation", stakeKeyAddress: STAKE, drep: { alwaysAbstain: null }, coin: 2_000_000 }
  );
});

test("reads back every choice the picker writes", () => {
  for (const choice of [
    { kind: "drep", drepId: DREP_ID },
    { kind: "alwaysAbstain" },
    { kind: "alwaysNoConfidence" }
  ] as const) {
    for (const registration of [{ registered: true }, { registered: false, depositLovelace: 2_000_000 }] as const) {
      assert.deepEqual(readVoteDelegationJson(buildVoteDelegationJson(STAKE, choice, registration)), {
        choice,
        registers: !registration.registered,
        stakeKeyAddress: STAKE
      });
    }
  }
});

test("does not read other certificates or broken payloads as a delegation", () => {
  assert.equal(readVoteDelegationJson("{}"), null);
  assert.equal(readVoteDelegationJson("not json"), null);
  assert.equal(readVoteDelegationJson(JSON.stringify({ type: "RegisterStake", stakeKeyAddress: STAKE })), null);
  assert.equal(readVoteDelegationJson(JSON.stringify({ type: "VoteDelegation", stakeKeyAddress: STAKE, drep: {} })), null);
  assert.equal(
    readVoteDelegationJson(JSON.stringify({ type: "VoteDelegation", stakeKeyAddress: STAKE, drep: { dRepId: "junk" } })),
    null
  );
  assert.equal(
    readVoteDelegationJson(JSON.stringify({ type: "VoteRegistrationAndDelegation", stakeKeyAddress: STAKE, drep: { alwaysAbstain: null } })),
    null
  );
});
