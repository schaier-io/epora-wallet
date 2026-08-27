import assert from "node:assert/strict";
import test from "node:test";
import {
  composeWalletReceiveAddress,
  decodePayoutAddressFromData,
  describeAddressProblem,
  encodePayoutAddressToData,
  isAddressData
} from "@/lib/contracts/payout-address";

// A real preprod base address (payment + stake credential), network id 0.
const BASE_ADDRESS =
  "addr_test1qra89xrexu3vq28g5glatk44s96mysv345rvxsve4x5uh9vvmn2lu5e2ma4eavm9sx3jk5unu0n8vl93k0h3lcqkauwqpcpttu";
const BASE_PAYMENT_HASH = "fa7298793722c028e8a23fd5dab58175b24191ad06c34199a9a9cb95";
const HASH_A = "aa".repeat(28);
const HASH_B = "bb".repeat(28);

// A structurally valid enterprise (no-stake) Address datum built by hand.
const enterpriseAddressData = {
  alternative: 0,
  fields: [
    { alternative: 0, fields: [BASE_PAYMENT_HASH] }, // VerificationKey credential
    { alternative: 1, fields: [] } // stake: None
  ]
};

test("encodePayoutAddressToData produces a structurally valid Address datum", () => {
  const encoded = encodePayoutAddressToData(BASE_ADDRESS);
  assert.equal(isAddressData(encoded), true);
  assert.equal(encoded.alternative, 0);
  assert.equal(encoded.fields.length, 2);
  // payment credential is VerificationKey(hash)
  const payment = encoded.fields[0] as { alternative: number; fields: string[] };
  assert.equal(payment.alternative, 0);
  assert.equal(payment.fields[0], BASE_PAYMENT_HASH);
});

test("encode -> decode round-trips a base address byte-for-byte", () => {
  const encoded = encodePayoutAddressToData(BASE_ADDRESS);
  assert.equal(decodePayoutAddressFromData(encoded), BASE_ADDRESS);
});

test("encodePayoutAddressToData rejects empty / whitespace input", () => {
  assert.throws(() => encodePayoutAddressToData("   "), /valid Cardano payment address/);
  assert.throws(() => encodePayoutAddressToData(""), /valid Cardano payment address/);
});

test("encodePayoutAddressToData rejects a non-address string with a labelled error", () => {
  assert.throws(
    () => encodePayoutAddressToData("not-an-address", "Recipient"),
    /Recipient: enter a valid Cardano payment address/
  );
});

test("decodePayoutAddressFromData passes a plain string through unchanged", () => {
  // Backward compatibility with datums written before payout addresses were structured.
  assert.equal(decodePayoutAddressFromData(BASE_ADDRESS), BASE_ADDRESS);
});

test("decodePayoutAddressFromData returns '' for non-address values", () => {
  assert.equal(decodePayoutAddressFromData({ alternative: 5, fields: [] }), "");
  assert.equal(decodePayoutAddressFromData(42), "");
  assert.equal(decodePayoutAddressFromData(undefined), "");
  assert.equal(decodePayoutAddressFromData({ alternative: 0, fields: [] }), "");
});

test("isAddressData accepts an enterprise (None-stake) address", () => {
  assert.equal(isAddressData(enterpriseAddressData), true);
});

