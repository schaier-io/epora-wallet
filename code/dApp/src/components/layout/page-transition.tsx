import { ViewTransition, type ReactNode } from "react";

/**
 * Slides a page in from the side its nav tab lies on. The nav links tag each navigation
 * `nav-forward` or `nav-back` (`top-nav.tsx`); anything untagged (browser back, a refresh,
 * a Suspense reveal) does not animate. Lives in each `page.tsx` because a layout persists
 * across navigations and never enters or exits.
 */
const directional = { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" };

export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter={directional} exit={directional} default="none">
      {children}
    </ViewTransition>
  );
}
