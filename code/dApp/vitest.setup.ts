// Registers @testing-library/jest-dom's matchers on vitest's `expect` (runtime)
// and augments vitest's matcher types (this file is in the tsc program, so the
// `toBeInTheDocument()` etc. types resolve in *.test.tsx without extra config).
import "@testing-library/jest-dom/vitest";

// Unmount and clear the DOM after every test. vitest runs without `globals`, so
// @testing-library/react's automatic afterEach(cleanup) does not self-register, so
// without this, renders leak between tests and a later `queryByRole` can match
// an element left behind by an earlier test.
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import messages from "@/i18n/messages/en";
import type * as NextIntl from "next-intl";
import { defaultTimeZone, formats } from "@/i18n/config";

vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof NextIntl>();
  const translators = new Map<string, unknown>();
  const formatter = actual.createFormatter({
    locale: "en",
    timeZone: defaultTimeZone,
    formats
  });
  return {
    ...actual,
    useFormatter: () => formatter,
    useTranslations: (namespace?: string) => {
      const cacheKey = namespace ?? "";
      const cached = translators.get(cacheKey);
      if (cached) return cached;
      const translator = namespace
        ? actual.createTranslator({
            locale: "en",
            messages,
            namespace: namespace as keyof typeof messages
          })
        : actual.createTranslator({ locale: "en", messages });
      translators.set(cacheKey, translator);
      return translator;
    }
  };
});

vi.mock("next-intl/server", async () => {
  const actual = await vi.importActual<typeof NextIntl>("next-intl");
  return {
    getTranslations: async (namespace?: string) =>
      namespace
        ? actual.createTranslator({
            locale: "en",
            messages,
            namespace: namespace as keyof typeof messages
          })
        : actual.createTranslator({ locale: "en", messages })
  };
});

afterEach(cleanup);

// jsdom ships no ResizeObserver, and Radix's positioning layer calls it on mount. Without
// this stub every popover test throws before it reaches its first assertion.
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
