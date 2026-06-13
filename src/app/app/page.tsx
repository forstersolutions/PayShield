import type { Metadata } from "next";
import { HouseholdCommandCenter } from "@/app/components/household-command-center";
import { SiteFooter } from "@/app/components/site-footer";

export const metadata: Metadata = {
  title: "PayShield App | Household Command Center",
  description:
    "PayShield household command center for safe-spend visibility, protected buckets, bill routing, ledger evidence, and activation gates.",
  robots: {
    follow: false,
    index: false,
  },
};

export default function AppPage() {
  return (
    <main className="bg-[#050607] text-[#f7f8fb]">
      <HouseholdCommandCenter />
      <SiteFooter />
    </main>
  );
}
