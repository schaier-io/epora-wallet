export function buildContentSecurityPolicy(nonce: string, isDevelopment: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${isDevelopment ? " 'unsafe-eval'" : ""}`,
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
