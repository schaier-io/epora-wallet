import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/env/server-env";

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
    }
  ];
}
