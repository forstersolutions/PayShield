import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  Database,
  KeyRound,
  Landmark,
  LockKeyhole,
  Mail,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { BillPaymentPanel } from "@/app/components/bill-payment-panel";
import { BucketControlPanel } from "@/app/components/bucket-control-panel";
import { PayShieldHeaderLogo } from "@/app/components/pay-shield-mark";
import { WaitlistForm } from "@/app/components/waitlist-form";
import { REGULATED_PARTNER_DISCLOSURE } from "@/app/lib/brand";
import { createNeobankSnapshot } from "@/app/lib/neobank/demo-state.ts";
import { formatCents } from "@/app/lib/neobank/ledger.ts";
import type { BucketBalance } from "@/app/lib/neobank/types.ts";

const protectionCopy: Record<BucketBalance["protection"], string> = {
  bill_only: "Bill-only",
  emergency: "Emergency",
  hard_lock: "Hard lock",
  soft_lock: "Soft lock",
  spendable: "Spendable",
};

const productStats = [
  {
    label: "Shielded first",
    value: "Bills locked",
  },
  {
    label: "Control surface",
    value: "Custom rules",
  },
  {
    label: "Spend signal",
    value: "One number",
  },
];

const liveRailCards = [
  {
    body: "Income lands, then the ledger splits it by priority before ordinary spending is allowed to touch the remainder.",
    icon: Landmark,
    label: "Income intake",
    title: "Paycheck landing zone",
  },
  {
    body: "Card decisions answer the only question that matters in the moment: is this purchase inside Safe to Spend?",
    icon: CreditCard,
    label: "Gateway decision",
    title: "Safe-spend card control",
  },
  {
    body: "Approved billers can draw from assigned buckets without exposing rent, insurance, or vehicle money to everyday swipes.",
    icon: Building2,
    label: "Bill-only rules",
    title: "Protected bill routing",
  },
];

const profileSteps = [
  "Create a private PayShield profile with Grayston support behind it.",
  "Set the paycheck amount, protected buckets, payees, priority order, and unlock rules.",
  "Complete provider-led identity checks when account and card controls are activated.",
  "Run authorization decisions from Safe to Spend after provider gateway activation.",
];

