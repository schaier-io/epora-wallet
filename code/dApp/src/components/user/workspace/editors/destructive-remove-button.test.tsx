import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { useState } from "react";

import { DestructiveRemoveButton } from "./destructive-remove-button";

function ContactList() {
  const [rows, setRows] = useState(["Ada", "Blake"]);
  return (
    <div>
      <button type="button">Before the list</button>
      <ul id="contact-list">
        {rows.map((row) => (
          <li key={row}>
            <span>{row}</span>
            <DestructiveRemoveButton
              label={`Remove ${row}`}
              confirmTitle={`Remove ${row}?`}
              confirmBody="This cannot be undone."
              cancelLabel="Cancel"
              onConfirm={() => setRows((current) => current.filter((name) => name !== row))}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

/**
 * `use-modal-isolation.ts` restores focus to whatever held it when the dialog opened,
 * which is the trigger inside the row being removed. By the time it runs, that button is
 * detached, and `focus()` on a detached element does nothing: measured before this fix,
 * `document.activeElement` was `BODY`.
 */
it("leaves focus on the list rather than at the top of the document", async () => {
  render(<ContactList />);
  const trigger = screen.getByRole("button", { name: "Remove Ada" });
  trigger.focus();
  fireEvent.click(trigger);
  await settle();

  // The dialog repeats the label on its confirm button; the trigger is the first.
  const confirm = screen.getAllByRole("button", { name: "Remove Ada" })[1]!;
  fireEvent.click(confirm);
  await settle();

  expect(screen.queryByText("Ada")).not.toBeInTheDocument();
  expect(document.activeElement).not.toBe(document.body);
  expect(document.activeElement).toBe(document.getElementById("contact-list"));
});

it("takes its borrowed tabindex back off once focus leaves", async () => {
  render(<ContactList />);
  const trigger = screen.getByRole("button", { name: "Remove Ada" });
  trigger.focus();
  fireEvent.click(trigger);
  await settle();
  fireEvent.click(screen.getAllByRole("button", { name: "Remove Ada" })[1]!);
  await settle();

  const list = document.getElementById("contact-list")!;
  expect(list).toHaveAttribute("tabindex", "-1");

  screen.getByRole("button", { name: "Before the list" }).focus();
  fireEvent.blur(list);
  expect(list).not.toHaveAttribute("tabindex");
});
