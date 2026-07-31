import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LAST_CONNECTED_WALLET_STORAGE_KEY,
  clearLastConnectedWalletName,
  persistLastConnectedWalletName,
  readLastConnectedWalletName,
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSet
} from "./storage";

type TestLocalStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type TestWindow = { localStorage: TestLocalStorage };

function withWindow<T>(win: TestWindow | undefined, fn: () => T): T {
  const globalRef = globalThis as { window?: TestWindow };
  const previous = globalRef.window;
  if (win === undefined) {
    delete globalRef.window;
  } else {
    globalRef.window = win;
  }
  try {
    return fn();
  } finally {
    if (previous === undefined) {
      delete globalRef.window;
    } else {
      globalRef.window = previous;
    }
  }
}

function mapBackedWindow(store: Map<string, string>): TestWindow {
  return {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      }
    }
  };
}

function throwingWindow(): TestWindow {
  const boom = () => {
    throw new Error("storage disabled");
  };
  return {
    localStorage: {
      getItem: boom,
      setItem: boom,
      removeItem: boom
    }
  };
}

test("without a window, helpers return fallbacks and do not throw", () => {
  withWindow(undefined, () => {
    assert.equal(safeLocalStorageGet("some-key"), null);
    assert.doesNotThrow(() => safeLocalStorageSet("some-key", "value"));
    assert.doesNotThrow(() => safeLocalStorageRemove("some-key"));
    assert.equal(readLastConnectedWalletName(), null);
    assert.doesNotThrow(() => persistLastConnectedWalletName("eternl"));
    assert.doesNotThrow(() => clearLastConnectedWalletName());
  });
});

test("with a working window storage, persist/read/clear round-trip", () => {
  const store = new Map<string, string>();
  withWindow(mapBackedWindow(store), () => {
    assert.equal(readLastConnectedWalletName(), null);

    persistLastConnectedWalletName("eternl");
    assert.equal(store.get(LAST_CONNECTED_WALLET_STORAGE_KEY), "eternl");
    assert.equal(readLastConnectedWalletName(), "eternl");

    clearLastConnectedWalletName();
    assert.equal(store.has(LAST_CONNECTED_WALLET_STORAGE_KEY), false);
    assert.equal(readLastConnectedWalletName(), null);
  });
});

test("safe wrappers read and write arbitrary keys through window storage", () => {
  const store = new Map<string, string>();
  withWindow(mapBackedWindow(store), () => {
    safeLocalStorageSet("k", "v");
    assert.equal(safeLocalStorageGet("k"), "v");
    safeLocalStorageRemove("k");
    assert.equal(safeLocalStorageGet("k"), null);
  });
});

test("throwing storage (private mode/quota) is swallowed, get falls back to null", () => {
  withWindow(throwingWindow(), () => {
    assert.equal(safeLocalStorageGet("k"), null);
    assert.doesNotThrow(() => safeLocalStorageSet("k", "v"));
    assert.doesNotThrow(() => safeLocalStorageRemove("k"));
    assert.equal(readLastConnectedWalletName(), null);
    assert.doesNotThrow(() => persistLastConnectedWalletName("eternl"));
    assert.doesNotThrow(() => clearLastConnectedWalletName());
  });
});
