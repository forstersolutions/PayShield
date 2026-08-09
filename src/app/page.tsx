import { NeobankDashboard } from "@/app/components/neobank-dashboard";
import { SiteFooter } from "@/app/components/site-footer";

export default function HomePage() {
  return (
    <main className="bg-[#0b0d12] text-[#f7f8fb]">
      <NeobankDashboard />
      <SiteFooter showLaunchLink={false} />
    </main>
  );
}
