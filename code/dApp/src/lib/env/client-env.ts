// Client-exposed environment values. NEXT_PUBLIC_* vars must be read as
// literal `process.env.NEXT_PUBLIC_X` property accesses so Next can inline
// them into the client bundle at build time — they cannot go through the
// dynamic schema in ./server-env.ts.

export const WALLETCONNECT_PROJECT_ID: string | undefined =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() || undefined;
