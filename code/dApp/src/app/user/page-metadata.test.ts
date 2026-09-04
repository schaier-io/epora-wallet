import assert from "node:assert/strict";
import test from "node:test";

import { generateMetadata } from "./page";

const WALLET = "67c11430b30ec8d03c2cce22b149265fef3c866af5b364568185f93c4a54e323";

test("repeated query parameters use the same first value as URLSearchParams", async () => {
  const metadata = await generateMetadata({
    searchParams: Promise.resolve({
      wallet: WALLET,
      action: ["send", "add-funds"],
      step: ["review", "configure"]
    })
  });

  assert.equal(metadata.title, "Send funds (review)");
});
