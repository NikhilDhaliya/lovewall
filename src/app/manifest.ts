import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lovewall",
    short_name: "Lovewall",
    description: "Open-source testimonials.",
    start_url: "/app",
    display: "standalone",
    background_color: "#f4f2ee",
    theme_color: "#f4f2ee",
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { src: "/apple-icon", type: "image/png", sizes: "180x180" },
    ],
  };
}
