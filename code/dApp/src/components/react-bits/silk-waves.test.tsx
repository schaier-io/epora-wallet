import { render } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const motion = vi.hoisted(() => ({ reduced: false }));
const three = vi.hoisted(() => ({
  materials: [] as Array<{ uniforms: Record<string, { value: unknown }> }>
}));

vi.mock("@/lib/hooks/use-prefers-reduced-motion", () => ({
  usePrefersReducedMotion: () => motion.reduced
}));
vi.mock("three", () => {
  class Vector2 {
    constructor(
      public x = 0,
      public y = 0
    ) {}
    set() {}
  }
  class Color {
    value: unknown;
    constructor(value?: unknown) {
      this.value = value;
    }
    set(value: unknown) {
      this.value = value;
    }
  }
  class WebGLRenderer {
    domElement = document.createElement("canvas");
    setClearColor() {}
    setPixelRatio() {}
    setSize() {}
    render() {}
    dispose() {}
    forceContextLoss() {}
  }
  class ShaderMaterial {
    uniforms: Record<string, { value: unknown }>;
    constructor(options: { uniforms: Record<string, { value: unknown }> }) {
      this.uniforms = options.uniforms;
      three.materials.push(this);
    }
    dispose() {}
  }
  class PlaneGeometry {
    dispose() {}
  }
  class Mesh {}
  class Scene {
    add() {}
  }
  class OrthographicCamera {}
  return { Vector2, Color, WebGLRenderer, ShaderMaterial, PlaneGeometry, Mesh, Scene, OrthographicCamera };
});

import SilkWaves from "./silk-waves";

beforeEach(() => {
  motion.reduced = false;
  three.materials.length = 0;
});

it("keeps the given props when reduced motion rebuilds the material", () => {
  // The renderer effect re-ran on the reduced-motion flip and built a material with the
  // shader defaults; the props-sync effect had no reason to run again.
  const view = render(<SilkWaves speed={3} brightness={0.5} pauseWhenOffscreen={false} />);
  expect(three.materials).toHaveLength(1);
  expect(three.materials[0]!.uniforms.uSpeed!.value).toBe(3);

  motion.reduced = true;
  view.rerender(<SilkWaves speed={3} brightness={0.5} pauseWhenOffscreen={false} />);

  expect(three.materials).toHaveLength(2);
  expect(three.materials[1]!.uniforms.uSpeed!.value).toBe(3);
  expect(three.materials[1]!.uniforms.uBrightness!.value).toBe(0.5);
});
