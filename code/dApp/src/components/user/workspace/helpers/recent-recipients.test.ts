import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  readRecentRecipientsFromStorage,
  writeRecentRecipientsToStorage
} from "@/components/user/workspace/helpers/recent-recipients";

type StorageStub = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

// node:test runs without a DOM, and jsdom's own localStorage is unusable here
// (see the `dapp-jsdom-localstorage-broken` note), so the helpers get a stub
// window. They read `typeof window` and `window.localStorage`, nothing else.
function withStorage(storage: StorageStub) {
  Object.defineProperty(globalThis, "window", {
    value: { localStorage: storage },
    configurable: true,
    writable: true
  });
}

function blockedStorage(): StorageStub {
  return {
    getItem: () => {
      throw new Error("The operation is insecure.");
    },
    setItem: () => {
      throw new Error("The operation is insecure.");
    }
  };
}

function memoryStorage(): StorageStub {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    }
  };
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
});

describe("recent recipients storage", () => {
  it("does not throw when the browser blocks site data", () => {
    withStorage(blockedStorage());

    // The write runs inside the submit try, after the hash is on chain. A throw
    // here reported a completed send as a submit failure.
    assert.doesNotThrow(() => {
      writeRecentRecipientsToStorage(["addr_test1recipient"]);
    });
  });

  it("returns an empty list when the browser blocks site data", () => {
    withStorage(blockedStorage());

    assert.deepEqual(readRecentRecipientsFromStorage(), []);
  });

  it("round-trips the list through working storage", () => {
    withStorage(memoryStorage());

    writeRecentRecipientsToStorage(["addr_test1a", "addr_test1b"]);

    assert.deepEqual(readRecentRecipientsFromStorage(), ["addr_test1a", "addr_test1b"]);
  });
});
