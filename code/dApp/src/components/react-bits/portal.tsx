"use client";

import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils/cn";
import * as THREE from "three";
import { usePrefersReducedMotion } from "@/lib/hooks/use-prefers-reduced-motion";

export interface PortalProps {
  /** Additional CSS classes */
  className?: string;
  /** Primary portal glow color */
  primaryColor?: string;
  /** Secondary portal glow color */
  secondaryColor?: string;
  /** Center highlight color */
  centerColor?: string;
  /** Animation speed multiplier */
  speed?: number;
  /** Particle density (scale factor) */
  density?: number;
  /** Number of particle layers */
  layerCount?: number;
  /** Horizontal wave distortion amplitude */
  waveAmplitude?: number;
  /** Horizontal wave frequency */
  waveFrequency?: number;
  /** Vertical wave distortion */
  verticalDistortion?: number;
  /** Tunnel depth effect intensity */
  depthIntensity?: number;
  /** Overall brightness multiplier */
  brightness?: number;
  /** Scale/zoom of the portal effect */
  scale?: number;
  /** Background color for the ball (transparent by default) */
  ballBgColor?: string;
  /** Cap the WebGL backing buffer DPR. Lower values reduce GPU fragment work. */
  maxPixelRatio?: number;
  /** Cap the render loop. Use 0 to render a static frame. */
  targetFps?: number;
  /** Pause the render loop while the canvas is outside the viewport. */
  pauseWhenOffscreen?: boolean;
}

type PortalUniforms = {
  uTime: THREE.IUniform<number>;
  uResolution: THREE.IUniform<THREE.Vector2>;
  uPrimaryColor: THREE.IUniform<THREE.Vector3>;
  uSecondaryColor: THREE.IUniform<THREE.Vector3>;
  uCenterColor: THREE.IUniform<THREE.Vector3>;
  uSpeed: THREE.IUniform<number>;
  uDensity: THREE.IUniform<number>;
  uLayerCount: THREE.IUniform<number>;
  uWaveAmplitude: THREE.IUniform<number>;
  uWaveFrequency: THREE.IUniform<number>;
  uVerticalDistortion: THREE.IUniform<number>;
  uDepthIntensity: THREE.IUniform<number>;
  uBrightness: THREE.IUniform<number>;
  uScale: THREE.IUniform<number>;
  uBallBgColor: THREE.IUniform<THREE.Vector3>;
  uBallBgAlpha: THREE.IUniform<number>;
};

const DEFAULT_TARGET_FPS = 30;

/**
 * Mesmerizing portal effect with swirling particles and depth illusion.
 * Uses WebGL shaders to create an animated tunnel of flowing particles.
 */
