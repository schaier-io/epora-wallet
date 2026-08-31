import type { AppLocale } from "@/i18n/config";

const messageLoaders = {
  en: () => import("@/i18n/messages/en")
} satisfies Record<AppLocale, () => Promise<{ default: unknown }>>;

export async function loadMessages(locale: AppLocale) {
  return (await messageLoaders[locale]()).default;
}