export function NeobankDashboard() {
  const snapshot = createNeobankSnapshot();
  const safeSpend =
    snapshot.buckets.find((bucket) => bucket.id === "safe_spending")
      ?.availableCents ?? 0;
  const protectedCents = snapshot.buckets
    .filter((bucket) => bucket.id !== "safe_spending")
    .reduce((sum, bucket) => sum + bucket.availableCents, 0);
  const criticalBuckets = snapshot.buckets.filter(
    (bucket) => bucket.id !== "safe_spending" && bucket.priority <= 30,
  );
  const safeSpendPercent = Math.round(
    (safeSpend / Math.max(1, safeSpend + protectedCents)) * 100,
  );

  return (
    <section
      id="product"
      className="pay-app-shell relative min-h-screen overflow-x-hidden text-[#f7f8fb]"
    >
      <span
        aria-hidden="true"
        className="data-line left-[8%] top-[15rem] h-px w-[56rem] rotate-[-17deg]"
      />
      <span
        aria-hidden="true"
        className="data-line right-[-14rem] top-[33rem] h-px w-[48rem] rotate-[28deg]"
      />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="pay-header">
          <a
            aria-label="PayShield dashboard home"
            className="pay-header-brand min-w-0"
            href="#product"
          >
            <PayShieldHeaderLogo priority />
          </a>
          <nav
            aria-label="Primary"
            className="pay-primary-nav rounded-[8px] border border-white/10 bg-black/40 p-1 text-sm font-bold text-[#d9dde5]"
          >
            <a
              className="pay-primary-nav-link rounded-[8px] px-3 py-2 text-center hover:bg-white/10"
              href="#balances"
            >
              Balances
            </a>
            <a
              className="pay-primary-nav-link rounded-[8px] px-3 py-2 text-center hover:bg-white/10"
              href="#bucket-studio"
            >
              Buckets
            </a>
            <a
              className="pay-primary-nav-link rounded-[8px] px-3 py-2 text-center hover:bg-white/10"
              href="#bill-routing"
            >
              Bills
            </a>
            <a
              className="pay-primary-nav-link rounded-[8px] px-3 py-2 text-center hover:bg-white/10"
              href="#rails"
            >
              Rails
            </a>
            <a
              className="pay-primary-nav-link rounded-[8px] px-3 py-2 text-center hover:bg-white/10"
              href="#gates"
            >
              Gates
            </a>
            <Link
              className="pay-primary-nav-link pay-primary-nav-cta brand-button-primary gap-2 rounded-[8px] px-4 py-2 font-black"
              href="/app"
            >
              Open app
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </nav>
        </header>

        <div className="grid flex-1 gap-6 py-8 lg:grid-cols-[minmax(0,0.96fr)_minmax(0,1.04fr)]">
          <section className="brand-panel accent-rule rounded-[8px] p-5 sm:p-7">
            <p className="inline-flex items-center gap-2 rounded-[8px] border border-[#39e8ff]/30 bg-[#39e8ff]/10 px-3 py-2 text-sm font-black text-[#dffaff]">
              Paycheck control software by Grayston Technologies.
            </p>
            <h1 className="mt-6 max-w-2xl text-4xl font-black leading-[1.02] text-white sm:text-5xl lg:text-[3.35rem]">
              The paycheck control layer for real life.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[#c9d0da]">
              PayShield protects obligations before everyday spending can reach
              them: secure buckets, approved biller rules, recovery controls,
              and one clean Safe to Spend number.
            </p>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              {productStats.map((stat) => (
                <div
                  className="brand-panel-soft rounded-[8px] p-3"
                  key={stat.label}
                >
                  <p className="brand-kicker">{stat.label}</p>
                  <p className="mt-2 text-sm font-black text-white">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>

            <div
              id="balances"
              className="mt-7 rounded-[8px] border border-[#1588ff]/30 bg-[#07111f]/78 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.14em] text-[#39e8ff]">
                    Safe to Spend
                  </p>
                  <p className="mt-2 text-5xl font-black leading-none text-white">
                    {formatCents(safeSpend)}
                  </p>
                </div>
                <div className="rounded-[8px] border border-[#ffb237]/35 bg-[#ffb237]/10 px-3 py-2 text-sm font-black text-[#ffe1a3]">
                  {snapshot.card.authorizationMode === "simulation"
                    ? "Safe-spend control"
                    : "Card gateway live"}
                </div>
              </div>
              <div className="mt-5 overflow-hidden rounded-[8px] border border-white/10 bg-black/40">
                <div className="grid grid-cols-[1fr_auto] items-center gap-3 p-3">
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-[#9ba6b5]">
                    Paycheck release
                  </span>
                  <span className="text-sm font-black text-white">
                    {safeSpendPercent}% spendable
                  </span>
                </div>
                <div className="flex h-3 bg-[#121821]">
                  <span
                    className="bg-gradient-to-r from-[#1588ff] to-[#39e8ff]"
                    style={{ width: `${safeSpendPercent}%` }}
                  />
                  <span className="flex-1 bg-gradient-to-r from-[#ffb237] to-[#ff6b35]" />
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Metric
                  icon={LockKeyhole}
                  label="Protected"
                  value={formatCents(protectedCents)}
                />
                <Metric
                  icon={CalendarClock}
                  label="Next recovery"
                  value="$100/check"
                />
              </div>
            </div>

            <div className="mt-4 rounded-[8px] border border-white/10 bg-black/40 p-4">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-1 h-11 w-1.5 shrink-0 rounded-full bg-gradient-to-b from-[#39e8ff] to-[#ffb237] shadow-[0_0_22px_rgba(57,232,255,0.32)]"
                />
                <div>
                  <p className="text-sm font-black text-white">
                    PayShield is operated by Grayston Technologies.
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[#c9d0da]">
                    Product and support requests route to{" "}
                    <a
                      className="font-black text-[#39e8ff] underline"
                      href="mailto:support@graystontechnologies.com"
                    >
                      support@graystontechnologies.com
                    </a>
                    .
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-5">
            <div className="brand-panel rounded-[8px] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="brand-kicker">Household ledger</p>
                  <h2 className="mt-1 text-2xl font-black text-white">
                    Every dollar has a rule.
                  </h2>
                </div>
                <Database className="size-6 text-[#39e8ff]" aria-hidden="true" />
              </div>
              <div className="mt-5 grid gap-3">
                {snapshot.buckets.map((bucket) => (
                  <BucketRow bucket={bucket} key={bucket.id} />
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {criticalBuckets.map((bucket) => (
                <div
                  className="brand-panel-soft rounded-[8px] p-4"
                  key={bucket.id}
                >
                  <p className="brand-kicker">{bucket.name}</p>
                  <p className="mt-2 text-2xl font-black text-white">
                    {formatCents(bucket.availableCents)}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-[#aab3c2]">
                    {protectionCopy[bucket.protection]} until {bucket.due}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <BucketControlPanel buckets={snapshot.buckets} />
      <BillPaymentPanel buckets={snapshot.buckets} payees={snapshot.payees} />

      <div className="relative z-10 border-y border-white/10 bg-[#090b0d]">
        <div
          id="rails"
          className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8"
        >
          <div className="accent-rule pt-5">
            <p className="brand-kicker">Operating rails</p>
            <h2 className="mt-3 text-3xl font-black leading-tight text-white sm:text-4xl">
              Income rules first. Card control second. Bills stay protected.
            </h2>
            <p className="mt-4 text-lg leading-8 text-[#c9d0da]">
              The workflow is designed around the real money path: identity,
              income intake, ledger split, payee approval, card decisions,
              reconciliation, and support escalation owned by Grayston.
            </p>
          </div>

          <div className="grid gap-3">
            {liveRailCards.map((item) => {
              const Icon = item.icon;

              return (
                <article
                  className="brand-panel-soft grid rounded-[8px] p-5 sm:grid-cols-[44px_1fr]"
                  key={item.title}
                >
                  <span className="grid size-11 place-items-center rounded-[8px] border border-[#39e8ff]/20 bg-[#39e8ff]/10 text-[#39e8ff]">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="brand-kicker">{item.label}</p>
                    <h3 className="mt-1 text-lg font-black text-white">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-[#aab3c2]">
                      {item.body}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>

      <div className="relative z-10 border-b border-white/10 bg-[#050607]">
        <div
          id="gates"
          className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8"
        >
          <div className="accent-rule pt-5">
            <p className="brand-kicker">Provider readiness</p>
            <h2 className="mt-3 text-3xl font-black leading-tight text-white sm:text-4xl">
              Real controls need real rails.
            </h2>
            <p className="mt-4 text-lg leading-8 text-[#c9d0da]">
              {REGULATED_PARTNER_DISCLOSURE} Until then, live-money actions stay
              locked while the product, ledger, and support stack remain ready
              for partner activation.
            </p>
            <div className="mt-6 rounded-[8px] border border-[#ffb237]/35 bg-[#ffb237]/10 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle
                  className="mt-0.5 size-5 text-[#ffcf72]"
                  aria-hidden="true"
                />
                <p className="text-sm leading-6 text-[#ffe5b6]">
                  Customer money controls require approved provider credentials,
                  exact account, card, payment, and support disclosures, and
                  Grayston operating runbooks before activation.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            {snapshot.readiness.gates.map((gate) => (
              <div
                className="brand-panel-soft flex items-start gap-3 rounded-[8px] p-3"
                key={gate.id}
              >
                {gate.ok ? (
                  <CheckCircle2
                    className="mt-0.5 size-5 shrink-0 text-[#39e8ff]"
                    aria-hidden="true"
                  />
                ) : (
                  <KeyRound
                    className="mt-0.5 size-5 shrink-0 text-[#ffb237]"
                    aria-hidden="true"
                  />
                )}
                <div>
                  <p className="text-sm font-black text-white">
                    {gate.id.replace(/_/g, " ")}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[#aab3c2]">
                    {gate.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="relative z-10 bg-[#090b0d]">
        <div
          id="profile"
          className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8"
        >
          <div className="accent-rule pt-5">
            <p className="brand-kicker">Private household profile</p>
            <h2 className="mt-3 text-3xl font-black leading-tight text-white sm:text-4xl">
              Built for households that need simple rules, reliable support,
              and fewer money surprises.
            </h2>
            <a
              className="mt-5 inline-flex items-center gap-2 rounded-[8px] border border-[#39e8ff]/30 bg-[#39e8ff]/10 px-3 py-2 text-sm font-black text-[#dffaff] hover:bg-[#39e8ff]/15"
              href="mailto:support@graystontechnologies.com"
            >
              <Mail className="size-4" aria-hidden="true" />
              Grayston Technologies support: support@graystontechnologies.com
            </a>
            <div className="mt-6 grid gap-3">
              {profileSteps.map((step, index) => (
                <div
                  className="brand-panel-soft flex items-start gap-3 rounded-[8px] p-3"
                  key={step}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-[8px] bg-[#39e8ff] text-sm font-black text-[#050607]">
                    {index + 1}
                  </span>
                  <p className="text-sm leading-6 text-[#d9dde5]">{step}</p>
                </div>
              ))}
            </div>
          </div>

          <WaitlistForm />
        </div>
      </div>
    </section>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[8px] border border-white/10 bg-black/40 p-3">
      <Icon className="size-4 text-[#ffb237]" aria-hidden="true" />
      <p className="mt-2 text-xs font-black uppercase tracking-[0.12em] text-[#8f99aa]">
        {label}
      </p>
      <p className="mt-1 text-base font-black text-white">{value}</p>
    </div>
  );
}

function BucketRow({ bucket }: { bucket: BucketBalance }) {
  const fundedPercent =
    bucket.targetCents > 0
      ? Math.min(100, (bucket.fundedCents / bucket.targetCents) * 100)
      : 100;

  return (
    <div className="rounded-[8px] border border-white/10 bg-black/40 p-3 transition hover:border-[#39e8ff]/35">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-[8px] border border-[#1588ff]/30 bg-[#1588ff]/12 text-[#39e8ff]">
            {bucket.id === "safe_spending" ? (
              <CircleDollarSign className="size-4" aria-hidden="true" />
            ) : (
              <LockKeyhole className="size-4" aria-hidden="true" />
            )}
          </span>
          <div>
            <p className="text-sm font-black text-white">{bucket.name}</p>
            <p className="text-xs leading-5 text-[#9ba6b5]">
              {protectionCopy[bucket.protection]} - {bucket.due}
            </p>
          </div>
        </div>
        <p className="text-sm font-black text-white">
          {formatCents(bucket.availableCents)}
        </p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#151922]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#1588ff] via-[#39e8ff] to-[#ffb237]"
          style={{ width: `${fundedPercent}%` }}
        />
      </div>
    </div>
  );
}
