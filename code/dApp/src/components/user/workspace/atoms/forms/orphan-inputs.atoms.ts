import { atom } from "jotai";
import type { DiscoveredUtxo } from "@/lib/discovery/types";

// These outputs belong to the user's recovery draft. They are not address balances.
export const selectedOrphanInputsAtom = atom<{
  walletUnit: string;
  signerAddress: string | null;
  outputs: DiscoveredUtxo[];
} | null>(null);
