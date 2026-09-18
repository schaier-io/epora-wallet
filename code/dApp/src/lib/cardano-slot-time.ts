/**
 * Slot-to-time conversion for this app's network (preprod), independent of the
 * Mesh SDK. The workspace only ever converts preprod slots on the client
 * (`NETWORK` in lib/mesh/transactions/internals/constants is the constant
 * "preprod"), and pulling `slotToBeginUnixTime` from `@meshsdk/core` for two
 * lines of arithmetic put the SDK's multi-megabyte serialisation chunk on the
 * first-load path (see app/layout-mesh-boundary.test.ts). The config mirrors
 * `SLOT_CONFIG_NETWORK.preprod` from `@meshsdk/common` 1.9.1 byte for byte.
 */

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

/** Begin wall-clock time (ms) of `slot`, mirroring Mesh's `slotToBeginUnixTime`. */
export function slotToBeginUnixTime(slot: number, config: SlotConfig = SLOT_CONFIG_PREPROD): number {
  return config.zeroTime + (slot - config.zeroSlot) * config.slotLength;
}
