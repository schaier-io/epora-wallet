const CREDENTIAL_HASH_PATTERN = /^[0-9a-fA-F]{56}$/;

export const noneData = { alternative: 1, fields: [] };
export const falseData = { alternative: 0, fields: [] };
export const trueData = { alternative: 1, fields: [] };

function assertCredentialHash(value, label) {
  if (!CREDENTIAL_HASH_PATTERN.test(value)) {
    throw new Error(`${label} must be a 28-byte Cardano credential hash.`);
  }
}

/**
 * Minimal valid State for a fresh admin-only wallet.
 *
 * Keep this helper pure and covered by off-chain tests. Lifecycle examples that
 * reconstructed mutable State by hand were removed because they silently
 * drifted from the validator schema and submitted invalid transactions.
 */
export function initialAdminState({ adminPaymentKeyHash, walletName = "Smart wallet" }) {
  assertCredentialHash(adminPaymentKeyHash, "Admin payment key hash");

  const adminUser = {
    alternative: 0,
    fields: [
      0,
      [adminPaymentKeyHash],
      [],
      [],
      0,
      falseData,
      noneData,
      trueData,
    ],
  };
  const accessControl = {
    alternative: 0,
    fields: [[adminUser], noneData, []],
  };
  const proofOfLife = {
    alternative: 0,
    fields: [noneData, noneData],
  };

  return {
    alternative: 0,
    fields: [
      accessControl,
      proofOfLife,
      [],
      Buffer.from(walletName, "utf8").toString("hex"),
      noneData,
      noneData,
    ],
  };
}
