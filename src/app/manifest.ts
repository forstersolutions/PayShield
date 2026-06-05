import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PayShield",
    short_name: "PayShield",
    description:
      "Protected-paycheck prototype for bill buckets, goal reserves, and safe-to-spend planning.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f5ef",
    theme_color: "#1c1917",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
