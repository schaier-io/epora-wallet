import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import {
  pickMessageNamespaces,
  selectMessageNamespaces,
  type MessageCatalog,
  type MessageNamespace
} from "@/i18n/client-messages";

type ScopedClientProviderProps = {
  children: React.ReactNode;
  prefixes?: readonly string[];
  namespaces?: readonly MessageNamespace[];
};

export async function ScopedClientIntlProvider({
  children,
  prefixes = [],
  namespaces
}: ScopedClientProviderProps) {
  const catalog = (await getMessages()) as MessageCatalog;
  const selectedNamespaces = namespaces ?? selectMessageNamespaces(catalog, prefixes);
  const messages = pickMessageNamespaces(catalog, selectedNamespaces);

  return (
    <NextIntlClientProvider messages={messages as MessageCatalog}>
      {children}
    </NextIntlClientProvider>
  );
}
