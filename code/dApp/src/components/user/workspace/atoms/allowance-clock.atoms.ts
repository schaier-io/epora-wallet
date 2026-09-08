import { atom } from "jotai";

const ALLOWANCE_CLOCK_INTERVAL_MS = 1_000;

/** Allowance eligibility changes with time; streaming quotes retain their separate fixed clock. */
export const allowanceNowMsAtom = atom(Date.now());
allowanceNowMsAtom.onMount = setNow => {
  const refresh = () => setNow(Date.now());
  refresh();
  const timer = setInterval(refresh, ALLOWANCE_CLOCK_INTERVAL_MS);
  if (typeof window !== "undefined") window.addEventListener("focus", refresh);
  return () => {
    clearInterval(timer);
    if (typeof window !== "undefined") window.removeEventListener("focus", refresh);
  };
};
