import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { ConfirmDialog } from "./confirm-dialog";

function renderDialog(overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const props: Parameters<typeof ConfirmDialog>[0] = {
    open: true,
    onOpenChange: vi.fn(),
    title: "Delete this request?",
    description: "This removes the request for every co-signer.",
    confirmLabel: "Delete request",
    cancelLabel: "Keep it",
    onConfirm: vi.fn(),
    ...overrides
  };
  render(<ConfirmDialog {...props} />);
  return props;
}

it("stays out of the document while closed", () => {
  renderDialog({ open: false });
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("asks its question and confirms once", () => {
  const props = renderDialog();

  expect(screen.getByRole("dialog")).toHaveTextContent("Delete this request?");
  expect(screen.getByRole("dialog")).toHaveTextContent(
    "This removes the request for every co-signer."
  );

  fireEvent.click(screen.getByRole("button", { name: "Delete request" }));
  expect(props.onConfirm).toHaveBeenCalledTimes(1);
  expect(props.onOpenChange).not.toHaveBeenCalled();
});

it("closes without confirming when the reader keeps the item", () => {
  const props = renderDialog();

  fireEvent.click(screen.getByRole("button", { name: "Keep it" }));

  expect(props.onConfirm).not.toHaveBeenCalled();
  expect(props.onOpenChange).toHaveBeenCalledWith(false);
});

it("locks its buttons and shows progress while the action runs", () => {
  renderDialog({ busy: true });

  expect(screen.getByRole("button", { name: /delete request/i })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Keep it" })).toBeDisabled();
});

it("marks the confirming action destructive on request", () => {
  const { rerender } = render(
    <ConfirmDialog
      open
      onOpenChange={() => undefined}
      title="t"
      description="d"
      confirmLabel="c"
      cancelLabel="k"
      onConfirm={() => undefined}
    />
  );
  expect(screen.getByRole("button", { name: "c" }).className).not.toMatch(/destructive/);

  rerender(
    <ConfirmDialog
      open
      onOpenChange={() => undefined}
      title="t"
      description="d"
      confirmLabel="c"
      cancelLabel="k"
      destructive
      onConfirm={() => undefined}
    />
  );
  expect(screen.getByRole("button", { name: "c" }).className).toMatch(/destructive/);
});
