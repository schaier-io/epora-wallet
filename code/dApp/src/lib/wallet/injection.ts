// CIP-30 injection detection: checks whether window.cardano exists and waits for
// extension wallets to inject it (poll + "cardano#initialized" event, bounded by
// a timeout) so the wallet list isn't read before extensions finish loading.

export const CARDANO_INJECTION_WAIT_MS = 2_500;
export const CARDANO_INJECTION_POLL_MS = 100;

export function hasCardanoInjection() {
  return typeof window !== "undefined" && typeof window.cardano !== "undefined";
}

export async function waitForCardanoInjection(timeoutMs = CARDANO_INJECTION_WAIT_MS) {
  if (typeof window === "undefined" || hasCardanoInjection()) {
    return;
  }

  await new Promise<void>((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve();
    };

    const checkForInjection = () => {
      if (hasCardanoInjection()) {
        finish();
      }
    };

    const onCardanoInitialized = () => {
      checkForInjection();
    };

    const intervalId = window.setInterval(checkForInjection, CARDANO_INJECTION_POLL_MS);
    const timeoutId = window.setTimeout(finish, timeoutMs);

    const cleanup = () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
      window.removeEventListener("cardano#initialized", onCardanoInitialized as EventListener);
    };

    window.addEventListener(
      "cardano#initialized",
      onCardanoInitialized as EventListener,
      { once: true }
    );

    checkForInjection();
  });
}
