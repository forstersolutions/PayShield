import { NeobankDashboard } from "@/app/components/neobank-dashboard";
import { SiteFooter } from "@/app/components/site-footer";

export default function AppPage() {
  return (
    <main className="bg-[#050607] text-[#f7f8fb]">
      <NeobankDashboard />
      <SiteFooter />
    </main>
  );
}
