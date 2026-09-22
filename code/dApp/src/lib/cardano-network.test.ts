import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { parseCardanoNetwork, cardanoNetworkId } from "./cardano-network";

test("network configuration defaults safely and rejects unknown settings", () => {
  assert.equal(parseCardanoNetwork(undefined), "preprod");
  assert.equal(parseCardanoNetwork(" mainnet "), "mainnet");
  assert.equal(cardanoNetworkId("mainnet"), 1);
  assert.equal(cardanoNetworkId("preprod"), 0);
  assert.equal(cardanoNetworkId("preview"), 0);
  for (const invalid of ["production", "Mainnet", "1"]) {
    assert.throws(() => parseCardanoNetwork(invalid), /NEXT_PUBLIC_CARDANO_NETWORK/);
  }
});

for (const network of ["preprod", "mainnet", "preview"]) {
  test(`${network} deployment agrees across builders, cache, addresses, and timing`, () => {
    // Each process imports modules after setting the build-time configuration.
    execFileSync(process.execPath, ["--import", "tsx", "-e", `
      const assert = require('node:assert/strict');
      const { CARDANO_NETWORK, cardanoNetworkId } = require('./src/lib/cardano-network.ts');
      const { NETWORK } = require('./src/lib/mesh/transactions/internals/constants.ts');
      const { CHAIN_NETWORK } = require('./src/lib/query/keys.ts');
      const { STT_CACHE_NETWORK } = require('./src/lib/stt-cache/domain.ts');
      const { bech32Encode } = require('./src/lib/bech32.ts');
      const { paymentCredentialHash } = require('./src/lib/cardano-addresses.ts');
      const { CardanoAddressSchema } = require('./src/lib/api/tx-primitives.ts');
      const { assertServerWalletAddress } = require('./src/lib/mesh/server-wallet.ts');
      const { SLOT_CONFIG_NETWORK } = require('@meshsdk/common');
      const { slotToBeginUnixTime } = require('./src/lib/cardano-slot-time.ts');
      assert.equal(CARDANO_NETWORK, process.env.NEXT_PUBLIC_CARDANO_NETWORK);
      const id = cardanoNetworkId();
      const address = bech32Encode(id === 1 ? 'addr' : 'addr_test', Uint8Array.of(0x60 | id, ...new Uint8Array(28)));
      const mismatch = bech32Encode(id === 1 ? 'addr' : 'addr_test', Uint8Array.of(0x60 | (1 - id), ...new Uint8Array(28)));
      for (const configured of [NETWORK, CHAIN_NETWORK, STT_CACHE_NETWORK]) assert.equal(configured, CARDANO_NETWORK);
      assert.equal(paymentCredentialHash(address), '00'.repeat(28));
      assert.equal(CardanoAddressSchema.parse(address), address);
      assert.ok(CardanoAddressSchema.safeParse(CardanoAddressSchema.meta().example).success);
      assert.equal(assertServerWalletAddress(address), address);
      assert.equal(paymentCredentialHash(mismatch), null);
      assert.equal(CardanoAddressSchema.safeParse(mismatch).success, false);
      assert.throws(() => assertServerWalletAddress(mismatch));
      const config = SLOT_CONFIG_NETWORK[CARDANO_NETWORK];
      assert.equal(slotToBeginUnixTime(config.zeroSlot), config.zeroTime);
    `], { cwd: process.cwd(), env: { ...process.env, NEXT_PUBLIC_CARDANO_NETWORK: network }, stdio: "pipe" });
  });
}


test("Next configuration rejects invalid network names before a build starts", () => {
  assert.throws(() => execFileSync(process.execPath, ["--input-type=module", "-e", "await import('./next.config.mjs')"], {
    env: { ...process.env, NEXT_PUBLIC_CARDANO_NETWORK: "typo", SENTRY_AUTH_TOKEN: "" }, stdio: "pipe"
  }), /NEXT_PUBLIC_CARDANO_NETWORK must be/);
});
