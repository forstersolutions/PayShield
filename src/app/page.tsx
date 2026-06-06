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
    <main className="bg-[#17130f] text-[#f9efe1]">
      <PaycheckPlanner />

      <section id="difference" className="border-b border-[#3a3027] bg-[#211b16]">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-18 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#edb981]">
              What PayShield does that others do not
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-[#fff4e8] sm:text-4xl">
              A balance shows the total. PayShield shows what is safe to use.
            </h2>
            <p className="mt-4 text-lg leading-8 text-[#d6c8b8]">
              Banks show what arrived. Budget apps explain where money went.
              PayShield sits before the next decision and turns a paycheck into
              one plain safe-to-spend number after bills, goals, and recovery
              are handled.
            </p>
          </div>

          <div className="grid gap-3">
            {positioning.map((item) => {
              const Icon = item.icon;

              return (
                <article
                  className="grid rounded-[8px] border border-[#3a3027] bg-[#17130f]/78 p-5 shadow-[0_20px_70px_rgba(0,0,0,0.2)] sm:grid-cols-[44px_1fr]"
                  key={item.title}
                >
                  <span className="grid size-11 place-items-center rounded-[8px] bg-[#261f19] text-[#b8e7c5]">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold text-[#fff4e8]">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[#b7aa9b]">
                      {item.body}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-b border-[#3a3027] bg-[#17130f]">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-18 sm:px-6 lg:grid-cols-[0.86fr_1.14fr] lg:px-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#b8e7c5]">
              Simple language
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-[#fff4e8] sm:text-4xl">
              Clear promises for a calmer paycheck week.
            </h2>
            <p className="mt-4 text-lg leading-8 text-[#d6c8b8]">
              The pitch is not another budgeting chore. It is the answer people
              wish their banking app gave them: what can I safely use right
              now?
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {taglines.map((line) => (
              <article
                className="rounded-[8px] border border-[#3a3027] bg-[#211b16] p-5 shadow-[0_16px_54px_rgba(0,0,0,0.18)] transition hover:border-[#b8e7c5]/40 hover:bg-[#261f19]"
                key={line}
              >
                <p className="text-xl font-semibold leading-7 text-[#fff4e8]">
                  {line}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="ready" className="bg-[#211b16] text-[#f9efe1]">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#edb981]">
              Commercial surface
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-[#fff4e8] sm:text-4xl">
              Open PayShield. Set the check. See what is safe to spend.
            </h2>
            <p className="mt-4 max-w-3xl text-lg leading-8 text-[#d6c8b8]">
              The product starts immediately, saves the current plan on the
              device, avoids bank credentials, and exports the paycheck model
              for review when the household needs a record.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                className="inline-flex items-center justify-center rounded-[8px] bg-[#b8e7c5] px-5 py-3 text-sm font-semibold text-[#17301f] shadow-[0_16px_40px_rgba(184,231,197,0.16)] hover:bg-[#cff1d7]"
                href="#product"
              >
                Open planner
              </a>
              <a
                className="inline-flex items-center justify-center rounded-[8px] border border-[#3a3027] bg-[#17130f] px-5 py-3 text-sm font-semibold text-[#fff4e8] hover:border-[#b8e7c5]/60"
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
                  className="rounded-[8px] border border-[#3a3027] bg-[#17130f]/72 p-4 shadow-[0_16px_54px_rgba(0,0,0,0.18)]"
                  key={item.title}
                >
                  <Icon className="size-5 text-[#edb981]" aria-hidden="true" />
                  <h3 className="mt-3 text-base font-semibold text-[#fff4e8]">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[#d6c8b8]">
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
    title: "Bank apps show the balance. PayShield shows the boundary.",
    body: "The headline number is not spendable until rent, vehicle payments, insurance, family needs, and goals have already taken their place.",
    icon: SlidersHorizontal,
  },
  {
    title: "Budget apps review the past. PayShield answers the next swipe.",
    body: "The purchase check happens before spending, so the household sees whether a decision fits the protected paycheck plan right now.",
    icon: ShieldCheck,
  },
  {
    title: "Spreadsheets bury the answer. PayShield puts it first.",
    body: "The current paycheck, bucket coverage, shortfalls, purchase decision, and recovery path export as one structured plan.",
    icon: RefreshCcw,
  },
  {
    title: "Private by default. No bank login needed.",
    body: "The app works as a private planning surface, so households can get clarity without handing over credentials or account numbers.",
    icon: Lock,
  },
];

const taglines = [
  "Bills covered. Spending clear.",
  "Know what is safe before the card comes out.",
  "Your paycheck, sorted in plain English.",
  "Protect the must-pay money first.",
  "One check. One honest spending number.",
  "Spend from the part that is actually free.",
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
