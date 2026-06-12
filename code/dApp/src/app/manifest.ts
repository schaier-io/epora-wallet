import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Epora Wallet — Shared Cardano wallet with recovery",
    short_name: "Epora Wallet",
    description:
      "A non-custodial Cardano wallet you share across owners and spenders — on-chain daily limits, multisig, scheduled ADA payments, and key recovery if a signer is lost.",
    start_url: "/user",
    display: "standalone",
    background_color: "#0E1F2D",
    theme_color: "#0E1F2D",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml"
      },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png"
      }
    ]
  };
}
