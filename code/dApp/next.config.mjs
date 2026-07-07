/** @type {import('next').NextConfig} */
const nextConfig = {
  // Do NOT add `experimental.optimizePackageImports: ["lucide-react"]` here:
  // under Turbopack dev it explodes memory to ~80GB and OOM-crashes the machine.
  // lucide-react tree-shakes fine without it, and the production build never
  // relied on it.
};

export default nextConfig;
