import { fireEvent, render, screen } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { expect, it, vi } from "vitest";
import type * as CardanoNetworkModule from "@/lib/cardano-network";
import { bech32Encode } from "@/lib/bech32";

vi.mock("@/lib/cardano-network", async (importOriginal) => ({
  ...await importOriginal<typeof CardanoNetworkModule>(),
  CARDANO_NETWORK: "mainnet",
  cardanoNetworkId: (network = "mainnet") => network === "mainnet" ? 1 : 0
}));

import { WalletHashesEditor } from "./asset-editors";

it("converts a mainnet address to its credential and rejects a testnet address", () => {
  const onChange = vi.fn();
  const hash = "ab".repeat(28);
  const mainnet = bech32Encode("addr", Uint8Array.of(0x61, ...Buffer.from(hash, "hex")));
  const testnet = bech32Encode("addr_test", Uint8Array.of(0x60, ...Buffer.from(hash, "hex")));
  render(<Provider store={createStore()}><WalletHashesEditor label="Wallets" value={[""]} onChange={onChange} /></Provider>);
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: mainnet } });
  expect(onChange).toHaveBeenLastCalledWith([hash]);
  fireEvent.change(input, { target: { value: testnet } });
  expect(onChange).toHaveBeenLastCalledWith([testnet]);
});
