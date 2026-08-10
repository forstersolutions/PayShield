import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Get PayShield",
  description: "Download PayShield for iPhone or Android.",
  robots: {
    follow: false,
    index: false,
  },
};

export default function AppPage() {
  redirect("/download");
}
