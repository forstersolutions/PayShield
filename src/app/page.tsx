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
    <main className="bg-[#070604] text-[#f5efe4]">
      <PaycheckPlanner />

      <section className="border-b border-[#2d281f] bg-[#0d0b09]">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-18 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#d89b57]">
              What others miss
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-[#fff6e8] sm:text-4xl">
              Your balance is not your budget. It is the raw material.
            </h2>
            <p className="mt-4 text-lg leading-8 text-[#d7d0c1]">
              Banks show what arrived. Budget apps explain what already
              happened. PayShield does the missing job: it protects the paycheck
              first, then shows the money that can actually be used.
            </p>
          </div>

          <div className="grid gap-3">
            {positioning.map((item) => {
              const Icon = item.icon;

              return (
                <article
                  className="grid gap-4 border border-[#2d281f] bg-[#14120e] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.24)] sm:grid-cols-[44px_1fr]"
                  key={item.title}
                >
                  <span className="grid size-11 place-items-center bg-[#211b13] text-[#7ee0a3]">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold text-[#fff6e8]">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[#b9ad99]">
                      {item.body}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-b border-[#2d281f] bg-[#070604]">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-18 sm:px-6 lg:grid-cols-[0.86fr_1.14fr] lg:px-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#7ee0a3]">
              Market message
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-[#fff6e8] sm:text-4xl">
              Clever lines for a product that earns the claim.
            </h2>
            <p className="mt-4 text-lg leading-8 text-[#d7d0c1]">
              The brand should sound useful, direct, and a little sharp. The
              product does what ordinary balances do not: it subtracts life
              before spending begins.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {taglines.map((line) => (
              <article
                className="border border-[#2d281f] bg-[#11100d] p-5 shadow-[0_16px_60px_rgba(0,0,0,0.22)]"
                key={line}
              >
                <p className="text-xl font-semibold leading-7 text-[#fff6e8]">
                  {line}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="ready" className="bg-[#0d0b09] text-[#f5efe4]">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#d89b57]">
              Commercial surface
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-[#fff6e8] sm:text-4xl">
              Open the planner. Build the plan. Export the truth.
            </h2>
            <p className="mt-4 max-w-3xl text-lg leading-8 text-[#d7d0c1]">
              The planner is available on the first screen. It stores the plan
              locally, keeps sensitive bank credentials out of the workflow, and
              lets a household export the current plan when it is time to share
              or review it.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                className="inline-flex items-center justify-center bg-[#d89b57] px-5 py-3 text-sm font-semibold text-[#120d07] shadow-[0_16px_40px_rgba(216,155,87,0.22)] hover:bg-[#f0b86f]"
                href="#product"
              >
                Open planner
              </a>
              <a
                className="inline-flex items-center justify-center border border-[#3a3328] bg-[#171510] px-5 py-3 text-sm font-semibold text-[#fff6e8] hover:border-[#7ee0a3]/60"
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
                  className="border border-[#2d281f] bg-[#14120e] p-4 shadow-[0_16px_60px_rgba(0,0,0,0.22)]"
                  key={item.title}
                >
                  <Icon className="size-5 text-[#d89b57]" aria-hidden="true" />
                  <h3 className="mt-3 text-base font-semibold text-[#fff6e8]">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[#d7d0c1]">
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
    title: "Balances show everything. PayShield shows the usable truth.",
    body: "The headline number is not the spendable number until rent, vehicles, insurance, family needs, and goals are already handled.",
    icon: SlidersHorizontal,
  },
  {
    title: "Budgets explain the past. PayShield shapes the next swipe.",
    body: "The purchase check happens before spending, so the household sees whether a decision fits the protected paycheck plan.",
    icon: ShieldCheck,
  },
  {
    title: "Spreadsheets need maintenance. PayShield creates a shareable plan.",
    body: "The current paycheck, bucket coverage, shortfalls, purchase decision, and recovery path can be exported in one structured file.",
    icon: RefreshCcw,
  },
  {
    title: "No bank login required. No sensitive account details needed.",
    body: "The app works as a private planning surface first, so households can get clarity without handing over credentials.",
    icon: Lock,
  },
];

const taglines = [
  "Balances lie. PayShield tells you what is actually safe to spend.",
  "Spend from the money left after life is covered.",
  "Payday, protected before the first swipe.",
  "The paycheck planner that subtracts obligations before temptation.",
  "Know the usable number, not just the account number.",
  "A calmer week starts with the part of the check you can really use.",
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
    body: "The current plan can be downloaded as a structured JSON file for household review.",
    icon: WalletCards,
  },
  {
    title: "Boundaries are clear",
    body: "PayShield is planning software, not a bank account, card, or money-movement product.",
    icon: AlertTriangle,
  },
];
