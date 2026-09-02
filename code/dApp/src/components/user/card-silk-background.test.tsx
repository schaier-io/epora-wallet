import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const { silkModuleLoaded } = vi.hoisted(() => ({
  silkModuleLoaded: vi.fn()
}));

vi.mock("@/components/react-bits/silk-waves", () => {
  silkModuleLoaded();
  return {
    default: (props: Record<string, unknown>) => (
      <div data-testid="silk-waves" data-props={JSON.stringify(props)} />
    )
  };
});

const { CardSilkBackground } = await import("@/components/user/card-silk-background");

it("loads the tuned silk layer only after its card background renders", async () => {
  expect(silkModuleLoaded).not.toHaveBeenCalled();

  render(<CardSilkBackground section="home" />);

  const silk = await screen.findByTestId("silk-waves");
  expect(silkModuleLoaded).toHaveBeenCalledTimes(1);
  expect(JSON.parse(silk.dataset.props ?? "{}")).toMatchObject({
    speed: 0.65,
    scale: 2.8,
    distortion: 0.7,
    curve: 1.1,
    contrast: 0.95,
    colors: [
      "#040c10",
      "#06151c",
      "#082028",
      "#0a2d33",
      "#0e4347",
      "#125f57",
      "#1c8478",
      "#34b29c"
    ],
    rotation: 32,
    offsetX: 0.45,
    offsetY: -0.2,
    brightness: 0.85,
    opacity: 0.7,
    complexity: 1.1,
    frequency: 1.15,
    timeSeed: 0,
    maxPixelRatio: 0.55,
    targetFps: 30,
    className: "absolute inset-0"
  });
});
