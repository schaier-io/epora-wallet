import type { CSSProperties } from "react";

/**
 * One small drawing per welcome step, each acting out its own sentence once as the row
 * enters: keys join one wallet, an amount builds up on a schedule, a proof-of-life pulse
 * runs out and a recovery key appears. They replace bare "01 / 02 / 03" markers, which
 * counted the steps and said nothing about them. Decorative: the heading beside each one
 * carries the meaning, so every glyph is `aria-hidden`. Reduced motion shows the end state.
 */
type GlyphKind = "keys" | "schedule" | "recovery";

export function OnboardingGlyph({ kind, delayMs }: { kind: GlyphKind; delayMs: number }) {
  return (
    <span
      aria-hidden="true"
      className="onboarding-glyph inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary"
      style={{ "--glyph-delay": `${delayMs}ms` } as CSSProperties}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {kind === "keys" ? (
          <>
            <rect x="9" y="6" width="12" height="12" rx="3" />
            <circle className="glyph-key glyph-key-1" cx="4" cy="8" r="1.6" fill="currentColor" stroke="none" />
            <circle className="glyph-key glyph-key-2" cx="4" cy="12" r="1.6" fill="currentColor" stroke="none" />
            <circle className="glyph-key glyph-key-3" cx="4" cy="16" r="1.6" fill="currentColor" stroke="none" />
          </>
        ) : kind === "schedule" ? (
          <>
            <circle cx="12" cy="12" r="8" strokeOpacity="0.3" />
            <circle className="glyph-sweep" cx="12" cy="12" r="8" pathLength={1} strokeDasharray="1" transform="rotate(-90 12 12)" />
            <path d="M12 8v4l2.5 1.5" />
          </>
        ) : (
          <>
            <path className="glyph-pulse" d="M2 13h4l2-5 3 9 2-4h3" pathLength={1} strokeDasharray="1" />
            <g className="glyph-recovery-key">
              <circle cx="19" cy="13" r="2.2" />
              <path d="M19 15.2V20M19 18h1.6" />
            </g>
          </>
        )}
      </svg>
    </span>
  );
}
