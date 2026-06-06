import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PayShield",
    short_name: "PayShield",
    description:
      "Paycheck planning app that subtracts obligations before spending starts.",
    start_url: "/",
    display: "standalone",
    background_color: "#050605",
    theme_color: "#10110f",
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
