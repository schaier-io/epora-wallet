"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren
} from "react";

type SwitchHandler = () => void;

type SmartWalletDisplayState = {
  name: string | null;
  /** Number of other smart wallets the signer could switch to. */
  alternativeCount: number;
  /** When set, used by external UI (e.g. top nav) to open the picker. */
  onSwitch: SwitchHandler | null;
  /** Deterministic seed used to colour the identity orb on hero and pill. */
  identitySeed: string | null;
};

type SmartWalletDisplayContextValue = SmartWalletDisplayState & {
  publish: (next: Partial<SmartWalletDisplayState>) => void;
  reset: () => void;
};

const INITIAL: SmartWalletDisplayState = {
  name: null,
  alternativeCount: 0,
  onSwitch: null,
  identitySeed: null
};

const SmartWalletDisplayContext = createContext<SmartWalletDisplayContextValue | null>(null);

export function SmartWalletDisplayProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<SmartWalletDisplayState>(INITIAL);

  const publish = useCallback((next: Partial<SmartWalletDisplayState>) => {
    setState((prev) => ({ ...prev, ...next }));
  }, []);

  const reset = useCallback(() => setState(INITIAL), []);

  const value = useMemo<SmartWalletDisplayContextValue>(
    () => ({ ...state, publish, reset }),
    [state, publish, reset]
  );

  return (
    <SmartWalletDisplayContext.Provider value={value}>
      {children}
    </SmartWalletDisplayContext.Provider>
  );
}

export function useSmartWalletDisplay() {
  const ctx = useContext(SmartWalletDisplayContext);
  if (!ctx) {
    throw new Error("useSmartWalletDisplay must be used inside SmartWalletDisplayProvider.");
  }
  return ctx;
}

/**
 * Deterministic colour pair derived from a seed string (typically the wallet's
 * locking address or unit). Same seed always produces the same hues so the
 * "identity orb" reads as a stable visual fingerprint of the wallet.
 */
export function walletIdentityPalette(seed: string | null | undefined) {
  if (!seed) {
    return { hue1: 188, hue2: 168, sat: 70, light: 52 };
  }
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const abs = Math.abs(hash);
  const hue1 = abs % 360;
  // Offset second hue so the orb always has a visible gradient sweep rather
  // than landing on a flat blob.
  const hue2 = (hue1 + 35 + ((abs >> 4) % 50)) % 360;
  // Keep saturation/lightness in a band that reads on dark backgrounds.
  const sat = 60 + ((abs >> 8) % 25);
  const light = 48 + ((abs >> 12) % 12);
  return { hue1, hue2, sat, light };
}
