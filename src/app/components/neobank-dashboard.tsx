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
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PayShieldMark } from "@/app/components/pay-shield-mark";
import { WaitlistForm } from "@/app/components/waitlist-form";
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
    label: "Access",
    value: "Closed beta",
  },
  {
    label: "First rail",
    value: "Paycheck + card",
  },
  {
    label: "System",
    value: "Ledger-led",
  },
];

const liveRailCards = [
  {
    body: "A partner-approved account receives the paycheck, then PayShield posts the split into protected bucket liabilities.",
    icon: Landmark,
    label: "Provider gate",
    title: "Paycheck landing zone",
  },
  {
    body: "Card requests are evaluated against safe spending first. Protected rent, vehicle, insurance, and goal money stays out of ordinary swipes.",
    icon: CreditCard,
    label: "Gateway decision",
    title: "Safe-spend card control",
  },
  {
    body: "Approved payees can draw only from their assigned bucket after provider, sponsor, and counsel approvals exist.",
    icon: Building2,
    label: "Bill-only rules",
    title: "Protected bill routing",
  },
];

const betaSteps = [
  "Authenticate into the closed beta app.",
  "Complete provider-led KYC when the BaaS partner is active.",
  "Receive paycheck routing instructions only after disclosures are approved.",
  "Use the card control path only when the backend, ledger, and provider gateway are live.",
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

  return (
    <section
      id="product"
      className="pay-app-shell relative min-h-screen overflow-x-hidden text-[#fff8ee]"
    >
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#3a3027] bg-[#1a1511]/88 px-3 py-3 shadow-[0_18px_70px_rgba(0,0,0,0.28)] backdrop-blur-xl">
          <a className="flex items-center gap-3" href="#product">
            <PayShieldMark className="size-11 drop-shadow-[0_12px_26px_rgba(0,0,0,0.22)]" />
            <span>
              <span className="block text-base font-semibold leading-5 text-[#fff4e8]">
                PayShield
              </span>
              <span className="block text-xs font-medium uppercase leading-4 tracking-[0.14em] text-[#c9b8a6]">
                Protected paycheck OS
              </span>
            </span>
          </a>
          <nav
            aria-label="Primary"
            className="flex flex-wrap items-center gap-1 rounded-[8px] border border-[#3a3027] bg-[#211b16]/82 p-1 text-sm font-medium text-[#eadccc]"
          >
            <a className="rounded-[8px] px-3 py-2 hover:bg-white/10" href="#balances">
              Balances
            </a>
            <a className="rounded-[8px] px-3 py-2 hover:bg-white/10" href="#rails">
              Rails
            </a>
            <a className="rounded-[8px] px-3 py-2 hover:bg-white/10" href="#gates">
              Gates
            </a>
            <a
              className="inline-flex items-center gap-2 rounded-[8px] bg-[#b8e7c5] px-4 py-2 font-semibold text-[#17301f] shadow-[0_14px_34px_rgba(184,231,197,0.16)] hover:bg-[#cff1d7]"
              href="#beta"
            >
              Beta access
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </nav>
        </header>

        <div className="grid flex-1 gap-5 py-6 lg:grid-cols-[minmax(0,0.96fr)_minmax(0,1.04fr)]">
          <section className="rounded-[8px] border border-[#3a3027] bg-[#1c1713]/94 p-5 shadow-[0_24px_90px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:p-6">
            <p className="inline-flex items-center gap-2 rounded-[8px] border border-[#b8e7c5]/35 bg-[#b8e7c5]/12 px-3 py-2 text-sm font-semibold text-[#e5f8e9]">
              <ShieldCheck className="size-4" aria-hidden="true" />
              Paycheck protection with partner-bank rails coming through closed beta.
            </p>
            <h1 className="mt-5 max-w-2xl text-4xl font-semibold leading-[1.04] text-[#fff4e8] sm:text-5xl lg:text-[3.15rem]">
              Lock the must-pay money before the card can touch it.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[#d6c8b8]">
              PayShield is being built as a full money-control product: paycheck
              intake, protected ledger buckets, approved biller rules, and a
              safe-spend card decision path. The public build stays gated until
              the BaaS partner, sponsor disclosures, counsel review, and
              operations runbooks are complete.
            </p>

            <div className="mt-6 grid gap-2 sm:grid-cols-3">
              {productStats.map((stat) => (
                <div
                  className="rounded-[8px] border border-[#3a3027] bg-[#211b16]/82 p-3"
                  key={stat.label}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#c9b8a6]">
                    {stat.label}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#fff4e8]">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>

            <div
              id="balances"
              className="mt-6 rounded-[8px] border border-[#3a3027] bg-[#120f0c]/82 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#b8e7c5]">
                    Safe to Spend
                  </p>
                  <p className="mt-2 text-5xl font-semibold leading-none text-[#fff4e8]">
                    {formatCents(safeSpend)}
                  </p>
                </div>
                <div className="rounded-[8px] border border-[#edb981]/35 bg-[#edb981]/10 px-3 py-2 text-sm font-semibold text-[#ffe5c5]">
                  {snapshot.card.authorizationMode === "simulation"
                    ? "Card path simulated"
                    : "Card gateway live"}
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
          </section>

          <section className="grid gap-4">
            <div className="rounded-[8px] border border-[#3a3027] bg-[#211b16]/94 p-4 shadow-[0_22px_80px_rgba(0,0,0,0.26)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#edb981]">
                    Household ledger
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold text-[#fff4e8]">
                    Every dollar gets a state.
                  </h2>
                </div>
                <Database className="size-6 text-[#b8e7c5]" aria-hidden="true" />
              </div>
              <div className="mt-4 grid gap-2">
                {snapshot.buckets.map((bucket) => (
                  <BucketRow bucket={bucket} key={bucket.id} />
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {criticalBuckets.map((bucket) => (
                <div
                  className="rounded-[8px] border border-[#3a3027] bg-[#1c1713]/90 p-4"
                  key={bucket.id}
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#c9b8a6]">
                    {bucket.name}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-[#fff4e8]">
                    {formatCents(bucket.availableCents)}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-[#b7aa9b]">
                    {protectionCopy[bucket.protection]} until {bucket.due}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <div className="relative z-10 border-y border-[#3a3027] bg-[#211b16]">
        <div
          id="rails"
          className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8"
        >
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#b8e7c5]">
              Real rail order
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-[#fff4e8] sm:text-4xl">
              Direct paycheck intake first. Card control second. Bill routing next.
            </h2>
            <p className="mt-4 text-lg leading-8 text-[#d6c8b8]">
              The dashboard is shaped around the full neobank release, but every
              rail is marked gated until PayShield has the provider contract,
              API credentials, approved disclosures, and support operations.
            </p>
          </div>

          <div className="grid gap-3">
            {liveRailCards.map((item) => {
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
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#edb981]">
                      {item.label}
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-[#fff4e8]">
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
      </div>

      <div className="relative z-10 border-b border-[#3a3027] bg-[#17130f]">
        <div
          id="gates"
          className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8"
        >
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#edb981]">
              Live-money gates
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-[#fff4e8] sm:text-4xl">
              The lock is real only when the stack is real.
            </h2>
            <p className="mt-4 text-lg leading-8 text-[#d6c8b8]">
              This build does not open accounts, hold funds, issue cards, or
              move money. It installs the product architecture and blocks live
              actions until the regulated requirements are complete.
            </p>
            <div className="mt-6 rounded-[8px] border border-[#eaa199]/35 bg-[#eaa199]/10 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle
                  className="mt-0.5 size-5 text-[#f0b2aa]"
                  aria-hidden="true"
                />
                <p className="text-sm leading-6 text-[#f6d4cf]">
                  PayShield is not a bank. Partner-bank and insurance language
                  must stay out of the product until the sponsor, recordkeeping,
                  and counsel approvals support exact disclosures.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            {snapshot.readiness.gates.map((gate) => (
              <div
                className="flex items-start gap-3 rounded-[8px] border border-[#3a3027] bg-[#211b16] p-3"
                key={gate.id}
              >
                {gate.ok ? (
                  <CheckCircle2
                    className="mt-0.5 size-5 shrink-0 text-[#b8e7c5]"
                    aria-hidden="true"
                  />
                ) : (
                  <KeyRound
                    className="mt-0.5 size-5 shrink-0 text-[#edb981]"
                    aria-hidden="true"
                  />
                )}
                <div>
                  <p className="text-sm font-semibold text-[#fff4e8]">
                    {gate.id.replace(/_/g, " ")}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[#b7aa9b]">
                    {gate.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="relative z-10 bg-[#211b16]">
        <div
          id="beta"
          className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8"
        >
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#b8e7c5]">
              Closed paid beta
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight text-[#fff4e8] sm:text-4xl">
              Built for US households that need the paycheck protected before
              life gets loud.
            </h2>
            <div className="mt-6 grid gap-3">
              {betaSteps.map((step, index) => (
                <div
                  className="flex items-start gap-3 rounded-[8px] border border-[#3a3027] bg-[#17130f]/72 p-3"
                  key={step}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-[8px] bg-[#b8e7c5] text-sm font-bold text-[#17301f]">
                    {index + 1}
                  </span>
                  <p className="text-sm leading-6 text-[#eadccc]">{step}</p>
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
    <div className="rounded-[8px] border border-[#3a3027] bg-[#211b16]/82 p-3">
      <Icon className="size-4 text-[#edb981]" aria-hidden="true" />
      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#c9b8a6]">
        {label}
      </p>
      <p className="mt-1 text-base font-semibold text-[#fff4e8]">{value}</p>
    </div>
  );
}

function BucketRow({ bucket }: { bucket: BucketBalance }) {
  const fundedPercent =
    bucket.targetCents > 0
      ? Math.min(100, (bucket.fundedCents / bucket.targetCents) * 100)
      : 100;

  return (
    <div className="rounded-[8px] border border-[#3a3027] bg-[#17130f]/74 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-[8px] bg-[#261f19] text-[#b8e7c5]">
            {bucket.id === "safe_spending" ? (
              <CircleDollarSign className="size-4" aria-hidden="true" />
            ) : (
              <LockKeyhole className="size-4" aria-hidden="true" />
            )}
          </span>
          <div>
            <p className="text-sm font-semibold text-[#fff4e8]">{bucket.name}</p>
            <p className="text-xs leading-5 text-[#b7aa9b]">
              {protectionCopy[bucket.protection]} - {bucket.due}
            </p>
          </div>
        </div>
        <p className="text-sm font-semibold text-[#fff4e8]">
          {formatCents(bucket.availableCents)}
        </p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#2d251e]">
        <div
          className="h-full rounded-full bg-[#b8e7c5]"
          style={{ width: `${fundedPercent}%` }}
        />
      </div>
    </div>
  );
}
