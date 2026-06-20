import { ShieldCheck } from "lucide-react";
import { PayShieldHeaderLogo } from "@/app/components/pay-shield-mark";

type RouteLoadingShellProps = {
  kicker: string;
  steps: string[];
  title: string;
};

export function RouteLoadingShell({
  kicker,
  steps,
  title,
}: RouteLoadingShellProps) {
  return (
    <main className="pay-app-shell min-h-screen text-[#f7f8fb]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="pay-header">
          <span className="pay-header-brand min-w-0">
            <PayShieldHeaderLogo priority />
          </span>
          <div className="h-10 w-full rounded-[8px] border border-white/10 bg-black/35 sm:w-[24rem]" />
        </header>

        <section className="grid flex-1 items-center gap-6 py-8 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="brand-panel accent-rule rounded-[8px] p-5 sm:p-7">
            <p className="inline-flex items-center gap-2 rounded-[8px] border border-[#39e8ff]/30 bg-[#39e8ff]/10 px-3 py-2 text-sm font-black uppercase text-[#dffaff]">
              <ShieldCheck className="size-4" aria-hidden="true" />
              {kicker}
            </p>
            <h1 className="mt-6 max-w-3xl text-4xl font-black leading-[1.16] text-white sm:text-5xl">
              {title}
            </h1>
            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              {["Revenue", "Banks", "Ledger"].map((label) => (
                <div
                  className="route-loading-shimmer h-24 rounded-[8px] border border-white/10 bg-white/[0.045] p-4"
                  key={label}
                >
                  <p className="brand-kicker">{label}</p>
                  <div className="mt-4 h-4 w-3/4 rounded-full bg-white/10" />
                  <div className="mt-3 h-3 w-1/2 rounded-full bg-white/10" />
                </div>
              ))}
            </div>
          </div>

          <div className="brand-panel rounded-[8px] p-4 sm:p-5">
            <p className="brand-kicker">Preparing operating flow</p>
            <div className="mt-4 grid gap-3">
              {steps.map((step, index) => (
                <div
                  className="route-loading-shimmer rounded-[8px] border border-white/10 bg-black/35 p-4"
                  key={step}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-black uppercase text-[#8f99aa]">
                      {String(index + 1).padStart(2, "0")} / step
                    </p>
                    <span className="h-6 w-24 rounded-[8px] bg-[#ffb237]/15" />
                  </div>
                  <p className="mt-2 text-base font-black text-white">{step}</p>
                  <div className="mt-3 h-3 w-full rounded-full bg-white/10" />
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
