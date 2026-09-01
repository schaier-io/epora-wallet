"use client";
import { useEffect, useRef } from "react";

/**
 * A single full-screen confetti burst that plays once and fades out.
 *
 * Replaces the WebGL portal backdrop on the mint celebration: two cannons at the
 * lower corners fire inward and upward so pieces sweep across the whole viewport,
 * then everything fades and the canvas stops requesting frames. Dependency-free
 * (canvas 2d) and a no-op under `prefers-reduced-motion`.
 */

// Brand surface plus two sunpillar accents (ProfileCard.css spectrum) so the
// burst reads as the same celebration as the holographic card.
const CONFETTI_COLORS = [
  "#34d399",
  "#22d3ee",
  "#33cfff",
  "#5eead4",
  "#a7f3d0",
  "hsl(53,100%,69%)",
  "hsl(283,100%,73%)",
  "#f8fafc"
] as const;

const PIECES_PER_CANNON = 90;
const LIFE_MS = 3200;
const FADE_MS = 900;
const GRAVITY_PX_S2 = 1500;
const DRAG_PER_S = 0.88; // Exponential air resistance factor per second.
const MAX_DT_S = 1 / 30; // Clamp tab-switch jumps so pieces never teleport.

type Piece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  spin: number;
  width: number;
  height: number;
  color: string;
  round: boolean;
  flutter: number;
};

function fireCannon(
  originX: number,
  originY: number,
  direction: number,
  width: number,
  height: number
): Piece[] {
  const pieces: Piece[] = [];
  for (let i = 0; i < PIECES_PER_CANNON; i += 1) {
    // Angles sweep a cone around the cannon's aim (direction = -90° is straight up,
    // negative `direction` tilts the cone toward the right, positive toward the left).
    const angle = ((-90 + direction + (Math.random() * 50 - 25)) * Math.PI) / 180;
    const speed = height * (0.55 + Math.random() * 0.6);
    pieces.push({
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() * 10 - 5) * (Math.PI / 180) * 60,
      width: 5 + Math.random() * 6,
      height: 8 + Math.random() * 8,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      round: Math.random() < 0.2,
      flutter: Math.random() * Math.PI * 2
    });
  }
  return pieces;
}

export function ConfettiBurst({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const width = rect.width || window.innerWidth;
    const height = rect.height || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const pieces = [
      ...fireCannon(width * 0.12, height * 0.85, -25, width, height),
      ...fireCannon(width * 0.88, height * 0.85, 25, width, height)
    ];

    let rafId: number | null = null;
    let lastTs = 0;
    let elapsedMs = 0;

    const frame = (ts: number) => {
      if (lastTs === 0) {
        lastTs = ts;
      }
      const dt = Math.min((ts - lastTs) / 1000, MAX_DT_S);
      lastTs = ts;
      elapsedMs += dt * 1000;

      ctx.clearRect(0, 0, width, height);
      // Hold fully opaque through LIFE_MS, then fade to zero over FADE_MS.
      ctx.globalAlpha = Math.min(1, Math.max(0, (LIFE_MS + FADE_MS - elapsedMs) / FADE_MS));

      const drag = Math.pow(DRAG_PER_S, dt);
      let alive = false;
      for (const piece of pieces) {
        piece.vy += GRAVITY_PX_S2 * dt;
        piece.vx *= drag;
        piece.vy *= drag;
        // Side-to-side flutter reads as paper rather than pellets.
        piece.x += piece.vx * dt + Math.sin(elapsedMs / 160 + piece.flutter) * 26 * dt;
        piece.y += piece.vy * dt;
        piece.rotation += piece.spin * dt;

        if (piece.y > height + 40) {
          continue;
        }
        alive = true;

        ctx.save();
        ctx.translate(piece.x, piece.y);
        ctx.rotate(piece.rotation);
        ctx.fillStyle = piece.color;
        if (piece.round) {
          ctx.beginPath();
          ctx.arc(0, 0, piece.width / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Flatten the rectangle as it spins so it catches "light" like paper.
          const foreshorten = Math.abs(Math.sin(piece.rotation));
          ctx.fillRect(
            -piece.width / 2,
            (-piece.height / 2) * foreshorten,
            piece.width,
            piece.height * foreshorten + 1.5
          );
        }
        ctx.restore();
      }

      if (alive && elapsedMs < LIFE_MS + FADE_MS) {
        rafId = requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, width, height);
        ctx.globalAlpha = 1;
      }
    };

    rafId = requestAnimationFrame(frame);

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
