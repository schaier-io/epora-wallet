"use client";

import { useMemo } from "react";
import QRCode from "qrcode";
import { cn } from "@/lib/utils/cn";

/**
 * Brand-adjacent WalletConnect mark: two stylized wave arcs in WC blue.
 * Rendered with a vertical gradient. Fills its viewBox edge-to-edge so the
 * blue background reads as a clean circle when clipped by a rounded wrapper.
 */
export function WalletConnectMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-label="WalletConnect"
    >
      <defs>
        <linearGradient id="wc-mark-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3da7ff" />
          <stop offset="100%" stopColor="#2a86e0" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="24" fill="url(#wc-mark-bg)" />
      <path
        d="M14.4 22.5c5.2-5.2 13.6-5.2 18.8 0l.65.65c.5.5.5 1.3 0 1.8l-1.7 1.7c-.25.25-.65.25-.9 0l-.9-.9c-3.6-3.6-9.4-3.6-13 0l-.96.96c-.25.25-.65.25-.9 0l-1.7-1.7c-.5-.5-.5-1.3 0-1.8l.65-.65zm22.95 4.6 1.55 1.55c.5.5.5 1.3 0 1.8L27.6 41.75c-.6.6-1.55.6-2.15 0L18.2 34.5a.65.65 0 0 0-.9 0l-7.25 7.25c-.6.6-1.55.6-2.15 0l-11.3-11.3c-.5-.5-.5-1.3 0-1.8l1.55-1.55c.6-.6 1.55-.6 2.15 0l7.25 7.25c.25.25.65.25.9 0l7.25-7.25c.6-.6 1.55-.6 2.15 0l7.25 7.25c.25.25.65.25.9 0l7.25-7.25c.6-.6 1.55-.6 2.15 0z"
        fill="#fff"
        opacity="0.96"
      />
    </svg>
  );
}

type FinderPatternRect = { x: number; y: number; size: number };

const FINDER_SIZE = 7;

function getFinderPatterns(size: number): FinderPatternRect[] {
  return [
    { x: 0, y: 0, size: FINDER_SIZE },
    { x: size - FINDER_SIZE, y: 0, size: FINDER_SIZE },
    { x: 0, y: size - FINDER_SIZE, size: FINDER_SIZE }
  ];
}

function isInsideFinder(row: number, col: number, finders: FinderPatternRect[]) {
  for (const f of finders) {
    if (row >= f.y && row < f.y + f.size && col >= f.x && col < f.x + f.size) {
      return true;
    }
  }
  return false;
}

type WalletConnectQrProps = {
  /** WalletConnect pairing URI. Rendered as a styled QR. */
  uri: string | null;
  /** Total pixel size of the rendered QR. Defaults to 248. */
  size?: number;
  /** Padding inside the white tile around the QR matrix, in pixels. */
  padding?: number;
  /** Module color (dark cells). Default: a deep brand-tinted near-black. */
  moduleColor?: string;
  className?: string;
  /** When true, shows the WalletConnect mark centered over the QR. */
  showLogo?: boolean;
};

/**
 * Custom QR renderer using rounded modules + accented finder patterns,
 * paired with an inline center WalletConnect logo. Uses the qrcode library
 * to compute the bit matrix at error-correction level "H" so the center
 * overlay stays well within the recoverable area. The logo background is
 * an inline rounded rect inside the same SVG, so its rounded corners sit
 * flush against the QR data cells with no whitespace mismatch.
 */
