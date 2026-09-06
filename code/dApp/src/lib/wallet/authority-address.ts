import type { WalletSource } from "@/lib/mesh/tx-context";

/** Keep permission identity separate from the address receiving transaction change. */
export async function readWalletAuthorityAddress(
  wallet: Pick<WalletSource, "getUsedAddresses" | "getUnusedAddresses" | "getChangeAddress">
): Promise<string | null> {
  // A failed read can mean that the account changed. Do not select another key.
  const usedAddresses = await wallet.getUsedAddresses();
  if (usedAddresses[0]) return usedAddresses[0];
  const unusedAddresses = await wallet.getUnusedAddresses();
  if (unusedAddresses[0]) return unusedAddresses[0];
  return (await wallet.getChangeAddress()) || null;
}
