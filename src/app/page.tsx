import {
  BellRing,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  FileLock2,
  Gauge,
  Landmark,
  ReceiptText,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { PaycheckPlanner } from "@/app/components/paycheck-planner";
import { SiteFooter } from "@/app/components/site-footer";
import { WaitlistForm } from "@/app/components/waitlist-form";

export default function Home() {
  return (
    <main className="bg-white text-stone-950">
      <PaycheckPlanner />

      <section id="rails" className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-800">
              Product architecture
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
              A controlled ledger first. Banking rails when the partner stack is
              approved.
            </h2>
            <p className="mt-4 text-lg leading-8 text-stone-700">
              The front-end presents the real product mechanics: paycheck
              detection, protected internal buckets, bill-only payment routes,
              card authorization limits, emergency unlock friction, and recovery
              plans.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {railItems.map((item) => {
              const Icon = item.icon;
              return (
                <article
                  className="rounded-[8px] border border-stone-200 bg-[#fbfaf6] p-5"
                  key={item.title}
                >
                  <Icon className="size-6 text-teal-800" aria-hidden="true" />
                  <h3 className="mt-5 text-lg font-semibold">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-stone-700">
                    {item.body}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-b border-stone-200 bg-[#f7f5ef]">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-800">
              Positioning
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
              The bank balance is not the truth. Safe to spend is.
            </h2>
            <p className="mt-4 text-lg leading-8 text-stone-700">
              PayShield is built for families, hourly workers, gig workers,
              military households, and anyone paid on a schedule but charged on
              another one.
            </p>
          </div>
          <div className="grid gap-3">
            {positioning.map((line) => (
              <div
                className="flex items-start gap-3 rounded-[8px] border border-stone-300 bg-white p-4"
                key={line}
              >
                <CheckCircle2
                  className="mt-0.5 size-5 shrink-0 text-emerald-700"
                  aria-hidden="true"
                />
                <p className="text-base leading-7 text-stone-800">{line}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-800">
                Pricing
              </p>
              <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
                Subscription-led revenue, not desperation fees.
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-stone-600">
              Interchange, bill-pay convenience features, and employer
              partnerships can layer in after the core protection promise earns
              trust.
            </p>
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-4">
            {plans.map((plan) => (
              <article
                className={`rounded-[8px] border p-5 ${
                  plan.featured
                    ? "border-stone-950 bg-stone-950 text-white"
                    : "border-stone-200 bg-[#fbfaf6] text-stone-950"
                }`}
                key={plan.name}
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  {plan.featured ? (
                    <ShieldCheck className="size-5" aria-hidden="true" />
                  ) : null}
                </div>
                <p
                  className={`mt-4 text-3xl font-semibold ${
                    plan.featured ? "text-white" : "text-stone-950"
                  }`}
                >
                  {plan.price}
                </p>
                <p
                  className={`mt-3 text-sm leading-6 ${
                    plan.featured ? "text-stone-300" : "text-stone-700"
                  }`}
                >
                  {plan.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="launch" className="border-b border-stone-200 bg-[#f7f5ef]">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-800">
              Launch readiness
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
              Prototype ready for diligence. Regulated-money launch still
              needs the partner stack.
            </h2>
            <p className="mt-4 text-lg leading-8 text-stone-700">
              The public surface avoids saying PayShield is a bank and avoids
              FDIC-insurance promises until a sponsor bank, program manager, and
              recordkeeping model are in place.
            </p>
          </div>

          <div className="grid gap-3">
            {launchItems.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  className="grid gap-4 rounded-[8px] border border-stone-300 bg-white p-4 sm:grid-cols-[36px_minmax(0,1fr)_auto]"
                  key={item.title}
                >
                  <Icon className="size-6 text-teal-800" aria-hidden="true" />
                  <div className="min-w-0">
                    <h3 className="font-semibold">{item.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-stone-700">
                      {item.body}
                    </p>
                  </div>
                  <span className="h-fit rounded-[8px] bg-stone-100 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-700">
                    {item.status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="pilot" className="bg-stone-950 text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:px-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-300">
              Pilot path
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
              Start with demand validation, then connect real money movement.
            </h2>
            <p className="mt-4 max-w-3xl text-lg leading-8 text-stone-300">
              The prototype is ready for customer discovery, employer
              conversations, investor review, and banking-partner diligence.
              The next phase should prove durable lead capture, campaign
              analytics, and partner onboarding readiness.
            </p>
            <div className="mt-8 grid gap-3 text-sm leading-6 text-stone-300 sm:grid-cols-3">
              <p className="rounded-[8px] border border-white/10 p-3">
                Validate the safe-spend message with households before live
                money movement.
              </p>
              <p className="rounded-[8px] border border-white/10 p-3">
                Segment pilots by household, employer, partner, and investor
                interest.
              </p>
              <p className="rounded-[8px] border border-white/10 p-3">
                Collect pilot requests only after durable lead storage is
                verified and privacy expectations are clear.
              </p>
            </div>
          </div>
          <WaitlistForm />
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}

const railItems = [
  {
    title: "Direct deposit split",
    body: "A future paycheck event would fund obligations first and send the remainder to safe spending.",
    icon: Landmark,
  },
  {
    title: "Protected ledger",
    body: "Each dollar has a state: available, protected, bill-pending, unlock-pending, transferred, failed, or reversed.",
    icon: ClipboardCheck,
  },
  {
    title: "Card controls",
    body: "Debit authorization checks safe spending instead of the total account balance.",
    icon: WalletCards,
  },
  {
    title: "Bill-only buckets",
    body: "Rent, insurance, and vehicle money can route only to approved payees and expected rails.",
    icon: ReceiptText,
  },
];

const positioning = [
  "Every paycheck gets a job before the debit card can touch it.",
  "Rent money cannot disappear into ordinary card purchases.",
  "Short paychecks fund high-priority obligations before flexible goals.",
  "Emergency access creates a recovery plan instead of a penalty spiral.",
];

const plans = [
  {
    name: "Free",
    price: "$0",
    body: "Three buckets, manual planning, safe-spend balance, and alerts for paycheck timing.",
  },
  {
    name: "Plus",
    price: "$7.99",
    body: "Unlimited buckets, automatic paycheck plans, soft locks, goal tracking, and reminders.",
    featured: true,
  },
  {
    name: "Pro",
    price: "$12.99",
    body: "Direct-deposit account, protected bill buckets, virtual-card routes, and shared household views.",
  },
  {
    name: "Premium",
    price: "$19.99",
    body: "Instant unlocks included, advanced automation, custom rules, priority support, and analytics.",
  },
];

const launchItems = [
  {
    title: "Compliance language",
    body: "Use partner-bank phrasing only after contracts are executed; keep pass-through insurance claims conditional and specific.",
    status: "Guarded",
    icon: FileLock2,
  },
  {
    title: "BaaS partner decision",
    body: "Evaluate sponsor bank, ledgering, ACH, card issuing, KYC, fraud tooling, disputes, and program oversight.",
    status: "Next",
    icon: Building2,
  },
  {
    title: "Prototype funnel",
    body: "Use the live prototype for customer discovery, investor review, and partner diligence while validating the safe-spend message.",
    status: "Ready",
    icon: Gauge,
  },
  {
    title: "Operational controls",
    body: "Before live funds, implement double-entry ledgering, audit logs, error handling, disclosures, support, and monitoring.",
    status: "Required",
    icon: BellRing,
  },
];
