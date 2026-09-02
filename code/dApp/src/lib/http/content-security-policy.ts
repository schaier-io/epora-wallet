export function buildContentSecurityPolicy(nonce: string, isDevelopment: boolean): string {
  return [
    "default-src 'self'",
    // 'wasm-unsafe-eval' lets the Cardano libraries compile their WebAssembly
    // hashing modules; without it the browser logs a CSP violation and falls
    // back to slower JavaScript. Full 'unsafe-eval' stays development-only.
    `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    // Authored components currently use React style attributes. Keeping inline
    // styles does not re-enable JavaScript execution; scripts require the nonce.
    "style-src 'self' 'unsafe-inline'",
    // Token metadata can point at any HTTPS image host. Images remain isolated
    // from script execution while preserving third-party asset logos.
    "img-src 'self' blob: data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.walletconnect.com https://*.walletconnect.org https://*.reown.com wss://*.walletconnect.com wss://*.walletconnect.org",
    "frame-src 'self' https://verify.walletconnect.com https://verify.walletconnect.org",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDevelopment ? [] : ["upgrade-insecure-requests"])
  ].join("; ");
}
