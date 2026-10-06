import assert from "node:assert/strict";
import { test } from "node:test";
import { DrepIdSchema, extractDrepId } from "@/lib/api/dreps";

const CIP129_ID = "drep1ygqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq7vlc9n";

test("accepts every bech32 DRep id form Mesh can build a certificate from", () => {
  assert.ok(DrepIdSchema.safeParse(CIP129_ID).success);
  assert.ok(DrepIdSchema.safeParse("drep_script1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq").success);
  assert.equal(DrepIdSchema.safeParse("pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy").success, false);
  assert.equal(DrepIdSchema.safeParse("drep1bad").success, false);
});

test("finds the DRep id inside a pasted explorer link", () => {
  assert.equal(extractDrepId(`https://preprod.cardanoscan.io/dRep/${CIP129_ID}?tab=votes`), CIP129_ID);
  assert.equal(extractDrepId(`  ${CIP129_ID.toUpperCase()} `), CIP129_ID);
  assert.equal(extractDrepId("https://example.com/drep/"), null);
});
