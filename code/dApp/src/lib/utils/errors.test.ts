import assert from "node:assert/strict";
import test from "node:test";
import { getUserFacingErrorMessage } from "./errors";

test("translates rejected wallet requests without exposing provider text", () => {
  assert.equal(
    getUserFacingErrorMessage(
      new Error("APIError: code 4001 user rejected request at connector.send"),
      "Signing failed."
    ),
    "The request was cancelled in your wallet. Nothing was submitted."
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
