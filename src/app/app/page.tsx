import { NeobankDashboard } from "@/app/components/neobank-dashboard";
import { SiteFooter } from "@/app/components/site-footer";

export default function AppPage() {
  return (
    <main className="bg-[#17130f] text-[#f9efe1]">
      <NeobankDashboard />
      <SiteFooter />
    </main>
  );
}
