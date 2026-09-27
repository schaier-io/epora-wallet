import { fireEvent, render, screen } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { useState } from "react";
import { expect, it } from "vitest";
import { bech32Encode } from "@/lib/bech32";
import { CARDANO_NETWORK, cardanoNetworkId } from "@/lib/cardano-network";
import { resolvedWalletAddressesAtom } from "@/providers/wallet-address-book";
import { WalletHashesEditor } from "./asset-editors";

const PAYMENT_HASH = "aa".repeat(28);
const PAYMENT_BYTES = Array<number>(28).fill(0xaa);
const STAKE_BYTES = Array<number>(28).fill(0xbb);
const NETWORK_ID = cardanoNetworkId();
const ADDRESS_PREFIX = CARDANO_NETWORK === "mainnet" ? "addr" : "addr_test";

function address(type: number, extra: number[] = [], network = NETWORK_ID, prefix = ADDRESS_PREFIX) {
  return bech32Encode(prefix, Uint8Array.of((type << 4) | network, ...PAYMENT_BYTES, ...extra));
}

function SignerEditor() {
  const [wallets, setWallets] = useState([""]);
  return (
    <>
      <WalletHashesEditor label="Signing wallets" value={wallets} onChange={setWallets} />
      <output data-testid="wallets">{JSON.stringify(wallets)}</output>
    </>
  );
}

function pasteAddress(value: string) {
  const store = createStore();
  store.set(resolvedWalletAddressesAtom, {});
  render(<Provider store={store}><SignerEditor /></Provider>);
  const input = screen.getByLabelText("Signing wallets, wallet 1");
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
  return { input, store };
}

it.each([
  ["enterprise", address(7)],
  ["base with staking key", address(1, STAKE_BYTES)],
  ["base with staking script", address(3, STAKE_BYTES)],
  ["pointer", address(5, [1, 2, 3])]
])("rejects the %s script address as a signing wallet", (_kind, scriptAddress) => {
  const { input, store } = pasteAddress(scriptAddress);

  expect(screen.getByTestId("wallets")).toHaveTextContent(JSON.stringify([scriptAddress]));
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(store.get(resolvedWalletAddressesAtom)[PAYMENT_HASH]).toBeUndefined();
});

it.each([
  ["enterprise", address(6)],
  ["base", address(0, STAKE_BYTES)]
])("accepts an uppercase %s payment-key address", (_kind, keyAddress) => {
  const uppercase = keyAddress.toUpperCase();
  const { input, store } = pasteAddress(`  ${uppercase}  `);

  expect(screen.getByTestId("wallets")).toHaveTextContent(JSON.stringify([PAYMENT_HASH]));
  expect(input).not.toHaveAttribute("aria-invalid");
  expect(input).toHaveValue(uppercase);
  expect(store.get(resolvedWalletAddressesAtom)[PAYMENT_HASH]).toBe(uppercase);
});

it.each([
  ["mixed case", address(6).replace(/^addr/, "ADDR")],
  ["wrong network", address(6, [], NETWORK_ID === 0 ? 1 : 0, NETWORK_ID === 0 ? "addr" : "addr_test")],
  ["mismatched network byte", address(6, [], NETWORK_ID === 0 ? 1 : 0)]
])("keeps a %s address invalid", (_kind, invalidAddress) => {
  const { input, store } = pasteAddress(invalidAddress);

  expect(screen.getByTestId("wallets")).toHaveTextContent(JSON.stringify([invalidAddress]));
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(store.get(resolvedWalletAddressesAtom)[PAYMENT_HASH]).toBeUndefined();
});
