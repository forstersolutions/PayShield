import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Geist, Geist_Mono } from "next/font/google";
import {
  GRAYSTON_COMPANY_NAME,
  REGULATED_PARTNER_DISCLOSURE,
} from "@/app/lib/brand";
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
  title: "PayShield by Grayston | Paycheck Control App",
  description:
    "PayShield by Grayston Technologies is paycheck control software built around Safe to Spend, customizable protected buckets, and provider-ready operating controls.",
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
    title: `PayShield by ${GRAYSTON_COMPANY_NAME}`,
    description: REGULATED_PARTNER_DISCLOSURE,
    images: [
      {
        url: socialImageUrl,
        width: 1536,
        height: 1024,
        alt: "PayShield logo and Grayston-branded paycheck control dashboard",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `PayShield by ${GRAYSTON_COMPANY_NAME}`,
    description: REGULATED_PARTNER_DISCLOSURE,
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
