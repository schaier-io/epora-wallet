import { createFormatter, createTranslator, type AbstractIntlMessages } from "next-intl";
import { defaultLocale, defaultTimeZone, formats } from "@/i18n/config";

/**
 * Default-locale translator for pure domain catalogs built outside React.
 * Interactive components should use `useTranslations`; server entry points
 * should use `getTranslations`. The catalog generator blocks extra locales
 * while any static translator remains, preventing a partially localized UI.
 */
export function createDefaultTranslator<
  const Namespace extends string,
  const NamespaceMessages extends AbstractIntlMessages
>(
  _namespace: Namespace,
  namespaceMessages: NamespaceMessages
) {
  return createTranslator({
    locale: defaultLocale,
    messages: namespaceMessages
  });
}

/** Default-locale formatter for pure helpers that run outside React. */
export const defaultFormatter = createFormatter({
  locale: defaultLocale,
  timeZone: defaultTimeZone,
  formats
});