test("isAddressData rejects malformed shapes", () => {
  assert.equal(isAddressData("addr_test1..."), false);
  assert.equal(isAddressData(null), false);
  // wrong outer alternative
  assert.equal(isAddressData({ alternative: 1, fields: enterpriseAddressData.fields }), false);
  // wrong field count
  assert.equal(isAddressData({ alternative: 0, fields: [enterpriseAddressData.fields[0]] }), false);
  // bad payment credential (empty hash)
  assert.equal(
    isAddressData({
      alternative: 0,
      fields: [{ alternative: 0, fields: [""] }, { alternative: 1, fields: [] }]
    }),
    false
  );
  // credential hashes are fixed-width ledger hashes, not arbitrary bytes
  assert.equal(
    isAddressData({
      alternative: 0,
      fields: [{ alternative: 0, fields: ["aa"] }, { alternative: 1, fields: [] }]
    }),
    false
  );
  // stake None must carry zero fields
  assert.equal(
    isAddressData({
      alternative: 0,
      fields: [enterpriseAddressData.fields[0], { alternative: 1, fields: ["x"] }]
    }),
    false
  );
  // stake Some must carry exactly one field
  assert.equal(
    isAddressData({
      alternative: 0,
      fields: [enterpriseAddressData.fields[0], { alternative: 0, fields: [] }]
    }),
    false
  );
  // Conway-era outputs cannot use pointer stake credentials.
  assert.equal(
    isAddressData({
      alternative: 0,
      fields: [
        enterpriseAddressData.fields[0],
        { alternative: 0, fields: [{ alternative: 1, fields: [1, 0, 0] }] }
      ]
    }),
    false
  );
});

test("composeWalletReceiveAddress returns the enterprise address for a None credential", () => {
  const none = { alternative: 1, fields: [] };
  const address = composeWalletReceiveAddress(HASH_A, none);
  assert.ok(address);
  assert.match(address as string, /^addr_test1/);
});

test("composeWalletReceiveAddress folds in a Some(intended stake credential)", () => {
  const none = { alternative: 1, fields: [] };
  const someVkey = { alternative: 0, fields: [{ alternative: 0, fields: [HASH_B] }] };
  const enterprise = composeWalletReceiveAddress(HASH_A, none);
  const withStake = composeWalletReceiveAddress(HASH_A, someVkey);
  assert.ok(withStake);
  assert.match(withStake as string, /^addr_test1/);
  // Adding a stake credential must change the receive address.
  assert.notEqual(withStake, enterprise);
});

test("composeWalletReceiveAddress returns null on an unusable payment script hash", () => {
  assert.equal(composeWalletReceiveAddress("nothex", { alternative: 1, fields: [] }), null);
});

test("composeWalletReceiveAddress rejects a malformed intended stake credential", () => {
  const malformedSome = { alternative: 0, fields: [{ alternative: 9, fields: [] }] };
  assert.equal(composeWalletReceiveAddress(HASH_A, malformedSome), null);
});

test("describeAddressProblem accepts a well-formed preprod address", () => {
  assert.equal(describeAddressProblem(BASE_ADDRESS), null);
  assert.equal(describeAddressProblem(`  ${BASE_ADDRESS}  `), null);
});

test("describeAddressProblem asks for an address when the field is empty", () => {
  assert.match(describeAddressProblem("")!, /Enter the address/);
  assert.match(describeAddressProblem("   ")!, /Enter the address/);
});

test("describeAddressProblem names the network for a mainnet address", () => {
  assert.match(describeAddressProblem("addr1qxy2k")!, /mainnet/);
  assert.match(describeAddressProblem("stake1uxy2k")!, /mainnet/);
});

test("describeAddressProblem never leaks the bech32 library's own wording", () => {
  // The underlying error is `Unknown letter: "_". Allowed: qpzry9x8gf2tvdw0s3jn54khce6mua7l`,
  // which is what the send form used to be capable of showing a user.
  const message = describeAddressProblem("addr_test1_not_a_real_address_zzz")!;
  assert.match(message, /not a valid Cardano address/);
  assert.doesNotMatch(message, /Unknown letter|qpzry9x8gf2tv|checksum/i);
});

test("describeAddressProblem rejects junk that is not bech32 at all", () => {
  assert.match(describeAddressProblem("nonsense")!, /not a valid Cardano address/);
});

test("describeAddressProblem agrees with encodePayoutAddressToData", () => {
  // Anything this accepts must encode, or the user is told a value is fine and then it
  // fails at serialize time, the split that made the original defect invisible.
  assert.equal(describeAddressProblem(BASE_ADDRESS), null);
  assert.ok(encodePayoutAddressToData(BASE_ADDRESS));
});
