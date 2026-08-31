import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ServerWalletAddressError,
  assertServerWalletAddress,
  createAddressWalletSource
} from "@/lib/mesh/server-wallet";

// A real preprod base address (the fixture the transaction tests already use).
const PREPROD_ADDRESS =
  "addr_test1qra89xrexu3vq28g5glatk44s96mysv345rvxsve4x5uh9vvmn2lu5e2ma4eavm9sx3jk5unu0n8vl93k0h3lcqkauwqpcpttu";

describe("assertServerWalletAddress", () => {
  it("accepts a preprod address and trims surrounding whitespace", () => {
    assert.equal(assertServerWalletAddress(`  ${PREPROD_ADDRESS}\n`), PREPROD_ADDRESS);
  });

  it("rejects an empty address", () => {
    assert.throws(() => assertServerWalletAddress("   "), ServerWalletAddressError);
  });

  it("rejects a mainnet address on the network prefix, before any bech32 decode", () => {
    assert.throws(
      () => assertServerWalletAddress(`addr1${PREPROD_ADDRESS.slice("addr_test1".length)}`),
      (error: unknown) =>
        error instanceof ServerWalletAddressError && /not a preprod address/.test(error.message)
    );
  });

  it("rejects a preprod-prefixed string that is not valid bech32", () => {
    assert.throws(
      () => assertServerWalletAddress("addr_test1qpnotarealaddress00000000000000000000"),
      (error: unknown) =>
        error instanceof ServerWalletAddressError && /not a valid Cardano address/.test(error.message)
    );
  });
});

describe("createAddressWalletSource", () => {
  it("validates the address up front, so a bad request costs no provider call", () => {
    assert.throws(() => createAddressWalletSource("addr1nope"), ServerWalletAddressError);
  });

  it("reports no wallet UTxOs, which hands resolution to the address fallback", async () => {
    const wallet = createAddressWalletSource(PREPROD_ADDRESS);
    assert.deepEqual(await wallet.getUtxos(), []);
  });

  it("offers exactly one distinct fallback address", async () => {
    const wallet = createAddressWalletSource(PREPROD_ADDRESS);
    const candidates = new Set([
      await wallet.getChangeAddress(),
      ...(await wallet.getUsedAddresses()),
      ...(await wallet.getUnusedAddresses())
    ]);

    assert.deepEqual([...candidates], [PREPROD_ADDRESS]);
  });
});
