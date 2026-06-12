"use client";

import dynamic from "next/dynamic";
import { cn } from "@/lib/utils/cn";

const SilkWaves = dynamic(() => import("@/components/react-bits/silk-waves"), {
  ssr: false
});

const BASE_COLORS = [
  "#040c10",
  "#06151c",
  "#082028",
  "#0a2d33",
  "#0e4347",
  "#125f57",
  "#1c8478",
  "#34b29c"
];

type SilkVariant = {
  rotation: number;
  offsetX: number;
  offsetY: number;
  scale: number;
  distortion: number;
  curve: number;
  contrast: number;
  brightness: number;
  opacity: number;
  complexity: number;
  frequency: number;
  timeSeed: number;
};

/**
 * All silk layers share this speed so the global background and the per-card
 * silks animate at the same rate. Variants below pick a different `timeSeed`
 * to phase-shift instead of changing speed, so the motion stays cohesive.
 */
const SHARED_SILK_SPEED = 0.65;

/**
 * Per-section variants. Each surface gets a subtly different motion so the
 * cards feel related but not identical. Speed kept low so the cards read as
 * still-with-life, not animated decoration.
 */
const VARIANTS: Record<string, SilkVariant> = {
  home: {
    rotation: 32,
    offsetX: 0.45,
    offsetY: -0.2,
    scale: 2.8,
    distortion: 0.7,
    curve: 1.1,
    contrast: 0.95,
    brightness: 0.85,
    opacity: 0.7,
    complexity: 1.1,
    frequency: 1.15,
    timeSeed: 0
  },
  activity: {
    rotation: -22,
    offsetX: -0.4,
    offsetY: 0.3,
    scale: 3.2,
    distortion: 0.55,
    curve: 0.9,
    contrast: 0.9,
    brightness: 0.8,
    opacity: 0.7,
    complexity: 1,
    frequency: 1.05,
    timeSeed: 12.5
  },
  send: {
    rotation: 8,
    offsetX: 0.55,
    offsetY: 0.4,
    scale: 3,
    distortion: 0.65,
    curve: 1,
    contrast: 0.9,
    brightness: 0.82,
    opacity: 0.65,
    complexity: 1,
    frequency: 1.1,
    timeSeed: 25
  },
  receive: {
    rotation: -48,
    offsetX: 0.25,
    offsetY: -0.45,
    scale: 2.6,
    distortion: 0.7,
    curve: 1.05,
    contrast: 0.98,
    brightness: 0.92,
    opacity: 0.88,
    complexity: 1.1,
    frequency: 1.15,
    timeSeed: 37.5
  },
  people: {
    rotation: 64,
    offsetX: -0.55,
    offsetY: 0.1,
    scale: 2.4,
    distortion: 0.8,
    curve: 1.15,
    contrast: 1,
    brightness: 0.85,
    opacity: 0.7,
    complexity: 1.15,
    frequency: 1.2,
    timeSeed: 50
  },
  settings: {
    rotation: -8,
    offsetX: 0.1,
    offsetY: 0.5,
    scale: 3.4,
    distortion: 0.45,
    curve: 0.85,
    contrast: 0.85,
    brightness: 0.78,
    opacity: 0.65,
    complexity: 0.95,
    frequency: 1,
    timeSeed: 62.5
  },
  streamingPayments: {
    rotation: 92,
    offsetX: -0.2,
    offsetY: -0.55,
    scale: 2.9,
    distortion: 0.7,
    curve: 1.05,
    contrast: 0.95,
    brightness: 0.84,
    opacity: 0.7,
    complexity: 1.05,
    frequency: 1.15,
    timeSeed: 75
  },
  advanced: {
    rotation: 0,
    offsetX: 0,
    offsetY: 0,
    scale: 3.6,
    distortion: 0.4,
    curve: 0.8,
    contrast: 0.85,
    brightness: 0.7,
    opacity: 0.55,
    complexity: 0.9,
    frequency: 0.95,
    timeSeed: 87.5
  }
};

export type CardSilkSection = keyof typeof VARIANTS;

type CardSilkBackgroundProps = {
  section: CardSilkSection;
  className?: string;
};

/** Soft silk layer + bottom mask, sized to fill its positioned parent. */
export function CardSilkBackground({ section, className }: CardSilkBackgroundProps) {
  const variant = VARIANTS[section] ?? VARIANTS.home;
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className
      )}
      aria-hidden="true"
    >
      <SilkWaves
        speed={SHARED_SILK_SPEED}
        scale={variant.scale}
        distortion={variant.distortion}
        curve={variant.curve}
        contrast={variant.contrast}
        colors={BASE_COLORS}
        rotation={variant.rotation}
        offsetX={variant.offsetX}
        offsetY={variant.offsetY}
        brightness={variant.brightness}
        opacity={variant.opacity}
        complexity={variant.complexity}
        frequency={variant.frequency}
        timeSeed={variant.timeSeed}
        maxPixelRatio={0.55}
        targetFps={30}
        className="absolute inset-0"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-card/35 via-card/15 to-card/60" />
    </div>
  );
}
