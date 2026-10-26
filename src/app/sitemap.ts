import type { MetadataRoute } from "next";
import { GUIDES } from "@/lib/guides";

const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${appUrl}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${appUrl}/guides`, changeFrequency: "monthly", priority: 0.7 },
    ...GUIDES.map((g) => ({ url: `${appUrl}/guides/${g.slug}`, changeFrequency: "monthly" as const, priority: 0.6 })),
    { url: `${appUrl}/docs/api`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${appUrl}/docs/mcp`, changeFrequency: "monthly", priority: 0.5 },
  ];
}