export const Portal = ({
  className,
  primaryColor = "#C084FC",
  secondaryColor = "#E879F9",
  centerColor = "#F0ABFC",
  speed = 1.0,
  density = 1.0,
  layerCount = 7,
  waveAmplitude = 1.0,
  waveFrequency = 0.08,
  verticalDistortion = 0.2,
  depthIntensity = 0.2,
  brightness = 1.0,
  scale = 1.0,
  ballBgColor = "transparent",
  maxPixelRatio = 1,
  targetFps = DEFAULT_TARGET_FPS,
  pauseWhenOffscreen = true,
}: PortalProps) => {
  const prefersReducedMotion = usePrefersReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      premultipliedAlpha: false,
      powerPreference: "low-power",
    });
    renderer.setPixelRatio(Math.max(0.5, Math.min(window.devicePixelRatio || 1, maxPixelRatio)));
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    rendererRef.current = renderer;

    container.appendChild(renderer.domElement);

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
      uniform vec3 uPrimaryColor;
      uniform vec3 uSecondaryColor;
      uniform vec3 uCenterColor;
      uniform float uSpeed;
      uniform float uDensity;
      uniform int uLayerCount;
      uniform float uWaveAmplitude;
      uniform float uWaveFrequency;
      uniform float uVerticalDistortion;
      uniform float uDepthIntensity;
      uniform float uBrightness;
      uniform float uScale;
      uniform vec3 uBallBgColor;
      uniform float uBallBgAlpha;

      varying vec2 vUv;

      float generateParticleField(vec2 coord, float scale) {
        float timeOffset = uTime * uSpeed * 2.3;
        coord *= scale;
        coord.x += timeOffset;

        vec2 cellId = floor(coord);
        vec2 localPos = fract(coord);

        vec2 randomSeed = 0.5 + 0.35 * sin(
          11.0 * fract(
            sin((cellId + scale) * mat2(7, 3, 6, 5)) * 5.0
          )
        );

        vec2 particleOffset = randomSeed - localPos;
        float distToParticle = length(particleOffset);

        float particleIntensity = smoothstep(
          0.0,
          distToParticle,
          sin(localPos.x + localPos.y) * 0.003
        );

        return particleIntensity;
      }

      vec3 computePortalEffect(vec2 coord) {
        float depthGradient = 0.5 - length(coord);

        coord.x += sin(uTime * uWaveFrequency) * uWaveAmplitude;
        coord.y += sin(coord.x * 1.4) * uVerticalDistortion;
        coord.x *= 0.1;

        float particleSum = 0.0;

        if (uLayerCount > 0) particleSum += generateParticleField(coord, 30.0 * uDensity) * 0.3;
        if (uLayerCount > 1) particleSum += generateParticleField(coord, 20.0 * uDensity) * 0.5;
        if (uLayerCount > 2) particleSum += generateParticleField(coord, 15.0 * uDensity) * 0.8;
        if (uLayerCount > 3) particleSum += generateParticleField(coord, 10.0 * uDensity);
        if (uLayerCount > 4) particleSum += generateParticleField(coord, 8.0 * uDensity);
        if (uLayerCount > 5) particleSum += generateParticleField(coord, 6.0 * uDensity);
        if (uLayerCount > 6) particleSum += generateParticleField(coord, 5.0 * uDensity);

        particleSum *= uDepthIntensity / depthGradient;

        vec3 portalGlow = mix(uPrimaryColor, uSecondaryColor, 0.5) * particleSum * 30.0 * uBrightness;

        vec3 centerGlow = uCenterColor * 0.02 / depthGradient;

        return portalGlow + centerGlow;
      }

      void main() {
        vec2 coord = (vUv - 0.5) * 2.0;
        coord.x *= uResolution.x / uResolution.y;

        coord /= uScale;

        vec3 portalColor = computePortalEffect(coord);

        float distFromCenter = length(coord);

        float ballRadius = 0.5;
        float ballMaskHard = step(distFromCenter, ballRadius);

        float edgeWidth = fwidth(distFromCenter) * 0.5;
        float ballMaskSoft = smoothstep(ballRadius + edgeWidth, ballRadius - edgeWidth, distFromCenter);

        float portalBrightness = length(portalColor);

        float brightnessThreshold = 0.5;
        float showPortal = smoothstep(brightnessThreshold, brightnessThreshold + 0.4, portalBrightness);

        showPortal = pow(showPortal, 2.0);

        showPortal *= ballMaskHard;

        vec3 finalColor = vec3(0.0);
        float finalAlpha = 0.0;

        if (uBallBgAlpha > 0.0) {
          finalColor = uBallBgColor;
          finalAlpha = ballMaskHard * uBallBgAlpha;

          finalColor = mix(finalColor, portalColor, showPortal);
          finalAlpha = max(finalAlpha, showPortal * ballMaskSoft);
        } else {
          finalColor = portalColor;
          finalAlpha = showPortal * ballMaskSoft;
        }

        gl_FragColor = vec4(finalColor, finalAlpha);
      }
    `;

    const hexToRgb = (hex: string): THREE.Vector3 => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      if (result) {
        return new THREE.Vector3(
          parseInt(result[1], 16) / 255,
          parseInt(result[2], 16) / 255,
          parseInt(result[3], 16) / 255,
        );
      }
      return new THREE.Vector3(0.7, 0.35, 0.9);
    };

    let ballBgColorVec = new THREE.Vector3(0, 0, 0);
    let ballBgAlpha = 0;

    if (ballBgColor && ballBgColor !== "transparent") {
      const rgbaMatch =
        /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/i.exec(
          ballBgColor,
        );
      if (rgbaMatch) {
        ballBgColorVec = new THREE.Vector3(
          parseInt(rgbaMatch[1]) / 255,
          parseInt(rgbaMatch[2]) / 255,
          parseInt(rgbaMatch[3]) / 255,
        );
        ballBgAlpha = rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1;
      } else {
        ballBgColorVec = hexToRgb(ballBgColor);
        ballBgAlpha = 1;
      }
    }

    const uniforms: PortalUniforms = {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uPrimaryColor: { value: hexToRgb(primaryColor) },
      uSecondaryColor: { value: hexToRgb(secondaryColor) },
      uCenterColor: { value: hexToRgb(centerColor) },
      uSpeed: { value: speed },
      uDensity: { value: density },
      uLayerCount: { value: layerCount },
      uWaveAmplitude: { value: waveAmplitude },
      uWaveFrequency: { value: waveFrequency },
      uVerticalDistortion: { value: verticalDistortion },
      uDepthIntensity: { value: depthIntensity },
      uBrightness: { value: brightness },
      uScale: { value: scale },
      uBallBgColor: { value: ballBgColorVec },
      uBallBgAlpha: { value: ballBgAlpha },
    };

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      transparent: true,
    });
    materialRef.current = material;

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    let animationId: number | null = null;
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
      uniforms.uTime.value = elapsedTime;
      renderer.render(scene, camera);
    };

    const handleResize = () => {
      const rect = container.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);

      renderer.setSize(width, height, false);
      uniforms.uResolution.value.set(width, height);
      renderFrame();
    };

    handleResize();

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    const canAnimate = () =>
      shouldAnimate && isDocumentVisible && isElementVisible && !isDisposed;

    const stopAnimation = () => {
      if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
    };

    const animate = (now: number) => {
      animationId = null;

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

      animationId = requestAnimationFrame(animate);
    };

    const startAnimation = () => {
      if (!canAnimate() || animationId !== null) {
        return;
      }

      animationId = requestAnimationFrame(animate);
    };

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
          }, { rootMargin: "120px" })
        : null;

    intersectionObserver?.observe(container);

    renderFrame();
    startAnimation();

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
      container.removeChild(renderer.domElement);
    };
  }, [
    primaryColor,
    secondaryColor,
    centerColor,
    speed,
    density,
    layerCount,
    waveAmplitude,
    waveFrequency,
    verticalDistortion,
    depthIntensity,
    brightness,
    scale,
    ballBgColor,
    maxPixelRatio,
    pauseWhenOffscreen,
    prefersReducedMotion,
    targetFps,
  ]);

  return (
    <div ref={containerRef} className={cn("absolute inset-0", className)} />
  );
};
