import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SignerRing } from "./signer-ring";

describe("signer ring", () => {
  it("draws nothing while the total is unknown, so it never claims none have signed", () => {
    const { container } = render(<SignerRing fraction={null} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("fills to the fraction and stays hidden from assistive tech", () => {
    const { container } = render(<SignerRing fraction={2 / 3} />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(Number(svg.style.getPropertyValue("--signer-ring-offset"))).toBeCloseTo(1 / 3);
  });

  it("clamps an over-full ring", () => {
    const { container } = render(<SignerRing fraction={1.4} />);
    expect(container.querySelector("svg")!.style.getPropertyValue("--signer-ring-offset")).toBe("0");
  });
});
