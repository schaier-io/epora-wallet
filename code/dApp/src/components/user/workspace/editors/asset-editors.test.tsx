import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StateAssetAmountListEditor, WalletHashesEditor } from "./asset-editors";

// The SDK's bech32 machinery throws under jsdom ("radix2.encode input should be
// Uint8Array"), so this file stands in a minimal BIP-173 codec for both building real
// addresses and backing the component's `deserializeAddress` import.
const bech32 = vi.hoisted(() => {
  const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

  function polymod(values: number[]): number {
    const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    let checksum = 1;
    for (const value of values) {
      const top = checksum >> 25;
      checksum = ((checksum & 0x1ffffff) << 5) ^ value;
      for (let i = 0; i < 5; i += 1) {
        if ((top >> i) & 1) {
          checksum ^= generators[i];
        }
      }
    }
    return checksum;
  }

  function hrpExpand(hrp: string): number[] {
    return [
      ...hrp.split("").map((char) => char.charCodeAt(0) >> 5),
      0,
      ...hrp.split("").map((char) => char.charCodeAt(0) & 31)
    ];
  }

  function to5Bit(bytes: number[]): number[] {
    const values: number[] = [];
    let accumulator = 0;
    let bits = 0;
    for (const byte of bytes) {
      accumulator = (accumulator << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        bits -= 5;
        values.push((accumulator >> bits) & 31);
      }
    }
    if (bits > 0) {
      values.push((accumulator << (5 - bits)) & 31);
    }
    return values;
  }

  function from5Bit(values: number[]): number[] {
    const bytes: number[] = [];
    let accumulator = 0;
    let bits = 0;
    for (const value of values) {
      accumulator = (accumulator << 5) | value;
      bits += 5;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((accumulator >> bits) & 0xff);
      }
    }
    return bytes;
  }

  return {
    /**
     * Enterprise address for `keyHashHex`. CIP-19: one header byte -- type 6 (enterprise,
     * key-hash payment credential) in the high nibble, network tag in the low one (0
     * testnet, 1 mainnet) -- followed by the 28-byte hash.
     */
    encode(keyHashHex: string, mainnet = false): string {
      const hrp = mainnet ? "addr" : "addr_test";
      const header = mainnet ? 0x61 : 0x60;
      const bytes = [
        header,
        ...(keyHashHex.match(/.{2}/g) ?? []).map((byte) => Number.parseInt(byte, 16))
      ];
      const data = to5Bit(bytes);
      const checksum = polymod([...hrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0]) ^ 1;
      const withChecksum = [...data];
      for (let i = 0; i < 6; i += 1) {
        withChecksum.push((checksum >> (5 * (5 - i))) & 31);
      }
      return `${hrp}1${withChecksum.map((value) => CHARSET[value]).join("")}`;
    },
    /** Checksum-verified decode, shaped like the mesh `deserializeAddress` return. */
    deserializeAddress(value: string): {
      pubKeyHash: string;
      scriptHash: string;
      stakeCredentialHash: string;
      stakeScriptCredentialHash: string;
    } {
      const separator = value.lastIndexOf("1");
      const hrp = value.slice(0, separator);
      const data = value
        .slice(separator + 1)
        .split("")
        .map((char) => CHARSET.indexOf(char));
      if (data.some((digit) => digit < 0)) {
        throw new Error("invalid bech32 character");
      }
      if (polymod([...hrpExpand(hrp), ...data]) !== 1) {
        throw new Error("invalid bech32 checksum");
      }
      const bytes = from5Bit(data.slice(0, -6));
      const credentialType = bytes[0] >> 4;
      if (credentialType !== 6 || bytes.length !== 29) {
        throw new Error("not an enterprise key-hash payment credential");
      }
      return {
        pubKeyHash: bytes
          .slice(1)
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join(""),
        scriptHash: "",
        stakeCredentialHash: "",
        stakeScriptCredentialHash: ""
      };
    }
  };
});

vi.mock("@meshsdk/core", () => ({
  deserializeAddress: bech32.deserializeAddress
}));

const VALID_WALLET = "ab".repeat(28);

