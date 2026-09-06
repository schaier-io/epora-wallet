import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// jsdom has no WebGL, so `three` is replaced with the smallest surface this
// component touches. The mock also records every material it builds, which is
// what the test is really about: a rebuild must not lose the visual props.
const three = vi.hoisted(() => {
  const materials: { uniforms: Record<string, { value: unknown }> }[] = [];

  class MockColor {
    value: unknown;
    constructor(value?: unknown) {
      this.value = value;
    }
    set(next: unknown) {
      this.value = next;
    }
  }

  class MockShaderMaterial {
    uniforms: Record<string, { value: unknown }>;
    constructor({ uniforms }: { uniforms: Record<string, { value: unknown }> }) {
      this.uniforms = uniforms;
      materials.push(this);
    }
    dispose() {}
  }

  class MockRenderer {
    domElement = document.createElement("canvas");
    setClearColor() {}
    setPixelRatio() {}
    setSize() {}
    render() {}
    dispose() {}
    forceContextLoss() {}
  }

  return { materials, MockColor, MockShaderMaterial, MockRenderer };
});

vi.mock("three", () => ({
  Scene: class {
    add() {}
  },
  OrthographicCamera: class {},
  WebGLRenderer: three.MockRenderer,
  ShaderMaterial: three.MockShaderMaterial,
  PlaneGeometry: class {
    dispose() {}
  },
  Mesh: class {},
  Vector2: class {
    constructor(
      public x: number,
      public y: number
    ) {}
    set(x: number, y: number) {
      this.x = x;
      this.y = y;
    }
  },
  Color: three.MockColor
}));

const { default: SilkWaves } = await import("@/components/react-bits/silk-waves");

function setReducedMotion(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {}
  })) as unknown as typeof window.matchMedia;
}

describe("SilkWaves", () => {
  beforeEach(() => {
    three.materials.length = 0;
  });

  it("keeps the visual props when reduced motion rebuilds the material", async () => {
    // `usePrefersReducedMotion` reads the media query in an effect, so the first
    // commit always renders with it false and the second flips it true. That
    // second run disposes the material and builds a new one from shader
    // defaults; before this the prop sync did not follow, and the layer rendered
    // in the default palette at default speed for the rest of the session.
    setReducedMotion(true);

    render(<SilkWaves speed={0.35} scale={3.5} colors={Array(8).fill("#123456")} />);

    await waitFor(() => expect(three.materials.length).toBeGreaterThan(1));

    const rebuilt = three.materials[three.materials.length - 1]!;
    await waitFor(() => expect(rebuilt.uniforms.uSpeed?.value).toBe(0.35));
    expect(rebuilt.uniforms.uScale?.value).toBe(3.5);
    expect((rebuilt.uniforms.uC1?.value as { value: unknown }).value).toBe("#123456");
  });

  it("applies the visual props on a first build too", async () => {
    setReducedMotion(false);

    render(<SilkWaves speed={0.75} scale={1.25} />);

    const built = three.materials[0]!;
    await waitFor(() => expect(built.uniforms.uSpeed?.value).toBe(0.75));
    expect(built.uniforms.uScale?.value).toBe(1.25);
  });
});
