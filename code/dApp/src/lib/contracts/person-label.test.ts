import { test } from "node:test";
import assert from "node:assert/strict";
import { personLabel } from "./person-label";

const HASH_A = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c";
const HASH_B = "ffeeddccbbaa99887766554433221100ffeeddccbbaa998877665544";

test("uses the first wallet ID, middle-truncated", () => {
  assert.equal(
    personLabel("Owner", { id: "0", wallets: [HASH_A] }),
    "Owner · a1b2c3d4...3a4b5c"
  );
});

test("falls back to the stable id when no wallet ID is set yet", () => {
  assert.equal(personLabel("Owner", { id: "3", wallets: [] }), "Owner #3");
  assert.equal(personLabel("Recovery contact", { id: "0", wallets: [] }), "Recovery contact #0");
});

test("blank wallet entries do not count as an identity", () => {
  assert.equal(personLabel("Spender", { id: "7", wallets: ["", "   "] }), "Spender #7");
  assert.equal(
    personLabel("Spender", { id: "7", wallets: ["  ", HASH_B] }),
    "Spender · ffeeddcc...665544"
  );
});

test("the label does not move when a person above is removed", () => {
  const people = [
    { id: "0", wallets: [HASH_A] },
    { id: "1", wallets: [HASH_B] }
  ];
  const before = people.map((person) => personLabel("Owner", person));
  const after = people.slice(1).map((person) => personLabel("Owner", person));

  assert.equal(after[0], before[1]);
});
