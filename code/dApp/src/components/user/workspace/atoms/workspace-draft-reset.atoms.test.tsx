import { createStore } from "jotai";
import { expect, it } from "vitest";
import { workspaceDraftResetRevisionAtom } from "./workspace-draft-reset.atoms";
import { resetAllFormsAtom } from "./forms/reset-all-forms.atom";
import { mintStateFormAtom } from "./forms/mint-form.atoms";

it("invalidates editor undo history only when the draft is explicitly reset", () => {
  const store = createStore();
  store.set(mintStateFormAtom, { ...store.get(mintStateFormAtom), walletName: "Edited name" });
  expect(store.get(workspaceDraftResetRevisionAtom)).toBe(0);
  store.set(resetAllFormsAtom);
  expect(store.get(workspaceDraftResetRevisionAtom)).toBe(1);
});
