import createNextIntlPlugin from "next-intl/plugin";

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Do NOT add `experimental.optimizePackageImports: ["lucide-react"]` here:
  // under Turbopack dev it explodes memory to ~80GB and OOM-crashes the machine.
  // lucide-react tree-shakes fine without it, and the production build never
  // relied on it.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  }
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
