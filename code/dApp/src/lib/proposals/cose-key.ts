import * as crypto from "@harmoniclabs/crypto";
import { getPublicKeyFromCoseKey } from "@/lib/mesh/cst";

// The payment key hash (blake2b-224 of the Ed25519 public key) carried by a
// CIP-8 COSE_Key, as returned by `wallet.signData`. Sign-in has to bind the
// session identity to THIS key. Mesh's `checkSignature` proves the signature is
// valid for the key, but for a base address it also accepts a key that matches
// the address's stake credential, and the server derives the session from the
// payment credential, so an attacker could pair a victim's payment hash with
// their own stake key and sign in as the victim. Returns null for anything that
// does not parse as a COSE_Key holding a 32-byte key.
export function paymentKeyHashFromCoseKey(coseKeyHex: string): string | null {
  try {
    const publicKey = getPublicKeyFromCoseKey(coseKeyHex.trim());
    if (publicKey.length !== 32) {
      return null;
    }
    return Buffer.from(crypto.blake2b_224(publicKey)).toString("hex");
  } catch {
    return null;
  }
}
