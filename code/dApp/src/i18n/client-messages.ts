import type messages from "@/i18n/messages/en";

export type MessageCatalog = typeof messages;
export type MessageNamespace = keyof MessageCatalog;

export const ROOT_CLIENT_NAMESPACES = [
  "Counts",
  "AppLoading",
  "AppNotFound",
  "ComponentsErrorBoundary",
  "ComponentsLayoutBetaNotice",
  "ComponentsLayoutRiskDisclaimerGate",
  "ComponentsLayoutShortcutsHelp",
  "ComponentsLayoutSiteFooter",
  "ComponentsLayoutSparkleEasterEgg",
  "ComponentsLayoutTopNav",
  "ComponentsLayoutWalletConnectErrorBridge",
  "ComponentsLayoutWalletConnectSection",
  "ComponentsLayoutWalletPanel",
  "ComponentsLayoutWalletconnectQr",
  "ComponentsProfileCard",
  "ComponentsUiCopyButton",
  "ComponentsUiInfoHint",
  "ComponentsUiPopupDialog",
  "ComponentsUserWalletMembershipCard",
  "ComponentsUserWalletSessionProfileCard",
  "ProvidersToastProvider",
  "ProvidersWalletProvider",
  "ProvidersWalletconnectProvider"
] as const satisfies readonly MessageNamespace[];

export function pickMessageNamespaces(
  catalog: MessageCatalog,
  namespaces: readonly MessageNamespace[]
) {
  return Object.fromEntries(
    namespaces.map((namespace) => [namespace, catalog[namespace]])
  ) as Partial<MessageCatalog>;
}

export function selectMessageNamespaces(
  catalog: MessageCatalog,
  prefixes: readonly string[],
  included: readonly MessageNamespace[] = ROOT_CLIENT_NAMESPACES
) {
  const selected = new Set<MessageNamespace>(included);
  for (const namespace of Object.keys(catalog) as MessageNamespace[]) {
    if (prefixes.some((prefix) => namespace.startsWith(prefix))) {
      selected.add(namespace);
    }
  }
  return [...selected];
}
