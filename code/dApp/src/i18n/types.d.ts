import type { AppLocale, formats } from "@/i18n/config";
import type messages from "@/i18n/messages/en";

declare module "next-intl" {
  interface AppConfig {
    Locale: AppLocale;
    Messages: typeof messages;
    Formats: typeof formats;
  }
}
