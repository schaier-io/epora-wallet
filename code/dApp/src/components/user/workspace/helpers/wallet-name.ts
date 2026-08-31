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

  for (let index = 2; index < 100; index += 1) {
    const candidate = `${DEFAULT_WALLET_NAME} ${index}`;
    if (
      walletNameByteLength(candidate) <= MAX_WALLET_NAME_BYTES &&
      !walletNameAlreadyExists(candidate, existingNames)
    ) {
      return candidate;
    }
  }

  return clampWalletNameInput(`${DEFAULT_WALLET_NAME} ${existingNames.length + 1}`);
}
