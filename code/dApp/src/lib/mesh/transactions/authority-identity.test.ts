import { decodeRequiredSigners } from "@/lib/proposals/verify";
import assert from "node:assert/strict";
import test from "node:test";
import { pubKeyAddress, serializeAddressObj, type UTxO } from "@meshsdk/core";
import { deserializeTx, type CstTransactionOutput } from "@/lib/mesh/cst";
import { createAddressWalletSource } from "@/lib/mesh/server-wallet";
import { buildLockFundsTx } from "./lock-funds";
import { createFixtureFetcher, createFixtureWallet } from "../../../../scripts/entrypoint-budget-fixture-support";

const AUTHORITY_KEY = "11".repeat(28);
const AUTHORITY_ADDRESS = serializeAddressObj(pubKeyAddress(AUTHORITY_KEY), 0);
const CHANGE_ADDRESS = serializeAddressObj(pubKeyAddress("22".repeat(28)), 0);
const config = { walletPolicyId: "33".repeat(28), walletAssetNameHex: "01", sttAssetNameHex: "01" };
const input = { assets: [{ unit: "lovelace", quantity: "2000000" }] };
function fixture() {
  const funding: UTxO = { input: { txHash: "aa".repeat(32), outputIndex: 0 }, output: { address: AUTHORITY_ADDRESS, amount: [{ unit: "lovelace", quantity: "20000000" }] } };
  const collateral: UTxO = { input: { txHash: "bb".repeat(32), outputIndex: 0 }, output: { address: AUTHORITY_ADDRESS, amount: [{ unit: "lovelace", quantity: "7000000" }] } };
  return { wallet: { ...createFixtureWallet(funding, collateral), getChangeAddress: async () => CHANGE_ADDRESS }, fetcher: createFixtureFetcher([funding, collateral]) };
}

test("build uses the permission identity as signer while returning change to a different key", async () => {
  const { wallet, fetcher } = fixture();
  const built = await buildLockFundsTx(wallet, config, input, fetcher);
  const body = deserializeTx(built.txHex).body();
  assert.deepEqual(decodeRequiredSigners(built.txHex), [AUTHORITY_KEY]);
  assert.ok((body.outputs() as CstTransactionOutput[]).some(output => output.address().toBech32().toString() === CHANGE_ADDRESS));
  assert.equal(built.signerAddress, AUTHORITY_ADDRESS);
});

test("address-only server build retains the supplied address as authority", async () => {
  const { fetcher } = fixture();
  const built = await buildLockFundsTx(createAddressWalletSource(AUTHORITY_ADDRESS), config, input, fetcher);
  assert.deepEqual(decodeRequiredSigners(built.txHex), [AUTHORITY_KEY]);
  assert.equal(built.signerAddress, AUTHORITY_ADDRESS);
});

test("build rejects an identity API failure instead of switching to the change key", async () => {
  const { wallet, fetcher } = fixture();
  wallet.getUsedAddresses = async () => { throw new Error("account changed"); };
  await assert.rejects(buildLockFundsTx(wallet, config, input, fetcher), /account changed/);
});

test("build rejects a failed change-address read when no used or unused identity exists", async () => {
  const { wallet, fetcher } = fixture();
  wallet.getUsedAddresses = async () => [];
  wallet.getUnusedAddresses = async () => [];
  wallet.getChangeAddress = async () => { throw new Error("change address unavailable"); };
  await assert.rejects(buildLockFundsTx(wallet, config, input, fetcher), /change address unavailable/);
});
