import { atom } from "jotai";

export const transferRecipientModeAtom = atom("my-address");
export const transferCustomAddressAtom = atom("");
export const transferSelectedUnitAtom = atom("lovelace");
export const transferDisplayAmountAtom = atom("");

/** Reset every transfer form field to its default. */
export const resetTransferFormAtom = atom(null, (_get, set) => {
  set(transferRecipientModeAtom, "my-address");
  set(transferCustomAddressAtom, "");
  set(transferSelectedUnitAtom, "lovelace");
  set(transferDisplayAmountAtom, "");
});
