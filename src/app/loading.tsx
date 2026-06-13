import { PayShieldHeaderLogo } from "@/app/components/pay-shield-mark";

const skeletonRows = [
  "Safe to Spend",
  "Protected buckets",
  "Money operations",
  "Routing controls",
];

export default function Loading() {
  return (
    <main
      aria-busy="true"
      className="pay-app-shell relative min-h-screen overflow-hidden text-[#f7f8fb]"
    >
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="pay-header">
          <div className="pay-header-brand min-w-0">
            <PayShieldHeaderLogo priority />
          </div>
          <div className="pay-primary-nav rounded-[8px] border border-white/10 bg-black/40 p-1">
            {Array.from({ length: 6 }, (_, index) => (
              <span
                aria-hidden="true"
                className="h-10 rounded-[8px] bg-white/8"
                key={index}
              />
            ))}
          </div>
        </header>

        <section className="grid flex-1 gap-6 py-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="brand-panel accent-rule rounded-[8px] p-5 sm:p-7">
            <p className="brand-kicker">Loading PayShield</p>
            <div className="mt-6 h-12 max-w-xl rounded-[8px] bg-white/10" />
            <div className="mt-4 h-4 max-w-2xl rounded-full bg-white/10" />
            <div className="mt-3 h-4 max-w-lg rounded-full bg-white/8" />

            <div className="mt-7 rounded-[8px] border border-[#1588ff]/30 bg-[#07111f]/78 p-5">
              <div className="h-4 w-32 rounded-full bg-[#39e8ff]/24" />
              <div className="mt-4 h-14 w-56 rounded-[8px] bg-white/12" />
              <div className="mt-5 h-3 overflow-hidden rounded-full bg-black/60">
                <div className="h-full w-2/3 bg-gradient-to-r from-[#1588ff] to-[#39e8ff]" />
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            {skeletonRows.map((row, index) => (
              <div className="brand-panel-soft rounded-[8px] p-4" key={row}>
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-[8px] bg-[#39e8ff] text-sm font-black text-[#050607]">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-white">{row}</p>
                    <div className="mt-2 h-3 w-full max-w-sm rounded-full bg-white/10" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
