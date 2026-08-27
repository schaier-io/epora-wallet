import type { MetadataRoute } from "next";
import { createDefaultTranslator } from "@/i18n/default-translator";
import defaultMessages from "@/i18n/generated/default-en/AppManifest.json";

const i18n = createDefaultTranslator("AppManifest", defaultMessages);

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Epora Wallet: Shared Cardano wallet with recovery",
    short_name: "Epora Wallet",
    description:
      i18n("aNonCustodialCardanoWalletYouShareAcross"),
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
