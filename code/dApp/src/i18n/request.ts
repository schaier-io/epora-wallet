import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import {
  defaultTimeZone,
  formats,
  localeCookieName,
  readPreferredLanguage,
  resolveAppLocale
} from "@/i18n/config";
import { loadMessages } from "@/i18n/load-messages";

export default getRequestConfig(async ({ requestLocale }) => {
  const [routeLocale, requestCookies, requestHeaders] = await Promise.all([
    requestLocale,
    cookies(),
    headers()
  ]);
  const locale = resolveAppLocale(
    routeLocale,
    requestCookies.get(localeCookieName)?.value,
    readPreferredLanguage(requestHeaders.get("accept-language"))
  );

  return {
    locale,
    messages: await loadMessages(locale),
    timeZone: defaultTimeZone,
    formats
  };
});
