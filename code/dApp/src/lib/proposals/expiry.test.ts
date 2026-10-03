import assert from "node:assert/strict";
import test from "node:test";
import { SLOT_CONFIG_NETWORK } from "@meshsdk/core";
import { NETWORK } from "@/lib/mesh/transactions/internals/constants";
import { proposalExpiry } from "./expiry";
const TX = "84a40081825820aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa00018182581d60bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1a004c4b40021a00030d40031a055d4a80a0f5f6";
test("reads expiry from the transaction body using the installed network slot config", () => {
  const config = SLOT_CONFIG_NETWORK[NETWORK];
  assert.equal(proposalExpiry(TX), config.zeroTime + (90000000 - config.zeroSlot) * config.slotLength);
});
test("does not show an expiry for malformed bytes or an unsafe slot", () => {
  assert.equal(proposalExpiry("80"), null);
  assert.equal(proposalExpiry(TX.replace("1a055d4a80", "1bffffffffffffffff")), null);
});
