import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/env/server-env";
import { LEGAL_PATHS } from "@/lib/legal";

const siteUrl = getSiteUrl();

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    {
      url: `${siteUrl}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1
    },
    {
      url: `${siteUrl}/user`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9
    },
    ...LEGAL_PATHS.map((path) => ({
      url: `${siteUrl}${path}`,
      changeFrequency: "yearly" as const,
      priority: 0.3
    }))
  ];
}
