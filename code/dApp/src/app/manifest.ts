import type { MetadataRoute } from "next";
import { getTranslations } from "next-intl/server";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const i18n = await getTranslations("AppManifest");
  return {
    name: i18n("name"),
    short_name: i18n("shortName"),
    description: i18n("description"),
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