export function WalletConnectQr({
  uri,
  size = 248,
  padding = 12,
  moduleColor = "#0a1a26",
  className,
  showLogo = true
}: WalletConnectQrProps) {
  const matrix = useMemo(() => {
    if (!uri) return null;
    try {
      const qr = QRCode.create(uri, { errorCorrectionLevel: "H" });
      return qr.modules;
    } catch {
      return null;
    }
  }, [uri]);

  if (!matrix) {
    return (
      <div
        className={cn(
          "relative flex items-center justify-center overflow-hidden rounded-3xl bg-white shadow-[0_12px_32px_-22px_rgba(0,0,0,0.7)]",
          className
        )}
        style={{ width: size, height: size }}
        aria-busy
      />
    );
  }

  const grid = matrix.size;
  const finders = getFinderPatterns(grid);
  const tilePadding = padding;
  const tileInner = size - tilePadding * 2;
  const cellSize = tileInner / grid;
  const inset = cellSize * 0.08;
  const cell = cellSize - inset * 2;
  const radius = cellSize * 0.32;

  // Center logo block sized as a fraction of the QR matrix. H-level error
  // correction allows ~30% of modules to be obscured; we use ~22%.
  const center = tilePadding + tileInner / 2;
  const logoBgSize = Math.max(48, tileInner * 0.24);
  const markSize = logoBgSize * 0.78;
  const haloPad = 5; // px of extra white around the rounded rect for breathing room.
  const logoBgWithHalo = logoBgSize + haloPad * 2;
  const logoBgRadius = logoBgWithHalo * 0.2;

  const data = matrix.data;
  const cells: Array<{ x: number; y: number }> = [];
  // Render every data cell. The rounded white logo rect paints on top, so its
  // rounded corners read against the QR modules rather than against a square
  // hole. H-level error correction tolerates the ~10% obscured modules.
  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
      const value = data[row * grid + col];
      if (!value) continue;
      if (isInsideFinder(row, col, finders)) continue;
      cells.push({ x: col, y: row });
    }
  }

  const finderOuter = (f: FinderPatternRect) => {
    const x = tilePadding + f.x * cellSize;
    const y = tilePadding + f.y * cellSize;
    const s = f.size * cellSize;
    return { x, y, s };
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl bg-white shadow-[0_12px_32px_-22px_rgba(0,0,0,0.7)]",
        className
      )}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        role="img"
        aria-label="WalletConnect pairing QR code"
        style={{ display: "block" }}
      >
        <defs>
          <linearGradient id="wc-qr-mark-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3da7ff" />
            <stop offset="100%" stopColor="#2a86e0" />
          </linearGradient>
        </defs>

        {/* Data modules as small rounded squares. */}
        <g fill={moduleColor}>
          {cells.map((c) => (
            <rect
              key={`${c.x}-${c.y}`}
              x={tilePadding + c.x * cellSize + inset}
              y={tilePadding + c.y * cellSize + inset}
              width={cell}
              height={cell}
              rx={radius}
              ry={radius}
            />
          ))}
        </g>

        {/* Finder patterns: outer rounded square, white center, inner dot. */}
        {finders.map((f) => {
          const { x, y, s } = finderOuter(f);
          const outerR = cellSize * 1.4;
          const inset1 = cellSize;
          const innerR = cellSize * 0.95;
          const inset2 = cellSize * 2.4;
          const dotR = cellSize * 0.55;
          return (
            <g key={`finder-${f.x}-${f.y}`}>
              <rect
                x={x}
                y={y}
                width={s}
                height={s}
                rx={outerR}
                ry={outerR}
                fill={moduleColor}
              />
              <rect
                x={x + inset1}
                y={y + inset1}
                width={s - inset1 * 2}
                height={s - inset1 * 2}
                rx={innerR}
                ry={innerR}
                fill="#fff"
              />
              <rect
                x={x + inset2}
                y={y + inset2}
                width={s - inset2 * 2}
                height={s - inset2 * 2}
                rx={dotR}
                ry={dotR}
                fill={moduleColor}
              />
            </g>
          );
        })}

        {showLogo ? (
          <>
            {/* Slightly oversized rounded white background. Same rounded shape on every side. */}
            <rect
              x={center - logoBgWithHalo / 2}
              y={center - logoBgWithHalo / 2}
              width={logoBgWithHalo}
              height={logoBgWithHalo}
              rx={logoBgRadius}
              ry={logoBgRadius}
              fill="#fff"
            />
            {/* WC mark, scaled and centered. */}
            <g
              transform={`translate(${center - markSize / 2} ${center - markSize / 2}) scale(${markSize / 48})`}
            >
              <circle cx="24" cy="24" r="24" fill="url(#wc-qr-mark-bg)" />
              <path
                d="M14.4 22.5c5.2-5.2 13.6-5.2 18.8 0l.65.65c.5.5.5 1.3 0 1.8l-1.7 1.7c-.25.25-.65.25-.9 0l-.9-.9c-3.6-3.6-9.4-3.6-13 0l-.96.96c-.25.25-.65.25-.9 0l-1.7-1.7c-.5-.5-.5-1.3 0-1.8l.65-.65zm22.95 4.6 1.55 1.55c.5.5.5 1.3 0 1.8L27.6 41.75c-.6.6-1.55.6-2.15 0L18.2 34.5a.65.65 0 0 0-.9 0l-7.25 7.25c-.6.6-1.55.6-2.15 0l-11.3-11.3c-.5-.5-.5-1.3 0-1.8l1.55-1.55c.6-.6 1.55-.6 2.15 0l7.25 7.25c.25.25.65.25.9 0l7.25-7.25c.6-.6 1.55-.6 2.15 0l7.25 7.25c.25.25.65.25.9 0l7.25-7.25c.6-.6 1.55-.6 2.15 0z"
                fill="#fff"
                opacity="0.96"
              />
            </g>
          </>
        ) : null}
      </svg>
    </div>
  );
}
