import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PayShield",
    short_name: "PayShield",
    description:
      "Paycheck planning app that shows what is safe to spend.",
    start_url: "/",
    display: "standalone",
    background_color: "#17130f",
    theme_color: "#211b16",
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
