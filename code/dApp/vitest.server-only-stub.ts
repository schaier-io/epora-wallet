// `server-only` has no package of its own: Next.js resolves that specifier
// internally at build time, so vite cannot find it and any test that imports a
// server module fails to transform. This empty stub stands in for it under
// vitest. It changes nothing about the guard in a real build.
export {};
