/**
 * Quiet fixed atmosphere behind every page. Static layers keep transaction
 * review calm, avoid continuous GPU work, and remain stable in screenshots.
 */
export function GlobalBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,hsl(167_58%_22%/0.18),transparent_34%),radial-gradient(circle_at_86%_10%,hsl(198_48%_22%/0.12),transparent_30%),linear-gradient(165deg,hsl(195_48%_4%),hsl(186_34%_6%)_58%,hsl(198_34%_5%))]" />
      <svg
        aria-hidden="true"
        className="absolute inset-0 h-full w-full opacity-[0.035] mix-blend-soft-light"
      >
        <filter id="global-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.72"
            numOctaves="1"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.4" />
          </feComponentTransfer>
        </filter>
        <rect width="100%" height="100%" filter="url(#global-grain)" />
      </svg>
    </div>
  );
}
