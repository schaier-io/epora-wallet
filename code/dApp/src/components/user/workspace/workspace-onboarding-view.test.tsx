import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WorkspaceOnboardingView } from "@/components/user/workspace/workspace-onboarding-view";

/**
 * This card is the first screen of the product: `/` redirects to `/user`, and a visitor with
 * no wallet connected sees nothing else. So the state that matters is the one the server
 * sends, before any JavaScript runs.
 *
 * It used to be wrapped in `AnimatedContent`, which sets `opacity: 0` as an inline style and
 * clears it from an effect. Hydration on this route waits on the whole Cardano stack, so the
 * server sent the copy and then hid it: the reader got a blank panel until the bundle
 * arrived. The entrance is a stylesheet animation now, so the markup below is painted as
 * soon as the CSS lands.
 *
 * The assertion is on the static markup rather than on a jsdom render, because a render runs
 * the effects that hid the bug in the first place.
 */
describe("workspace onboarding, before hydration", () => {
  it("sends no element that starts hidden", () => {
    const markup = renderToStaticMarkup(<WorkspaceOnboardingView />);

    expect(markup).not.toMatch(/opacity\s*:\s*0(?![.\d])/);
  });

  it("fades in from the stylesheet", () => {
    const markup = renderToStaticMarkup(<WorkspaceOnboardingView />);

    expect(markup).toContain("section-transition");
  });
});
