import assert from "node:assert/strict";
import test from "node:test";
import { SLOT_CONFIG_NETWORK, slotToBeginUnixTime as meshSlotToBeginUnixTime } from "@meshsdk/core";
import { SLOT_CONFIG_PREPROD, slotToBeginUnixTime } from "./cardano-slot-time";

// Vectors generated from `@meshsdk/core` 1.9.1 (`slotToBeginUnixTime(slot, SLOT_CONFIG_NETWORK.preprod)`)
// so the local copy provably mirrors the SDK helper it replaced.
test("preprod slot conversion matches the Mesh helper on generated vectors", () => {
  assert.equal(slotToBeginUnixTime(100), 1_655_683_300_000);
  assert.equal(slotToBeginUnixTime(SLOT_CONFIG_PREPROD.zeroSlot), 1_655_769_600_000);
  assert.equal(slotToBeginUnixTime(518_400_000), 2_174_083_200_000);
});

test("preprod config and conversion agree with the Mesh SDK across a slot sweep", () => {
  for (const slot of [0, 86_399, 86_400, 86_401, 12_345_678, 518_400_000]) {
    assert.equal(
      slotToBeginUnixTime(slot),
      meshSlotToBeginUnixTime(slot, SLOT_CONFIG_NETWORK.preprod)
    );
  }
});
