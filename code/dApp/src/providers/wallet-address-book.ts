"use client";

import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

/**
 * Addresses the app has seen, keyed by the payment key hash a person's entry actually stores.
 * A person's "wallets this person signs with" holds the machine hash — the value the contract
 * compares — while the field keeps showing the human address. That pairing is learned here:
 * from the connected wallet on every connect and account switch, and from an address someone
 * pasted into a wallet field. Persisted, so the pairing survives reloads.
 */
export const resolvedWalletAddressesAtom = atomWithStorage<Record<string, string>>(
  "epora.walletAddressBook.v1",
  {}
);

/** Record `address` under the payment key hash it resolves to. Only payment addresses
 * teach something: for a stake address the hash meshsdk reports in `pubKeyHash` is the
 * staking credential, not what a person entry stores. A known pair is not rewritten.
 * The write is async because Mesh is loaded on demand: this module sits in the
 * root-layout graph, and a static value import would put the SDK's serialisation
 * chunk on every route (see app/layout-mesh-boundary.test.ts). */
export const rememberWalletAddressAtom = atom(null, async (_get, set, address: string) => {
  const trimmed = address.trim();
  // The HRP is everything before the first "1" in bech32; anything but a payment
  // address (stake, Byron-style base58, garbage) is skipped before deserializing.
  const hrp = trimmed.slice(0, trimmed.indexOf("1"));
  if (hrp !== "addr" && hrp !== "addr_test") return;
  try {
    const { deserializeAddress } = await import("@meshsdk/core");
    const hash = deserializeAddress(trimmed).pubKeyHash;
    if (!hash) return;
    const key = hash.toLowerCase();
    // First sighting wins: one payment key hash can wear several address encodings
    // (with or without a stake part), and churning the stored one makes the field
    // change appearance between connects for no benefit.
    set(resolvedWalletAddressesAtom, (current) =>
      key in current ? current : { ...current, [key]: trimmed }
    );
  } catch {
    // Not a decodable payment address: nothing learnable, and nothing to tell the user —
    // this runs on every identity read, not on an action they asked for.
  }
});
