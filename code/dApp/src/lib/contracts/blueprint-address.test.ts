import assert from "node:assert/strict";
import test from "node:test";

import {
  getSttMintScript,
  resolveScriptAddress
} from "@/lib/contracts/blueprint";

test("resolveScriptAddress uses the requested Cardano network", () => {
  const script = getSttMintScript();

  assert.match(resolveScriptAddress(script, "preprod"), /^addr_test1/);
  assert.match(resolveScriptAddress(script, "preview"), /^addr_test1/);
  assert.match(resolveScriptAddress(script, "mainnet"), /^addr1/);
});
