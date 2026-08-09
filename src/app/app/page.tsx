import type { Metadata } from "next";
import { HouseholdCommandCenter } from "@/app/components/household-command-center";
import { getAppSession } from "@/app/lib/neobank/auth.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "PayShield | Your Money",
  description:
    "See what is safe to spend, protect household obligations, route bills, and manage every paycheck in one place.",
  robots: {
    follow: false,
    index: false,
  },
};

export default async function AppPage() {
  const session = await getAppSession();

  return (
    <main>
      <HouseholdCommandCenter session={session} />
    </main>
  );
}
