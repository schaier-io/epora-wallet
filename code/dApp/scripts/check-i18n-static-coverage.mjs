import fs from "node:fs";
import path from "node:path";
import { findUntranslatedCopy } from "./lib/i18n-static-coverage.mjs";

const ROOT = path.resolve("src");
const SKIP_SUFFIXES = [".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx", ".d.ts"];
// VERIFIED: The shared checkout had uncommitted changes in this file during this audit.
// Keep the exception at exact-message scope. New copy in the file still fails this check.
const PROTECTED_DEBT = new Map([
  [
    "components/payee/payee-view.tsx",
    new Set([
      "${formatLovelaceAsAda(String(payment.amountPerDay))} ADA / day",
      "${payment.amountPerDay.toLocaleString()} ${assetLabel(payment.policyId, payment.assetName)} / day"
    ])
  ],
  [
    "components/user/wallet-membership-card.tsx",
    new Set(["Founding member · No. ${n}", "Member · No. ${n}"])
  ]
]);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "generated" ? [] : walk(fullPath);
    if (!/\.tsx?$/.test(entry.name) || SKIP_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))) return [];
    return [fullPath];
  });
}

const findings = [];
for (const file of walk(ROOT)) {
  const relative = path.relative(ROOT, file).split(path.sep).join("/");
  if (relative.startsWith("app/api/v1/") || relative.startsWith("lib/api/") || relative === "lib/http/tx-route.ts") continue;
  const protectedCopy = PROTECTED_DEBT.get(relative) ?? new Set();
  for (const finding of findUntranslatedCopy(fs.readFileSync(file, "utf8"), file)) {
    if (!protectedCopy.has(finding.text)) {
      findings.push(`${relative}:${finding.line} · ${finding.context} · ${finding.text}`);
    }
  }
}

if (findings.length > 0) {
  console.error(findings.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Static i18n coverage valid for audited syntax shapes.");
}
