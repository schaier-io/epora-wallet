// Build-time feature flags from public env.
//
// WalletConnect is fully wired (provider + client + pairing UI) but cannot yet
// sign or submit: there is no CIP-30 bridge feeding a paired session into the
// active-wallet atoms, so signing always goes through the injected browser
// wallet. The pairing UI is therefore shipped OFF by default to avoid
// presenting a non-functional flow. Set NEXT_PUBLIC_WALLETCONNECT_ENABLED=true
// to surface the preview (e.g. while building out the signing bridge).
export const WALLETCONNECT_ENABLED =
  process.env.NEXT_PUBLIC_WALLETCONNECT_ENABLED === "true";
