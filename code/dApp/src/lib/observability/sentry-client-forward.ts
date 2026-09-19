// Client-side counterpart to `sentry-forward.ts`, covering unexpected caught
// failures in the browser (build/sign/submit errors the workspace explains to
// the reader). No page bundle may contain the browser SDK: credential-free
// builds ship none, and even credential-bearing builds load it through the
// DSN-gated dynamic import in `instrumentation-client.ts`, which never fires
// without a DSN. This module keeps that shape: the DSN (inlined at build
// time) gates everything, and the SDK is only ever touched through the same
// dynamic import, so a reported failure costs an async-chunk fetch, never a
// bundle dependency. The scrubber from `sentry-options.ts` runs on every
// event, and the decline filter drops expected user decisions.

type ClientErrorContext = Record<string, unknown>;

/**
 * Forward one unexpected client-side failure. The live error goes through
 * unserialized, so Sentry groups by the real class and follows the `cause`
 * chain; anything extra rides in `extra`, where the scrubber still applies.
 * Routine wallet rejections must never be passed here: the call sites guard
 * on the parsed error's `expected` flag, matching the server seam's
 * "one report per failure" contract.
 */
export function captureClientError(
  event: string,
  error: unknown,
  context: ClientErrorContext = {}
): void {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  // Trim to match the init gate in `sentry-options.ts`: a whitespace-only DSN
  // must not open the capture gate while closing the init gate.
  if (typeof dsn !== "string" || dsn.trim().length === 0) {
    return;
  }
  void import("@sentry/nextjs")
    .then((sentryModule) => {
      // Bundled client builds expose the named export directly; some loaders
      // (CJS interop under tsx/node) hand the dynamic import a partial
      // namespace whose full surface rides on `default`. Resolve either shape.
      const capture =
        sentryModule.captureException ??
        (sentryModule as unknown as { default?: typeof sentryModule }).default?.captureException;
      capture?.(error, { extra: { logEvent: event, ...context } });
    })
    .catch(() => {
      // Reporting sits inside an error path that already shows a diagnostic;
      // a failed report must never become the louder failure.
    });
}
