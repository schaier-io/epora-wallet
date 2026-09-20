import { render, screen } from "@testing-library/react";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";

import { ReceiveAddressQrCode } from "./primitives";

// A real Preprod payment address: the symbol version, and therefore the module
// count, follows the payload length, so a short placeholder would not measure
// the geometry the receive tile actually renders.
const ADDRESS =
  "addr_test1qpw0djgj0x59ngrjvqthn7enhvruxnsavsw5th63la3mjel3tkc974sr23jmlzgq5zda4gtv8k9cy38756r9y3qgmkqqjz6aa7";

/**
 * ISO/IEC 18004 requires a light border of at least four modules on every side.
 * The `qrcode` module grid carries none, so the component has to add it. Measure
 * it from the rendered SVG rather than trusting the source: the viewBox is what
 * decides the pitch, so the quiet zone is (module units of padding) / (pitch),
 * and both come out of the same attribute.
 */
describe("receive address QR quiet zone", () => {
  it("renders at least four modules of quiet zone on every side", () => {
    render(<ReceiveAddressQrCode address={ADDRESS} />);

    const svg = screen.getByRole("img");
    const viewBox = svg.getAttribute("viewBox");
    expect(viewBox).not.toBeNull();

    const [minX, minY, width, height] = viewBox!.split(" ").map(Number);
    const grid = QRCode.create(ADDRESS, { errorCorrectionLevel: "M" }).modules.size;

    // The modules themselves occupy 0..grid in user units (one unit per module),
    // so the padding on each side is readable straight off the viewBox.
    expect(-minX).toBeGreaterThanOrEqual(4);
    expect(-minY).toBeGreaterThanOrEqual(4);
    expect(width - grid + minX).toBeGreaterThanOrEqual(4);
    expect(height - grid + minY).toBeGreaterThanOrEqual(4);

    // The symbol stays square and centred, or the modules would render as
    // rectangles and stop scanning.
    expect(width).toBe(height);
    expect(minX).toBe(minY);
  });
});
