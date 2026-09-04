import assert from "node:assert/strict";
import test from "node:test";
import { getUserFacingErrorMessage } from "./errors";

test("translates rejected wallet requests without exposing provider text", () => {
  const rejected = Object.assign(new Error("provider refused the request"), { code: 4001 });
  assert.equal(
    getUserFacingErrorMessage(rejected, "Signing failed."),
    "The request was cancelled in your wallet. Nothing was submitted."
  );
  assert.equal(
    getUserFacingErrorMessage(
      new Error("APIError: code 4001 user rejected request at connector.send"),
      "Signing failed."
    ),
    "The request was cancelled in your wallet. Nothing was submitted."
  );
});

test("does not treat an unrelated 4001 value as a rejected wallet request", () => {
  assert.equal(
    getUserFacingErrorMessage(new Error("request failed after 4001 ms"), "Signing failed."),
    "Signing failed."
  );
});

test("adds a recovery step for network failures", () => {
  assert.equal(
    getUserFacingErrorMessage(new TypeError("Failed to fetch"), "Could not load proposals."),
    "Could not load proposals. Check your connection and try again."
  );
});

test("uses the supplied safe fallback for unknown technical failures", () => {
  assert.equal(
    getUserFacingErrorMessage(new Error("SqlState P2024: pool exhausted"), "Could not save."),
    "Could not save."
  );
  assert.equal(getUserFacingErrorMessage(undefined, "Please try again."), "Please try again.");
});
