import assert from "node:assert/strict";
import test from "node:test";
import { findUntranslatedCopy } from "./i18n-static-coverage.mjs";

function texts(source, fileName = "fixture.tsx") {
  return findUntranslatedCopy(source, fileName).map(({ text }) => text);
}

test("finds copy returned by a module-level formatting helper", () => {
  assert.deepEqual(texts('export function formatState() { return "Needs setup"; }', "fixture.ts"), ["Needs setup"]);
});

test("finds template copy and concise phrase callbacks", () => {
  const source = `
    export function formatRate(value) { return \`${'${value}'} ADA / day\`; }
    const rule = { pattern: /x/, phrase: () => "the wallet name" };
  `;
  assert.deepEqual(texts(source, "fixture.ts"), ["${value} ADA / day", "the wallet name"]);
});

test("finds conditional helper returns and label-map fallbacks", () => {
  const source = `
    const FIELD_LABELS = { wallet: "Wallet name" };
    export function formatMember(value) {
      return value ? \`Founding member · No. ${'${value}'}\` : \`Member · No. ${'${value}'}\`;
    }
    export function describeField(value) { return FIELD_LABELS[value] ?? "This field"; }
  `;
  assert.deepEqual(texts(source, "fixture.ts"), [
    "Wallet name",
    "Founding member · No. ${value}",
    "Member · No. ${value}",
    "This field"
  ]);
});

test("finds JSX copy outside a named React function", () => {
  assert.deepEqual(texts('export default () => <p>Wallet needs attention</p>;'), ["Wallet needs attention"]);
});

test("traces an intermediate constant into a translated prop", () => {
  assert.deepEqual(texts('const status = "Needs setup"; export function Card() { return <Row title={status} />; }'), ["Needs setup"]);
});

test("finds audited object property positions and receipt values", () => {
  const source = `
    const item = { label: i18n("status"), value: "Needs setup", reason: "Wallet is not ready" };
    const action = { shortLabel: "Send funds", pathLabels: ["Owner path", "Co-signer path"] };
  `;
  assert.deepEqual(texts(source, "fixture.ts"), [
    "Needs setup",
    "Wallet is not ready",
    "Send funds",
    "Owner path",
    "Co-signer path"
  ]);
});

test("ignores internal identifiers and translated message keys", () => {
  const source = `
    const mode = "update-state";
    const status = "ACTIVE";
    const title = i18n("walletTitle");
    export function payoutUnit() { return "lovelace"; }
  `;
  assert.deepEqual(texts(source, "fixture.ts"), []);
});
