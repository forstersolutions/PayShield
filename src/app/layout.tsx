import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL || "https://payshield.vercel.app";
const socialImageUrl = "/images/payshield-social-card.jpg";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  applicationName: "PayShield",
  metadataBase: new URL(siteUrl),
  title: "PayShield | Paycheck Planning App",
  description:
    "PayShield subtracts obligations before spending starts, so households can see what is actually safe to spend.",
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: ["/icon.svg"],
    apple: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "PayShield",
    description:
      "Spend from the money left after life is covered.",
    images: [
      {
        url: socialImageUrl,
        width: 1536,
        height: 1024,
        alt: "PayShield protected paycheck product mockup",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PayShield",
    description:
      "Spend from the money left after life is covered.",
    images: [socialImageUrl],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <body className="flex min-h-full flex-col antialiased">
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
