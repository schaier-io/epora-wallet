import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { invalidateChainQueries } from "./invalidation";
import { queryKeys } from "./keys";

test("chain invalidation keeps found transactions fresh and marks balances stale", async () => {
  const client = new QueryClient();
  client.setQueryData(queryKeys.txInfo("ab"), { hash: "ab" });
  client.setQueryData(queryKeys.addressUtxos("addr"), []);
  await invalidateChainQueries(client);
  assert.equal(client.getQueryState(queryKeys.txInfo("ab"))?.isInvalidated, false);
  assert.equal(client.getQueryState(queryKeys.addressUtxos("addr"))?.isInvalidated, true);
  client.clear();
});
