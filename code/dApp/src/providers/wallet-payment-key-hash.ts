/** Resolve a payment key hash without loading Mesh into the root client chunk. */
export async function resolveWalletPaymentKeyHash(address: string): Promise<string> {
  const { resolvePaymentKeyHash } = await import("@meshsdk/core");
  return resolvePaymentKeyHash(address);
}
