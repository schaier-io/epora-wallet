import assert from "node:assert/strict";
import test from "node:test";

import { countWalletEntries } from "@/lib/contracts/wallet-capacity";

test("countWalletEntries counts entries across records", () => {
  assert.equal(
    countWalletEntries([
      { wallets: ["a", "b"] },
      { wallets: [] },
      { wallets: ["c"] }
    ]),
    3
  );
});
