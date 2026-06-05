import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PayShield",
    short_name: "PayShield",
    description:
      "Paycheck planning app for bills, reserves, and safe-to-spend decisions.",
    start_url: "/",
    display: "standalone",
    background_color: "#05070a",
    theme_color: "#0b1017",
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
