import { PayShieldHeaderLogo } from "@/app/components/pay-shield-mark";

const skeletonRows = [
  "Turn on paid access",
  "Connect the bank source",
  "Build the rules",
  "Detect the paycheck",
  "Approve or decline",
];

const moneyPath = [
  "Commercial access",
  "Bank connection",
  "Income intake",
  "Priority split",
  "Safe-spend decision",
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
            <p className="inline-flex items-center gap-2 rounded-[8px] border border-[#39e8ff]/30 bg-[#39e8ff]/10 px-3 py-2 text-sm font-black text-[#dffaff]">
              Household command center
            </p>
            <h1 className="mt-6 max-w-2xl text-4xl font-black leading-[1.02] text-white sm:text-5xl lg:text-[3.3rem]">
              One operating screen for the paycheck.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[#c9d0da]">
              Safe to Spend, protected buckets, money operations, and routing
              controls are coming online together.
            </p>

            <div className="mt-7 rounded-[8px] border border-[#1588ff]/30 bg-[#07111f]/78 p-5">
              <p className="text-sm font-black uppercase text-[#39e8ff]">
                Safe to Spend
              </p>
              <div className="mt-4 h-14 w-56 rounded-[8px] bg-white/12" />
              <div className="mt-5 h-3 overflow-hidden rounded-full bg-black/60">
                <div className="h-full w-2/3 bg-gradient-to-r from-[#1588ff] to-[#39e8ff]" />
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="brand-panel rounded-[8px] p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="brand-kicker">Household setup</p>
                  <h2 className="mt-1 text-2xl font-black text-white">
                    Start with one clear next move.
                  </h2>
                </div>
                <span className="rounded-[8px] border border-[#39e8ff]/25 bg-[#39e8ff]/10 px-3 py-2 text-sm font-black text-[#dffaff]">
                  3/6 active
                </span>
              </div>

              <div className="mt-5 rounded-[8px] border border-[#ffb237]/30 bg-[#ffb237]/10 p-4">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-[#ffcf72]">
                  Next best action
                </p>
                <p className="mt-1 text-base font-black text-white">
                  Turn on paid access
                </p>
                <p className="mt-1 text-sm leading-6 text-[#ffe4bd]">
                  Checkout is the revenue switch before bank connection,
                  paycheck detection, and protected spend decisions.
                </p>
              </div>

              <div className="mt-5 grid gap-2">
                {skeletonRows.map((row, index) => (
                  <div
                    className="grid grid-cols-[2.25rem_1fr_auto] items-center gap-3 rounded-[8px] border border-white/10 bg-black/40 p-3"
                    key={row}
                  >
                    <span className="grid size-9 place-items-center rounded-[8px] bg-[#39e8ff] text-sm font-black text-[#050607]">
                      {index + 1}
                    </span>
                    <p className="text-sm font-black text-white">{row}</p>
                    <span className="rounded-[8px] bg-white/[0.06] px-2.5 py-1 text-xs font-black text-[#d9dde5]">
                      Loading
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="brand-panel-soft rounded-[8px] p-5">
              <p className="brand-kicker">Command queue</p>
              <h2 className="mt-1 text-2xl font-black text-white">
                Jump straight to the tool.
              </h2>
              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {["Activate access", "Connect bank", "Detect paycheck"].map(
                  (item) => (
                    <span
                      className="grid min-h-16 place-items-center rounded-[8px] border border-white/10 bg-black/35 p-3 text-center text-sm font-black text-white"
                      key={item}
                    >
                      {item}
                    </span>
                  ),
                )}
              </div>
            </div>

            <div className="brand-panel-soft rounded-[8px] p-5">
              <p className="brand-kicker">Money path</p>
              <div className="mt-5 grid gap-2">
                {moneyPath.map((step, index) => (
                  <div
                    className="grid grid-cols-[2rem_1fr] items-center gap-3 rounded-[8px] border border-white/10 bg-black/35 p-3"
                    key={step}
                  >
                    <span className="grid size-8 place-items-center rounded-[8px] bg-[#39e8ff] text-sm font-black text-[#050607]">
                      {index + 1}
                    </span>
                    <p className="text-sm font-black text-white">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
