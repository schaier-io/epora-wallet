import { test } from "node:test";
import assert from "node:assert/strict";
import { STT_SPEND_ACTION_TABS } from "@/components/user/workspace/stt-spend-action-tabs";
import { USER_ACTION_DEFINITIONS } from "@/lib/user-flow/action-definitions";

const tab = STT_SPEND_ACTION_TABS.find((entry) => entry.value === "consolidate-utxo")!;
const definition = USER_ACTION_DEFINITIONS.find((entry) => entry.kind === "consolidate-utxo")!;

/**
 * Tidy funds is the only action that reads its fund pools through the browser panel AND the
 * manual editor at once, so its four strings all render on one screen. Two of them said the
 * wrong number and two of them shared a label.
 */
test("the tidy-funds helpers ask for the number the validator asks for", () => {
  // The builder accepts one or more inputs. API callers may repartition them in
  // either direction. This browser form leaves outputs empty for one merged pool.
  for (const helper of [tab.lockedInputsHelper, tab.lockedInputsEditorHelper]) {
    assert.doesNotMatch(helper, /at least two/i);
    assert.doesNotMatch(helper, /\btwo\b/i);
  }
});

test("the tidy-funds copy preserves value and describes the browser default", () => {
  assert.match(tab.outputAssetsHelper, /browser form creates one resulting fund pool/i);
  for (const line of [
    tab.description,
    tab.stateHelper,
    tab.outputAssetsHelper,
    definition.description,
    definition.outcome,
    definition.whatChanges
  ]) {
    assert.doesNotMatch(line, /top up/i);
    assert.doesNotMatch(line, /end up in fewer/i);
  }
});

test("the tidy-funds pool controls do not share a label", () => {
  assert.notEqual(tab.lockedInputsLabel, tab.lockedInputsEditorLabel);
});

test("the tidy-funds outcome does not describe the chain to the reader", () => {
  for (const line of [definition.outcome, definition.whenToUse, definition.description]) {
    assert.doesNotMatch(line, /UTxO/i);
    assert.doesNotMatch(line, /intended (stake )?address/i);
  }
});
