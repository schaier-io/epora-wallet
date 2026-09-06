import { DEFAULT_WALLET_NAME, MAX_WALLET_NAME_BYTES, clampWalletNameInput, normalizeWalletName, walletNameByteLength } from "@/lib/contracts/state-wallet-name";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/ComponentsUserWorkspaceHelpersWalletName.json";

const i18n = createDefaultTranslator("ComponentsUserWorkspaceHelpersWalletName", defaultMessages);

function walletNameKey(value: string) {
  return normalizeWalletName(value).trim().toLowerCase();
}

export function walletNameAlreadyExists(value: string, existingNames: string[]) {
  const key = walletNameKey(value);
  return existingNames.some((name) => walletNameKey(name) === key);
}

export function formatDraftWalletName(value: string) {
  return value.trim() ? normalizeWalletName(value) : i18n("nameNeeded");
}

export function suggestNewWalletName(existingNames: string[]) {
  if (!walletNameAlreadyExists(DEFAULT_WALLET_NAME, existingNames)) {
    return DEFAULT_WALLET_NAME;
  }

  // Scanning as far as `length + 2` is enough by pigeonhole: that range offers one
  // more candidate than there are existing names, so at least one must be free.
  // The bound used to be a bare `100`, and the fallback past it returned
  // `length + 1` WITHOUT the `walletNameAlreadyExists` check every other candidate
  // had to pass, so it could hand back a name already in use. The smallest witness is
  // 100 taken names: the base plus `Smart wallet 2..99` is 99, and returns the free
  // `Smart wallet 100`; add `Smart wallet 101` and the fallback returns that one.
  const lastIndex = existingNames.length + 2;
  for (let index = 2; index <= lastIndex; index += 1) {
    const candidate = `${DEFAULT_WALLET_NAME} ${index}`;
    if (
      walletNameByteLength(candidate) <= MAX_WALLET_NAME_BYTES &&
      !walletNameAlreadyExists(candidate, existingNames)
    ) {
      return candidate;
    }
  }

  // Unreachable. The range holds one more candidate than there are existing names, so at
  // least one is free by name, and the loop can only pass that one over if it overflows the
  // 32-byte datum field. "Smart wallet " is 13 bytes, so overflowing takes a 20-digit number,
  // which needs the count to reach 10^19. The clamp is here to give the function a return,
  // not to handle a case.
  return clampWalletNameInput(`${DEFAULT_WALLET_NAME} ${lastIndex}`);
}
