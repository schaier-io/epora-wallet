import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AddressCopyButton } from "./address-copy-button";

function setClipboard(value: unknown) {
  Object.defineProperty(globalThis.navigator, "clipboard", { configurable: true, value });
}

afterEach(() => {
  setClipboard(undefined);
});

describe("AddressCopyButton", () => {
  it("renders nothing when there is no address to copy", () => {
    const { container } = render(<AddressCopyButton value="" />);

    expect(container).toBeEmptyDOMElement();
  });

  it("copies the full value, not the truncated label next to it", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    setClipboard({ writeText });

    render(<AddressCopyButton value="addr_test1qqpuggk9mxuwfc2me4nqaaay0tkjyd8czx9udeesc4ux42gy6nc6cptzv8dusc4d4ae2pt5ld9u4xgdh6vekt6k04huqtu9ru2" />);

    fireEvent.click(screen.getByRole("button", { name: /copy/i }));

    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        "addr_test1qqpuggk9mxuwfc2me4nqaaay0tkjyd8czx9udeesc4ux42gy6nc6cptzv8dusc4d4ae2pt5ld9u4xgdh6vekt6k04huqtu9ru2"
      );
    });
  });

  it("copies a staged payout address without the whitespace the user typed around it", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    setClipboard({ writeText });

    render(<AddressCopyButton value={"  addr_test1qqpuggk9mxuwfc2me4nqaaay0tkjyd8czx9udeesc4ux42gy6nc6cptzv8dusc4d4ae2pt5ld9u4xgdh6vekt6k04huqtu9ru2\n"} />);

    fireEvent.click(screen.getByRole("button", { name: /copy/i }));

    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        "addr_test1qqpuggk9mxuwfc2me4nqaaay0tkjyd8czx9udeesc4ux42gy6nc6cptzv8dusc4d4ae2pt5ld9u4xgdh6vekt6k04huqtu9ru2"
      );
    });
  });

  it("renders nothing when the value is only whitespace", () => {
    const { container } = render(<AddressCopyButton value="   " />);

    expect(container).toBeEmptyDOMElement();
  });
});
