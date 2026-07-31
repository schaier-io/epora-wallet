import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StateFormEditor } from "./state-form-editor";
import { createDefaultStateForm } from "@/lib/contracts/state-form";

describe("StateFormEditor streaming-payment controls", () => {
  it("does not offer schedule creation on the UpdateState path", () => {
    render(
      <StateFormEditor
        label="Update State"
        value={createDefaultStateForm()}
        onChange={() => {}}
        allowNewStreamingPayments={false}
      />
    );

    expect(
      screen.queryByRole("button", { name: "Add scheduled payment" })
    ).not.toBeInTheDocument();
  });
});
