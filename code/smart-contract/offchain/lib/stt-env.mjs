const HEX = /^[0-9a-f]+$/i;

function requireHexEnv(name, value, length) {
  if (typeof value !== "string" || value.length !== length || !HEX.test(value)) {
    throw new Error(`${name} must be exactly ${length} hexadecimal characters.`);
  }
  return value.toLowerCase();
}

export function sttIdentifiersFromEnv(env = process.env) {
  return {
    sttPolicyId: requireHexEnv("STT_POLICY_ID", env.STT_POLICY_ID, 56),
    sttAssetName: requireHexEnv("STT_ASSET_NAME", env.STT_ASSET_NAME, 64),
  };
}