describe("a list of token amounts", () => {
  /**
   * The same component renders "Daily limit" and "Left to spend" in the spender editor
   * (E2), so a row is not always a limit. Both buttons said it was.
   */
  it("does not call every row a limit", () => {
    render(
      <StateAssetAmountListEditor
        label="Left to spend"
        value={[{ policyId: "", assetName: "", amount: "0" }]}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Add a token" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Asset Limit/ })).not.toBeInTheDocument();
  });

  it("says how to enter an amount of ADA", () => {
    render(
      <StateAssetAmountListEditor
        label="Daily limit"
        value={[{ policyId: "", assetName: "", amount: "0" }]}
        onChange={vi.fn()}
      />
    );

    expect(
      screen.getByText(
        "Leave the two id boxes empty for ADA. Fill them in only for another Cardano token."
      )
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Token policy id")).toBeInTheDocument();
    expect(screen.getByLabelText("Token name (hex)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Policy ID")).not.toBeInTheDocument();
  });

  it("keeps a caller's own add label", () => {
    render(
      <StateAssetAmountListEditor
        label="Daily limit"
        value={[]}
        onChange={vi.fn()}
        addLabel="Add a daily limit"
      />
    );

    expect(screen.getByRole("button", { name: "Add a daily limit" })).toBeInTheDocument();
    expect(screen.getByText("Nothing added yet.")).toBeInTheDocument();
  });

  const TOKEN_UNIT = "ab".repeat(28) + "544f4b454e";

  it("picks a held asset from the wallet instead of typing hex", () => {
    const onChange = vi.fn();
    render(
      <StateAssetAmountListEditor
        label="Daily limit"
        value={[{ policyId: "", assetName: "", amount: "0" }]}
        onChange={onChange}
        availableAssets={[
          { unit: "lovelace", quantity: "10000000" },
          { unit: TOKEN_UNIT, quantity: "42" }
        ]}
      />
    );

    // The ADA row opens the picker preselected; the hex inputs are gone.
    expect(screen.queryByLabelText("Token policy id")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Asset" }));
    fireEvent.click(screen.getByRole("option", { name: /TOKEN/ }));

    expect(onChange).toHaveBeenCalledWith([
      { policyId: "ab".repeat(28), assetName: "544f4b454e", amount: "0" }
    ]);
  });

  it("falls back to the hex fields for an asset the wallet does not hold", () => {
    render(
      <StateAssetAmountListEditor
        label="Daily limit"
        value={[{ policyId: "cd".repeat(28), assetName: "0bc", amount: "1" }]}
        onChange={vi.fn()}
        availableAssets={[{ unit: "lovelace", quantity: "10000000" }]}
      />
    );

    // The row does not match a held asset, so the manual fields stay editable.
    expect(screen.getByLabelText("Token policy id")).toHaveValue("cd".repeat(28));
    expect(screen.getByLabelText("Token name (hex)")).toHaveValue("0bc");
    fireEvent.click(screen.getByRole("button", { name: "Asset" }));
    expect(screen.getByRole("option", { name: /^ADA/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Custom asset/ })).toBeInTheDocument();
  });
});

describe("a list of wallet ids", () => {
  function renderList(wallets: string[]) {
    const onChange = vi.fn();
    return {
      onChange,
      ...render(
        <WalletHashesEditor
          label="Wallets this person signs with"
          value={wallets}
          onChange={onChange}
        />
      )
    };
  }

  /**
   * The group `<Label>` carries no `htmlFor`, so every row's box was announced blank. Each
   * row now names itself.
   */
  it("gives every row a name of its own", () => {
    renderList(["", ""]);

    expect(
      screen.getByLabelText("Wallets this person signs with, wallet 1")
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Wallets this person signs with, wallet 2")
    ).toBeInTheDocument();
  });

  /**
   * `isCredentialHash` (`lib/contracts/payout-address.ts:22-28`) is the same check the
   * review rail applies, so the field and the receipt cannot disagree about what a wallet
   * id is. Before this, any string was accepted with no word until the receipt. The hint
   * also names the address route, because an address is what a user actually has to paste.
   */
  it("says at the field when an id cannot be a wallet id", () => {
    renderList(["abc"]);

    expect(
      screen.getByText(
        /Enter a Cardano address \(addr_test1…\) or a 56-character wallet id made of 0 to 9 and a to f\. This one has 3 characters\./
      )
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Wallets this person signs with, wallet 1")
    ).toHaveAttribute("aria-invalid", "true");
  });

  it("stores the wallet id when a Cardano address is pasted", () => {
    // Built by the local bech32 encoder, so the address carries a real checksum.
    const { onChange } = renderList([""]);

    fireEvent.change(
      screen.getByLabelText("Wallets this person signs with, wallet 1"),
      { target: { value: bech32.encode("ff".repeat(28)) } }
    );

    expect(onChange).toHaveBeenCalledWith(["ff".repeat(28)]);
  });

  /**
   * The address is what the reader recognises, so it leads the row; the payment key hash
   * drops to a small labelled line beneath it. It used to be the reverse: the row opened
   * with the opaque hash and the address hid underneath a "Address for this wallet id:"
   * caption.
   */
  it("leads with the address and demotes the wallet id", () => {
    const address = bech32.encode(VALID_WALLET);
    render(
      <WalletHashesEditor
        label="Wallets this person signs with"
        value={[VALID_WALLET]}
        onChange={vi.fn()}
        knownAddresses={{ [VALID_WALLET]: address }}
      />
    );

    const input = screen.getByLabelText("Wallets this person signs with, wallet 1");
    expect(input).toHaveValue(VALID_WALLET);
    expect(screen.getByText("Wallet id")).toBeInTheDocument();
    expect(screen.getByText(/^addr_test1/)).toBeInTheDocument();
    expect(screen.queryByText("Address for this wallet id:")).not.toBeInTheDocument();
  });

  /**
   * The message names the wrong network, not the character count — a mainnet address is
   * well-formed, just not usable here. Not converting is the point: the hash of a mainnet
   * address is still the wrong network's credential.
   */
  it("keeps a mainnet address rejected instead of converting it", () => {
    renderList([bech32.encode("ee".repeat(28), true)]);

    expect(screen.getByText(/mainnet/i)).toBeInTheDocument();
    expect(screen.queryByText(/56-character wallet id/)).not.toBeInTheDocument();
  });

  it("says nothing about a well-formed id", () => {
    renderList([VALID_WALLET]);

    expect(screen.queryByText(/A Cardano wallet id is 56 characters/)).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("Wallets this person signs with, wallet 1")
    ).not.toHaveAttribute("aria-invalid");
  });

  it("says nothing about a row the reader has not filled in yet", () => {
    renderList([""]);

    expect(screen.queryByText(/A Cardano wallet id is 56 characters/)).not.toBeInTheDocument();
  });

  it("still edits the row it was given", () => {
    const { onChange } = renderList(["", ""]);

    fireEvent.change(screen.getByLabelText("Wallets this person signs with, wallet 2"), {
      target: { value: VALID_WALLET }
    });

    expect(onChange).toHaveBeenCalledWith(["", VALID_WALLET]);
  });

  it("uses plain defaults for its empty state and its box", () => {
    renderList([]);

    expect(screen.getByText("No wallet added yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a wallet" })).toBeInTheDocument();
    expect(screen.queryByText("No wallet IDs added.")).not.toBeInTheDocument();
  });
});
