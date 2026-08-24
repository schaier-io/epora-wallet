import { atom } from "jotai";

// Empty, not "my-address". Pre-selecting the connected wallet's own address made
// "withdraw shared funds into my personal wallet" the path of least resistance on a wallet
// with several owners: type an amount, Add payout, Send funds, and the recipient control is
// never touched. The user now names the destination before a payout can be staged.
export const transferRecipientModeAtom = atom("");
export const transferCustomAddressAtom = atom("");
export const transferSelectedUnitAtom = atom("lovelace");
export const transferDisplayAmountAtom = atom("");

/** Reset every transfer form field to its default. */
export const resetTransferFormAtom = atom(null, (_get, set) => {
  set(transferRecipientModeAtom, "");
  set(transferCustomAddressAtom, "");
  set(transferSelectedUnitAtom, "lovelace");
  set(transferDisplayAmountAtom, "");
});
