import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { AssetListEditor } from "./asset-list-editor";
import { type Asset } from "@/lib/types/contracts";

/**
 * The box shows ADA and the row stores lovelace, so the text used to be re-derived from
 * the stored integer on every keystroke. A half-typed number has no integer to derive
 * from: "1." parsed to 1000000, which formats back as "1", and the decimal point was
 * dropped from under the caret. The next key then made 1.5 ADA into 15 ADA -- ten times
 * the money, with nothing on screen to say so.
 */
function AdaRowHarness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState<Asset[]>([{ unit: "lovelace", quantity: initial }]);
  return (
    <>
      <AssetListEditor label="Send" value={value} onChange={setValue} />
      <output data-testid="stored">{value[0]?.quantity ?? ""}</output>
    </>
  );
}

function typeInto(input: HTMLInputElement, text: string) {
  fireEvent.change(input, { target: { value: text } });
}

describe("an ADA amount row", () => {
  it("keeps the decimal point the reader types", () => {
    render(<AdaRowHarness />);
    const input = screen.getByLabelText("How much (ADA)") as HTMLInputElement;

    typeInto(input, "1");
    typeInto(input, "1.");
    expect(input.value).toBe("1.");

    typeInto(input, "1.5");
    expect(screen.getByTestId("stored").textContent).toBe("1500000");
  });

  it("shows the stored amount when the box has never been typed into", () => {
    render(<AdaRowHarness initial="2500000" />);
    expect((screen.getByLabelText("How much (ADA)") as HTMLInputElement).value).toBe("2.5");
  });

  it("falls back to the stored amount once the box loses focus", () => {
    render(<AdaRowHarness />);
    const input = screen.getByLabelText("How much (ADA)") as HTMLInputElement;

    typeInto(input, "3.");
    fireEvent.blur(input);
    expect(input.value).toBe("3");
  });

  it("names the row each remove button acts on", () => {
    render(<AdaRowHarness />);
    expect(screen.getByRole("button", { name: "Remove asset 1" })).toBeInTheDocument();
  });

  it("keeps focus in the list after a row is removed", () => {
    render(<AdaRowHarness />);
    const remove = screen.getByRole("button", { name: "Remove asset 1" });
    remove.focus();
    fireEvent.click(remove);

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add Asset" }));
  });
});
