import { focusManager } from "@tanstack/react-query";

export const QUERY_ACTIVITY_IDLE_MS = 5 * 60_000;
const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "click", "keydown", "scroll"] as const;

/** Query intervals already consult focusManager. A visible idle page can sleep too. */
export function installQueryActivityTracking(): () => void {
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const markActive = () => {
    clearTimeout(idleTimer);
    const visible = document.visibilityState !== "hidden";
    focusManager.setFocused(visible);
    if (visible) {
      idleTimer = setTimeout(() => focusManager.setFocused(false), QUERY_ACTIVITY_IDLE_MS);
    }
  };
  ACTIVITY_EVENTS.forEach(event => window.addEventListener(event, markActive, { passive: true }));
  document.addEventListener("visibilitychange", markActive);
  markActive();
  return () => {
    clearTimeout(idleTimer);
    ACTIVITY_EVENTS.forEach(event => window.removeEventListener(event, markActive));
    document.removeEventListener("visibilitychange", markActive);
    focusManager.setFocused(undefined);
  };
}
