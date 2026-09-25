import { CARDANO_NETWORK, type CardanoNetwork } from "./cardano-network";
// Local conversion keeps the Mesh serialization bundle off the client entrypoint.
// Tests compare each network's parameters and conversion with the installed SDK.

/** Shelley-era slot parameters: a transaction in `zeroSlot` begins at `zeroTime`. */
export type SlotConfig = {
  zeroTime: number;
  zeroSlot: number;
  slotLength: number;
};

/** Mirrors `SLOT_CONFIG_NETWORK.preprod` (@meshsdk/common): 16540416e5 + 1728e6 ms epoch. */
export const SLOT_CONFIG_PREPROD: SlotConfig = {
  zeroTime: 1_655_769_600_000,
  zeroSlot: 86_400,
  slotLength: 1_000
};

// Parameters pinned against @meshsdk/common in cardano-slot-time.test.ts.
export const SLOT_CONFIG_BY_NETWORK: Record<CardanoNetwork, SlotConfig> = {
  preprod: SLOT_CONFIG_PREPROD,
  preview: { zeroTime: 1_666_656_000_000, zeroSlot: 0, slotLength: 1_000 },
  mainnet: { zeroTime: 1_596_059_091_000, zeroSlot: 4_492_800, slotLength: 1_000 }
};

/** Begin wall-clock time (ms) of `slot`, mirroring Mesh's `slotToBeginUnixTime`. */
export function slotToBeginUnixTime(slot: number, config: SlotConfig = SLOT_CONFIG_BY_NETWORK[CARDANO_NETWORK]): number {
  return config.zeroTime + (slot - config.zeroSlot) * config.slotLength;
}
