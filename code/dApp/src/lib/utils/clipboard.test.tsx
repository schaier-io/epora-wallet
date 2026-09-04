import { afterEach, expect, it, vi } from "vitest";

import { copyTextToClipboard } from "./clipboard";

function useLegacyClipboard(copy: () => boolean) {
  Object.defineProperty(globalThis.navigator, "clipboard", {
    configurable: true,
    value: undefined
  });
  document.execCommand = copy;
}

afterEach(() => {
  document.execCommand = undefined as never;
  document.querySelectorAll("textarea").forEach((textarea) => textarea.remove());
  document.querySelectorAll("[data-test-clipboard-focus]").forEach((element) => element.remove());
});

it("restores focus after the legacy clipboard fallback", async () => {
  useLegacyClipboard(() => true);
  const input = document.createElement("input");
  input.dataset.testClipboardFocus = "";
  document.body.appendChild(input);
  const focus = vi.spyOn(input, "focus");
  input.focus();

  await expect(copyTextToClipboard("wallet address")).resolves.toBe(true);

  expect(document.activeElement).toBe(input);
  expect(focus).toHaveBeenCalledTimes(2);
});

it("removes the temporary textarea when the legacy copy throws", async () => {
  useLegacyClipboard(() => {
    throw new Error("copy blocked");
  });

  await expect(copyTextToClipboard("wallet address")).resolves.toBe(false);

  expect(document.querySelector("textarea")).toBeNull();
});
