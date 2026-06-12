import type { MetadataRoute } from "next";
import { GRAYSTON_COMPANY_NAME } from "@/app/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `PayShield by ${GRAYSTON_COMPANY_NAME}`,
    short_name: "PayShield",
    description:
      "Paycheck control app with customizable protected buckets and safe-spend rules.",
    start_url: "/",
    display: "standalone",
    background_color: "#050607",
    theme_color: "#050607",
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
