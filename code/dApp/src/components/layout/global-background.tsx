"use client";

import dynamic from "next/dynamic";

const SilkWaves = dynamic(() => import("@/components/react-bits/silk-waves"), {
  ssr: false
});

const ATMOSPHERE_COLORS = [
  "#040b10",
  "#06141d",
  "#08202b",
  "#0a2c39",
  "#0d4147",
  "#125b55",
  "#1a7d6f",
  "#2ba38e"
];

/**
 * One animated atmospheric layer behind every page. Deliberately low opacity
 * so text and cards stay readable. Pinned to the viewport with fixed position
 * so the body's static radial gradients can still sit on top of it.
 */
export function GlobalBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <SilkWaves
        speed={0.65}
        scale={4}
        distortion={0.55}
        curve={0.9}
        contrast={0.9}
        colors={ATMOSPHERE_COLORS}
        rotation={-18}
        brightness={0.75}
        opacity={0.5}
        complexity={0.75}
        frequency={0.95}
        maxPixelRatio={0.6}
        targetFps={30}
        className="absolute inset-0"
      />
      {/* Slightly darken the bottom so text on dark cards never sits over a bright lobe. */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/70" />
      {/* Fine SVG grain overlay. Adds tactile, photographic texture on top of
          the smooth silk layer. Low opacity + mix-blend overlay so dark cards
          stay readable. */}
      <svg
        aria-hidden="true"
        className="absolute inset-0 h-full w-full opacity-[0.08] mix-blend-overlay"
      >
        <filter id="global-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.55" />
          </feComponentTransfer>
        </filter>
        <rect width="100%" height="100%" filter="url(#global-grain)" />
      </svg>
    </div>
  );
}
