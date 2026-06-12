"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { usePrefersReducedMotion } from "@/lib/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils/cn";

export interface SilkWavesProps {
  /** Animation speed multiplier */
  speed?: number;
  /** Zoom level of the wave pattern */
  scale?: number;
  /** Controls wave amplitude/swirl */
  distortion?: number;
  /** Controls phase shift/rotation */
  curve?: number;
  /** Controls alpha contrast/sharpness */
  contrast?: number;
  /** Array of 8 hex colors for the gradient */
  colors?: string[];
  /** Rotation of the pattern in degrees */
  rotation?: number;
  /** Horizontal offset/pan of the pattern */
  offsetX?: number;
  /** Vertical offset/pan of the pattern */
  offsetY?: number;
  /** Overall brightness multiplier */
  brightness?: number;
  /** Overall opacity (0-1) */
  opacity?: number;
  /** Wave complexity (affects iteration count, 0.5-2) */
  complexity?: number;
  /** Wave stripe frequency */
  frequency?: number;
  /** Additional CSS classes */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
  /** Constant added to elapsed time on every frame. Use to phase-shift one
   * silk layer relative to another without changing its speed. */
  timeSeed?: number;
  /** Cap the WebGL backing buffer DPR. Lower values reduce GPU fragment work. */
  maxPixelRatio?: number;
  /** Cap the render loop. Use 0 to render a static frame. */
  targetFps?: number;
  /** Pause the render loop while the canvas is outside the viewport. */
  pauseWhenOffscreen?: boolean;
}

const DEFAULT_SILK_COLORS = [
  "#0d1326",
  "#162a52",
  "#1e407e",
  "#2657aa",
  "#2e6ed5",
  "#3785ff",
  "#5092ff",
  "#69a0ff",
];

const MIN_PIXEL_RATIO = 0.5;
const DEFAULT_MAX_PIXEL_RATIO = 0.75;
const DEFAULT_TARGET_FPS = 30;
const getBoundedPixelRatio = (maxPixelRatio: number) =>
  Math.max(
    MIN_PIXEL_RATIO,
    Math.min(window.devicePixelRatio || 1, maxPixelRatio),
  );

type SilkUniforms = {
  uTime: THREE.IUniform<number>;
  uResolution: THREE.IUniform<THREE.Vector2>;
  uSpeed: THREE.IUniform<number>;
  uScale: THREE.IUniform<number>;
  uDistortion: THREE.IUniform<number>;
  uCurve: THREE.IUniform<number>;
  uContrast: THREE.IUniform<number>;
  uRotation: THREE.IUniform<number>;
  uOffsetX: THREE.IUniform<number>;
  uOffsetY: THREE.IUniform<number>;
  uBrightness: THREE.IUniform<number>;
  uOpacity: THREE.IUniform<number>;
  uComplexity: THREE.IUniform<number>;
  uFrequency: THREE.IUniform<number>;
  uC1: THREE.IUniform<THREE.Color>;
  uC2: THREE.IUniform<THREE.Color>;
  uC3: THREE.IUniform<THREE.Color>;
  uC4: THREE.IUniform<THREE.Color>;
  uC5: THREE.IUniform<THREE.Color>;
  uC6: THREE.IUniform<THREE.Color>;
  uC7: THREE.IUniform<THREE.Color>;
  uC8: THREE.IUniform<THREE.Color>;
};

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform vec2 uResolution;
  uniform float uSpeed;
  uniform float uScale;
  uniform float uDistortion;
  uniform float uCurve;
  uniform float uContrast;
  uniform float uRotation;
  uniform float uOffsetX;
  uniform float uOffsetY;
  uniform float uBrightness;
  uniform float uOpacity;
  uniform float uComplexity;
  uniform float uFrequency;
  uniform vec3 uC1;
  uniform vec3 uC2;
  uniform vec3 uC3;
  uniform vec3 uC4;
  uniform vec3 uC5;
  uniform vec3 uC6;
  uniform vec3 uC7;
  uniform vec3 uC8;

  varying vec2 vUv;

  vec2 rotate2D(vec2 p, float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  }

  void main() {
    vec2 pos = vUv * uScale;
    float aspect = uResolution.x / uResolution.y;
    pos.x *= aspect;

    pos.x += uOffsetX;
    pos.y += uOffsetY;

    vec2 center = vec2(aspect * 0.5 * uScale, 0.5 * uScale);
    pos = rotate2D(pos - center, uRotation) + center;

    // Iteration count drives per-pixel cost linearly. The ambient look is
    // dominated by the first handful of harmonics, so we keep a low base and a
    // small complexity-scaled add — far cheaper than the original 10 + 10c
    // (which forced ~17-21 sine pairs per pixel every frame) with no visible
    // difference for a slow, blurred, low-opacity background.
    float iterations = 5.0 + uComplexity * 3.0;

    for (float i = 1.0; i < 9.0; i++) {
        if (i > iterations) break;
        float timeOffset = uTime * uSpeed * 0.1 * i;
        float amp = 0.8 * uDistortion;
        float shift = 0.3 * uCurve;

        pos.x += amp / i * sin(i * pos.y + timeOffset + shift * i) + 1.6;
        pos.y += (amp * 2.0) / i * sin(pos.x + timeOffset + shift * i + 1.6) - 0.8;
    }

    float wave = cos((pos.x + pos.y) * uFrequency) * 0.5 + 0.5;

    vec3 finalColor = vec3(0.0);

    if (wave < 0.15) {
        finalColor = mix(uC1, uC2, wave * 6.667);
    } else if (wave < 0.35) {
        finalColor = mix(uC2, uC3, (wave - 0.15) * 5.0);
    } else if (wave < 0.55) {
        finalColor = mix(uC3, uC4, (wave - 0.35) * 5.0);
    } else if (wave < 0.7) {
        finalColor = mix(uC4, uC5, (wave - 0.55) * 6.667);
    } else if (wave < 0.82) {
        finalColor = mix(uC5, uC6, (wave - 0.7) * 8.333);
    } else if (wave < 0.92) {
        finalColor = mix(uC6, uC7, (wave - 0.82) * 10.0);
    } else {
        finalColor = mix(uC7, uC8, (wave - 0.92) * 12.5);
    }

    finalColor *= uBrightness;

    float alpha = smoothstep(0.01, 1.0, pow(wave, 2.5 * uContrast)) * uOpacity;
    gl_FragColor = vec4(finalColor, alpha);
  }
