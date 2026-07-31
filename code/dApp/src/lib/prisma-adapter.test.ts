import assert from "node:assert/strict";
import test from "node:test";
import { getDatabaseSchema, quotePostgresIdentifier } from "./prisma-adapter";

test("getDatabaseSchema resolves an explicit schema and defaults to public", () => {
  assert.equal(
    getDatabaseSchema("postgresql://postgres@localhost:5432/wallet?schema=stt_test"),
    "stt_test"
  );
  assert.equal(getDatabaseSchema("postgresql://postgres@localhost:5432/wallet"), "public");
});

test("quotePostgresIdentifier contains embedded quotes inside one identifier", () => {
  assert.equal(
    quotePostgresIdentifier('tenant"; DROP SCHEMA public;--'),
    '"tenant""; DROP SCHEMA public;--"'
  );
});
