import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CopyButton } from "./copy-button";

/**
 * The failure path is the one worth a test. `navigator.clipboard` needs a secure context, so it
 * is absent whenever the app is served over plain HTTP on a LAN address, and the handler used to
 * `return` on failure -- leaving the button reading "Copy", exactly as it reads before anyone
 * touches it. The user's clipboard still held whatever it held before.
 */
function setClipboard(value: unknown) {
  Object.defineProperty(globalThis.navigator, "clipboard", { configurable: true, value });
}

afterEach(() => {
  setClipboard(undefined);
  document.execCommand = undefined as never;
});

describe("CopyButton", () => {
  it("says so when the browser refuses the clipboard", async () => {
    setClipboard(undefined);
    document.execCommand = () => false;

    render(<CopyButton value="wc:pairing-uri" label="Copy link" copiedLabel="Link copied" />);

    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));

    expect(
      await screen.findByRole("button", {
        name: /nothing was copied\. select the text and copy it with your keyboard\./i
      })
    ).toHaveTextContent("Copy blocked");
  });

  it("does not claim success when writeText rejects", async () => {
    setClipboard({ writeText: () => Promise.reject(new Error("denied")) });
    document.execCommand = () => false;

    render(<CopyButton value="wc:pairing-uri" label="Copy link" copiedLabel="Link copied" />);

    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));

    await waitFor(() => expect(screen.getByRole("button")).toHaveTextContent("Copy blocked"));
    expect(screen.queryByText("Link copied")).not.toBeInTheDocument();
  });

  it("still confirms a copy that works", async () => {
    const written: string[] = [];
    setClipboard({
      writeText: (value: string) => {
        written.push(value);
        return Promise.resolve();
      }
    });

    render(<CopyButton value="wc:pairing-uri" label="Copy link" copiedLabel="Link copied" />);

    fireEvent.click(screen.getByRole("button", { name: /copy link/i }));

    expect(await screen.findByRole("button", { name: /link copied/i })).toBeInTheDocument();
    expect(written).toEqual(["wc:pairing-uri"]);
  });
});