`;

const SilkWaves: React.FC<SilkWavesProps> = ({
  speed = 1,
  scale = 2,
  distortion = 1,
  curve = 1,
  contrast = 1,
  colors = DEFAULT_SILK_COLORS,
  rotation = 0,
  offsetX = 0,
  offsetY = 0,
  brightness = 1,
  opacity = 1,
  complexity = 1,
  frequency = 1,
  timeSeed = 0,
  maxPixelRatio = DEFAULT_MAX_PIXEL_RATIO,
  targetFps = DEFAULT_TARGET_FPS,
  pauseWhenOffscreen = true,
  className,
  style,
}) => {
  const prefersReducedMotion = usePrefersReducedMotion();
  const timeSeedRef = useRef(timeSeed);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const renderFrameRef = useRef<(() => void) | null>(null);

  // Mirror the latest seed into a ref the animation loop reads asynchronously.
  // Writing it in an effect (not during render) keeps render pure.
  useEffect(() => {
    timeSeedRef.current = timeSeed;
  }, [timeSeed]);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    const scene = new THREE.Scene();

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      powerPreference: "low-power",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(getBoundedPixelRatio(maxPixelRatio));
    renderer.setSize(width, height, false);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const uniforms: SilkUniforms = {
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(width, height) },
        uSpeed: { value: 1 },
        uScale: { value: 2 },
        uDistortion: { value: 1 },
        uCurve: { value: 1 },
        uContrast: { value: 1 },
        uRotation: { value: 0 },
        uOffsetX: { value: 0 },
        uOffsetY: { value: 0 },
        uBrightness: { value: 1 },
        uOpacity: { value: 1 },
        uComplexity: { value: 1 },
        uFrequency: { value: 1 },
        uC1: { value: new THREE.Color(DEFAULT_SILK_COLORS[0]) },
        uC2: { value: new THREE.Color(DEFAULT_SILK_COLORS[1]) },
        uC3: { value: new THREE.Color(DEFAULT_SILK_COLORS[2]) },
        uC4: { value: new THREE.Color(DEFAULT_SILK_COLORS[3]) },
        uC5: { value: new THREE.Color(DEFAULT_SILK_COLORS[4]) },
        uC6: { value: new THREE.Color(DEFAULT_SILK_COLORS[5]) },
        uC7: { value: new THREE.Color(DEFAULT_SILK_COLORS[6]) },
        uC8: { value: new THREE.Color(DEFAULT_SILK_COLORS[7]) },
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
    });
    materialRef.current = material;

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const clockStart = performance.now();
    const shouldAnimate = !prefersReducedMotion && targetFps !== 0;
    const frameIntervalMs =
      typeof targetFps === "number" && targetFps > 0
        ? 1000 / Math.min(60, Math.max(1, targetFps))
        : null;
    let lastRenderAt = 0;
    let isDocumentVisible = !document.hidden;
    let isElementVisible = true;
    let isDisposed = false;

    const renderFrame = () => {
      const elapsedTime = (performance.now() - clockStart) / 1000;
      uniforms.uTime.value = elapsedTime + timeSeedRef.current;
      renderer.render(scene, camera);
    };
    renderFrameRef.current = renderFrame;

    const canAnimate = () =>
      shouldAnimate && isDocumentVisible && isElementVisible && !isDisposed;

    const stopAnimation = () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };

    const animate = (now: number) => {
      animationFrameRef.current = null;

      if (!canAnimate()) {
        return;
      }

      if (frameIntervalMs === null || lastRenderAt === 0 || now - lastRenderAt >= frameIntervalMs) {
        renderFrame();
        lastRenderAt =
          frameIntervalMs === null
            ? now
            : now - ((now - lastRenderAt) % frameIntervalMs);
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    const startAnimation = () => {
      if (!canAnimate() || animationFrameRef.current !== null) {
        return;
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    renderFrame();
    startAnimation();

    const handleResize = () => {
      const newWidth = Math.max(1, container.clientWidth);
      const newHeight = Math.max(1, container.clientHeight);

      renderer.setSize(newWidth, newHeight, false);
      uniforms.uResolution.value.set(newWidth, newHeight);
      renderFrame();
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    const handleVisibilityChange = () => {
      isDocumentVisible = !document.hidden;

      if (isDocumentVisible) {
        renderFrame();
        startAnimation();
      } else {
        stopAnimation();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    const intersectionObserver =
      pauseWhenOffscreen && typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(([entry]) => {
            isElementVisible = Boolean(entry?.isIntersecting);

            if (isElementVisible) {
              renderFrame();
              startAnimation();
            } else {
              stopAnimation();
            }
          }, { rootMargin: "0px" })
        : null;

    intersectionObserver?.observe(container);

    return () => {
      isDisposed = true;
      stopAnimation();
      resizeObserver.disconnect();
      intersectionObserver?.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      renderer.dispose();
      renderer.forceContextLoss();
      geometry.dispose();
      material.dispose();
      renderFrameRef.current = null;
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [maxPixelRatio, pauseWhenOffscreen, prefersReducedMotion, targetFps]);

  useEffect(() => {
    const uniforms = materialRef.current?.uniforms as SilkUniforms | undefined;
    if (!uniforms) return;

    /* eslint-disable react-hooks/immutability -- Three.js shader uniforms are mutable external state. */
    uniforms.uSpeed.value = speed;
    uniforms.uScale.value = scale;
    uniforms.uDistortion.value = distortion;
    uniforms.uCurve.value = curve;
    uniforms.uContrast.value = contrast;
    uniforms.uRotation.value = (rotation * Math.PI) / 180;
    uniforms.uOffsetX.value = offsetX;
    uniforms.uOffsetY.value = offsetY;
    uniforms.uBrightness.value = brightness;
    uniforms.uOpacity.value = opacity;
    uniforms.uComplexity.value = complexity;
    uniforms.uFrequency.value = frequency;
    uniforms.uC1.value.set(colors[0]);
    uniforms.uC2.value.set(colors[1]);
    uniforms.uC3.value.set(colors[2]);
    uniforms.uC4.value.set(colors[3]);
    uniforms.uC5.value.set(colors[4]);
    uniforms.uC6.value.set(colors[5]);
    uniforms.uC7.value.set(colors[6]);
    uniforms.uC8.value.set(colors[7]);
    /* eslint-enable react-hooks/immutability */
    renderFrameRef.current?.();
  }, [
    speed,
    scale,
    distortion,
    curve,
    contrast,
    rotation,
    offsetX,
    offsetY,
    brightness,
    opacity,
    complexity,
    frequency,
    colors,
  ]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full h-full overflow-hidden bg-transparent",
        className,
      )}
      style={{ minHeight: "inherit", ...style }}
    />
  );
};

export default SilkWaves;
