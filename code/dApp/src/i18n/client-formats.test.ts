import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { defaultLocale, defaultTimeZone, formats } from "@/i18n/config";
import { defaultFormatter } from "@/i18n/default-translator";

const sourceRoot = new URL("../", import.meta.url);

function readSource(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, sourceRoot)), "utf8");
}

test("shared formatters apply the configured UTC time zone", () => {
  const instant = Date.UTC(2026, 8, 4, 12, 34);
  const expected = new Intl.DateTimeFormat(defaultLocale, {
    ...formats.dateTime.short,
    timeZone: defaultTimeZone
  }).format(instant);

  assert.equal(defaultFormatter.dateTime(instant, "short"), expected);
});

test("localized presentation paths do not bypass the configured formatter", () => {
  const paths = [
    "components/payee/payee-collect.ts",
    "components/user/locked-assets-panel.tsx",
    "components/user/proposals/format.ts",
    "components/user/wealth-chart.tsx",
    "components/user/workspace/editors/guided-fields.tsx",
    "components/user/workspace/helpers/formatters.ts",
    "components/user/workspace/wallet-balance-chart-section.tsx",
    "components/user/workspace/workspace-state-diff.ts",
    "components/user/workspace/workspace-transactions-view.tsx",
    "lib/mesh/transactions/internals/script-data.ts"
  ];
  const directIntl = /\.toLocale(?:String|DateString|TimeString)\(|new Intl\.(?:DateTimeFormat|NumberFormat)\(/;

  for (const path of paths) {
    assert.doesNotMatch(readSource(path), directIntl, `${path} bypasses next-intl`);
  }
});
