import { deserializeAddress } from "@meshsdk/core";

const PAYMENT_KEY_HASH = /^[0-9a-f]{56}$/i;

// The keys a transaction lists as required signers besides the builder's own
// key. Rejects anything that is not a payment key hash so a stored build
// context cannot smuggle garbage into the body, and drops repeats (the body's
// `required_signers` is a set; the builder's own key is always listed already).
export function resolveExtraRequiredSignerKeyHashes(
  ownKeyHash: string,
  requested: readonly string[] | undefined
): string[] {
  const seen = new Set<string>([ownKeyHash.trim().toLowerCase()]);
  const keyHashes: string[] = [];
  for (const raw of requested ?? []) {
    const keyHash = raw.trim().toLowerCase();
    if (!PAYMENT_KEY_HASH.test(keyHash)) {
      throw new Error(`Required signer "${raw}" is not a payment key hash.`);
    }
    if (seen.has(keyHash)) {
      continue;
    }
    seen.add(keyHash);
    keyHashes.push(keyHash);
  }
  return keyHashes;
}

export function addExtraRequiredSigners(
  tx: { txBuilder: { requiredSignerHash: (keyHash: string) => unknown } },
  changeAddress: string,
  requested: readonly string[] | undefined
): string[] {
  const ownKeyHash = deserializeAddress(changeAddress).pubKeyHash;
  const keyHashes = resolveExtraRequiredSignerKeyHashes(ownKeyHash, requested);
  for (const keyHash of keyHashes) {
    tx.txBuilder.requiredSignerHash(keyHash);
  }
  return keyHashes;
}
