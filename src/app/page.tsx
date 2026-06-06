import {
  AlertTriangle,
  CheckCircle2,
  Lock,
  RefreshCcw,
  ShieldCheck,
  SlidersHorizontal,
  WalletCards,
} from "lucide-react";
import { PaycheckPlanner } from "@/app/components/paycheck-planner";
import { SiteFooter } from "@/app/components/site-footer";

export default function HomePage() {
  return (
    <main className="bg-[#050605] text-[#f8f1e3]">
      <PaycheckPlanner />

      <section id="difference" className="border-b border-[#263026] bg-[#080a08]">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-18 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#f2a65a]">
              What PayShield does that others do not
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-[#fff9ed] sm:text-4xl">
              A balance tells you what exists. PayShield tells you what survives.
            </h2>
            <p className="mt-4 text-lg leading-8 text-[#cdd8ce]">
              Banks show the raw number. Budget apps explain the aftermath.
              PayShield sits before the decision and turns a paycheck into one
              usable number after life has already been covered.
            </p>
          </div>

          <div className="grid gap-3">
            {positioning.map((item) => {
              const Icon = item.icon;

              return (
                <article
                  className="grid gap-4 border border-[#263026] bg-[#101410] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.24)] sm:grid-cols-[44px_1fr]"
                  key={item.title}
                >
                  <span className="grid size-11 place-items-center bg-[#050605] text-[#9dffb3]">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold text-[#fff9ed]">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[#aeb8ad]">
                      {item.body}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-b border-[#263026] bg-[#050605]">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-18 sm:px-6 lg:grid-cols-[0.86fr_1.14fr] lg:px-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#9dffb3]">
              Market language
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-[#fff9ed] sm:text-4xl">
              Lines that sell the missing layer, not another budgeting chore.
            </h2>
            <p className="mt-4 text-lg leading-8 text-[#cdd8ce]">
              The promise is simple: before a household spends, PayShield shows
              what is left after obligations, goals, and recovery have already
              taken their share.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {taglines.map((line) => (
              <article
                className="border border-[#263026] bg-[#0b0f0b] p-5 shadow-[0_16px_60px_rgba(0,0,0,0.22)] transition hover:border-[#9dffb3]/40 hover:bg-[#101610]"
                key={line}
              >
                <p className="text-xl font-semibold leading-7 text-[#fff9ed]">
                  {line}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="ready" className="bg-[#080a08] text-[#f8f1e3]">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#f2a65a]">
              Commercial surface
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-[#fff9ed] sm:text-4xl">
              Open PayShield. Build the usable number. Export the household plan.
            </h2>
            <p className="mt-4 max-w-3xl text-lg leading-8 text-[#cdd8ce]">
              The product experience starts immediately. Plans persist on the
              device, the workflow avoids bank credentials, and the current
              paycheck model exports as structured data for review.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                className="inline-flex items-center justify-center bg-[#9dffb3] px-5 py-3 text-sm font-semibold text-[#06120a] shadow-[0_16px_40px_rgba(157,255,179,0.18)] hover:bg-[#c6ffd2]"
                href="#product"
              >
                Open planner
              </a>
              <a
                className="inline-flex items-center justify-center border border-[#263026] bg-[#101410] px-5 py-3 text-sm font-semibold text-[#fff9ed] hover:border-[#9dffb3]/60"
                href="#buckets"
              >
                Tune buckets
              </a>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {commercialReadiness.map((item) => {
              const Icon = item.icon;

              return (
                <article
                  className="border border-[#263026] bg-[#101410] p-4 shadow-[0_16px_60px_rgba(0,0,0,0.22)]"
                  key={item.title}
                >
                  <Icon className="size-5 text-[#f2a65a]" aria-hidden="true" />
                  <h3 className="mt-3 text-base font-semibold text-[#fff9ed]">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[#cdd8ce]">
                    {item.body}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

const positioning = [
  {
    title: "Balances show the pile. PayShield shows the usable slice.",
    body: "The headline number is not spendable until rent, vehicles, insurance, family needs, and goals have already taken their place.",
    icon: SlidersHorizontal,
  },
  {
    title: "Budget apps document the past. PayShield controls the next swipe.",
    body: "The purchase check happens before spending, so the household sees whether a decision fits the protected paycheck plan.",
    icon: ShieldCheck,
  },
  {
    title: "Spreadsheets need upkeep. PayShield gives the week one answer.",
    body: "The current paycheck, bucket coverage, shortfalls, purchase decision, and recovery path export as one structured plan.",
    icon: RefreshCcw,
  },
  {
    title: "Private by default. No bank login required.",
    body: "The app works as a private planning surface, so households can get clarity without handing over credentials or account numbers.",
    icon: Lock,
  },
];

const taglines = [
  "The balance is bait. The usable number is the truth.",
  "Payday gets organized before spending gets a vote.",
  "Bills first. Swipe second. Peace all week.",
  "A banking balance says what exists. PayShield says what survives.",
  "Every dollar gets a job before impulse gets a chance.",
  "Stop asking what is left. Know what is usable.",
];

const commercialReadiness = [
  {
    title: "Available immediately",
    body: "The product experience starts on the homepage; there is no invite form or sales gate.",
    icon: CheckCircle2,
  },
  {
    title: "Saved locally",
    body: "Paycheck, bucket, purchase, and recovery settings persist on the device between visits.",
    icon: ShieldCheck,
  },
  {
    title: "Exportable plan",
    body: "The current paycheck model can be downloaded as a structured JSON file for household review.",
    icon: WalletCards,
  },
  {
    title: "Boundaries are clear",
    body: "PayShield is planning software, not a bank account, card, or money-movement product.",
    icon: AlertTriangle,
  },
];
