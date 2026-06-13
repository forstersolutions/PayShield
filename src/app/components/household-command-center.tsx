import {
  ArrowRight,
  BadgeDollarSign,
  CheckCircle2,
  CreditCard,
  Database,
  KeyRound,
  Landmark,
  LifeBuoy,
  Link2,
  LockKeyhole,
  Radar,
  ShieldAlert,
  Split,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { BillPaymentPanel } from "@/app/components/bill-payment-panel";
import { BucketControlPanel } from "@/app/components/bucket-control-panel";
import { CardAuthorizationPanel } from "@/app/components/card-authorization-panel";
import { MoneyOperationsPanel } from "@/app/components/money-operations-panel";
import { PayShieldHeaderLogo } from "@/app/components/pay-shield-mark";
import { UnlockControlPanel } from "@/app/components/unlock-control-panel";
import {
  GRAYSTON_SUPPORT_EMAIL,
  PAYSHIELD_OWNERSHIP_LINE,
  REGULATED_PARTNER_DISCLOSURE,
} from "@/app/lib/brand";
import { createNeobankSnapshot } from "@/app/lib/neobank/demo-state.ts";
import { formatCents } from "@/app/lib/neobank/ledger.ts";

const commandActions = [
  {
    body: "Launch paid household access through Stripe Checkout or a configured payment link.",
    href: "#money-operations",
    icon: BadgeDollarSign,
    label: "Start paid access",
  },
  {
    body: "Initialize external account connection for transaction detection and transfer handoff.",
    href: "#money-operations",
    icon: Link2,
    label: "Connect bank",
  },
  {
    body: "Run payroll detection and split income into protected buckets before Safe to Spend.",
    href: "#money-operations",
    icon: Radar,
    label: "Detect paycheck",
  },
  {
    body: "Run a purchase through the Safe to Spend decision model.",
    href: "#card-authorization",
    icon: CreditCard,
    label: "Check a card swipe",
  },
  {
    body: "Model emergency access with a per-check recovery plan.",
    href: "#unlock-controls",
    icon: ShieldAlert,
    label: "Unlock funds",
  },
  {
    body: "Send operational requests to Grayston support.",
    href: `mailto:${GRAYSTON_SUPPORT_EMAIL}`,
    icon: LifeBuoy,
    label: "Support",
  },
];

const moneyPath = [
  "Paid access",
  "Bank connection",
  "Income intake",
  "Priority split",
  "Safe-spend decision",
  "Reconciliation",
];

export function HouseholdCommandCenter() {
  const snapshot = createNeobankSnapshot();
  const safeSpend =
    snapshot.buckets.find((bucket) => bucket.id === "safe_spending")
      ?.availableCents ?? 0;
  const protectedCents = snapshot.buckets
    .filter((bucket) => bucket.id !== "safe_spending")
    .reduce((sum, bucket) => sum + bucket.availableCents, 0);
  const totalCents = safeSpend + protectedCents;
  const safeSpendPercent = Math.round(
    (safeSpend / Math.max(1, totalCents)) * 100,
  );
  const protectedPercent = 100 - safeSpendPercent;
  const latestEntries = snapshot.ledgerEntries.slice(-5).reverse();
  const openGates = snapshot.readiness.gates.filter((gate) => !gate.ok);

  return (
    <section className="pay-app-shell relative min-h-screen overflow-x-hidden text-[#f7f8fb]">
      <span
        aria-hidden="true"
        className="data-line left-[4%] top-[13rem] h-px w-[58rem] rotate-[-14deg]"
      />
      <span
        aria-hidden="true"
        className="data-line right-[-18rem] top-[36rem] h-px w-[54rem] rotate-[23deg]"
      />

      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <header className="pay-header">
          <Link
            aria-label="PayShield app home"
            className="pay-header-brand min-w-0"
            href="/app"
          >
            <PayShieldHeaderLogo priority />
          </Link>
          <nav
            aria-label="Application"
            className="pay-primary-nav rounded-[8px] border border-white/10 bg-black/40 p-1 text-sm font-bold text-[#d9dde5]"
          >
            <a
              className="pay-primary-nav-link rounded-[8px] px-3 py-2 text-center hover:bg-white/10"
              href="#overview"
            >
              Overview
            </a>
            <a
              className="pay-primary-nav-link rounded-[8px] px-3 py-2 text-center hover:bg-white/10"
              href="#bucket-studio"
            >
              Buckets
            </a>
            <a
              className="pay-primary-nav-link rounded-[8px] px-3 py-2 text-center hover:bg-white/10"
              href="#money-operations"
            >
              Rails
            </a>
            <a
              className="pay-primary-nav-link rounded-[8px] px-3 py-2 text-center hover:bg-white/10"
              href="#bill-routing"
            >
              Bills
            </a>
            <a
              className="pay-primary-nav-link rounded-[8px] px-3 py-2 text-center hover:bg-white/10"
              href="#card-authorization"
            >
              Card
            </a>
            <a
              className="pay-primary-nav-link rounded-[8px] px-3 py-2 text-center hover:bg-white/10"
              href="#unlock-controls"
            >
              Unlock
            </a>
            <Link
              className="pay-primary-nav-link pay-primary-nav-cta brand-button-primary gap-2 rounded-[8px] px-4 py-2 font-black"
              href="/#profile"
            >
              Product profile
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </nav>
        </header>

        <div
          id="overview"
          className="grid gap-6 py-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]"
        >
          <section className="brand-panel accent-rule rounded-[8px] p-5 sm:p-7">
            <p className="inline-flex items-center gap-2 rounded-[8px] border border-[#39e8ff]/30 bg-[#39e8ff]/10 px-3 py-2 text-sm font-black text-[#dffaff]">
              Household command center
            </p>
            <h1 className="mt-6 max-w-2xl text-4xl font-black leading-[1.02] text-white sm:text-5xl lg:text-[3.3rem]">
              One operating screen for the paycheck.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[#c9d0da]">
              Sell access, connect funding sources, detect income, split the
              ledger into protected buckets, route bills, and decide spending
              from one reliable operating flow.
            </p>

            <div className="mt-7 rounded-[8px] border border-[#1588ff]/30 bg-[#07111f]/78 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-black uppercase text-[#39e8ff]">
                    Safe to Spend
                  </p>
                  <p className="mt-2 text-5xl font-black leading-none text-white">
                    {formatCents(safeSpend)}
                  </p>
                </div>
                <span className="rounded-[8px] border border-[#ffb237]/35 bg-[#ffb237]/10 px-3 py-2 text-sm font-black text-[#ffe1a3]">
                  {snapshot.card.status === "live"
                    ? "Gateway active"
                    : "Simulation controls"}
                </span>
              </div>

              <div className="mt-5 overflow-hidden rounded-[8px] border border-white/10 bg-black/40">
                <div className="grid grid-cols-[1fr_auto] items-center gap-3 p-3">
                  <span className="text-xs font-black uppercase text-[#9ba6b5]">
                    Paycheck split
                  </span>
                  <span className="text-sm font-black text-white">
                    {safeSpendPercent}% safe / {protectedPercent}% protected
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
                <StatusMetric
                  icon={LockKeyhole}
                  label="Protected"
                  value={formatCents(protectedCents)}
                />
                <StatusMetric
                  icon={CreditCard}
                  label="Card mode"
                  value={snapshot.card.authorizationMode === "simulation" ? "Simulated" : "Gateway"}
                />
              </div>
            </div>
          </section>

          <section className="grid gap-5">
            <div className="brand-panel rounded-[8px] p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="brand-kicker">Command queue</p>
                  <h2 className="mt-1 text-2xl font-black text-white">
                    The next useful actions are obvious.
                  </h2>
                </div>
                <WalletCards className="size-6 text-[#39e8ff]" aria-hidden="true" />
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {commandActions.map((action) => {
                  const Icon = action.icon;

                  return (
                    <a
                      className="rounded-[8px] border border-white/10 bg-black/40 p-4 transition hover:border-[#39e8ff]/35 hover:bg-[#39e8ff]/10"
                      href={action.href}
                      key={action.label}
                    >
                      <span className="grid size-10 place-items-center rounded-[8px] border border-[#39e8ff]/20 bg-[#39e8ff]/10 text-[#39e8ff]">
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      <p className="mt-3 text-sm font-black text-white">
                        {action.label}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[#aab3c2]">
                        {action.body}
                      </p>
                    </a>
                  );
                })}
              </div>
            </div>

            <div className="brand-panel-soft rounded-[8px] p-5">
              <div className="flex items-start gap-3">
                <Split className="mt-1 size-5 shrink-0 text-[#ffb237]" aria-hidden="true" />
                <div>
                  <p className="brand-kicker">Money path</p>
                  <h2 className="mt-1 text-2xl font-black text-white">
                    Rules run before spend.
                  </h2>
                </div>
              </div>
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
          </section>
        </div>

        <section
          id="readiness"
          className="grid gap-6 border-t border-white/10 py-8 lg:grid-cols-[0.9fr_1.1fr]"
        >
          <div className="brand-panel rounded-[8px] p-5">
            <p className="brand-kicker">Readiness state</p>
            <h2 className="mt-2 text-3xl font-black text-white">
              Live-money controls remain gated.
            </h2>
            <p className="mt-4 text-sm leading-6 text-[#c9d0da]">
              {REGULATED_PARTNER_DISCLOSURE} The app can still model household
              rules, validate decisions, and collect support requests while
              provider activation remains locked.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <StatusMetric
                icon={Landmark}
                label="Deposit"
                value={snapshot.directDeposit.providerStatus}
              />
              <StatusMetric
                icon={Database}
                label="Ledger"
                value={snapshot.readiness.postgresSchemaVersion}
              />
              <StatusMetric
                icon={KeyRound}
                label="Open gates"
                value={String(openGates.length)}
              />
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
                  <p className="text-sm font-black capitalize text-white">
                    {gate.id.replace(/_/g, " ")}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[#aab3c2]">
                    {gate.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-6 border-t border-white/10 py-8 lg:grid-cols-[1fr_1fr]">
          <div className="brand-panel rounded-[8px] p-5">
            <p className="brand-kicker">Ledger journal</p>
            <h2 className="mt-2 text-2xl font-black text-white">
              Posted entries stay auditable.
            </h2>
            <div className="mt-5 grid gap-2">
              {latestEntries.map((entry) => (
                <div
                  className="rounded-[8px] border border-white/10 bg-black/40 p-3"
                  key={entry.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-black capitalize text-white">
                      {entry.type.replace(/_/g, " ")}
                    </p>
                    <p className="font-mono text-xs text-[#8f99aa]">
                      {entry.id}
                    </p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#aab3c2]">
                    {entry.memo}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="brand-panel rounded-[8px] p-5">
            <p className="brand-kicker">Operating owner</p>
            <h2 className="mt-2 text-2xl font-black text-white">
              Grayston support owns escalation.
            </h2>
            <p className="mt-4 text-sm leading-6 text-[#c9d0da]">
              {PAYSHIELD_OWNERSHIP_LINE} Product, support, readiness, and
              operational questions route to{" "}
              <a
                className="font-black text-[#39e8ff] underline"
                href={`mailto:${GRAYSTON_SUPPORT_EMAIL}`}
              >
                {GRAYSTON_SUPPORT_EMAIL}
              </a>
              .
            </p>
          </div>
        </section>
      </div>

      <MoneyOperationsPanel buckets={snapshot.buckets} payees={snapshot.payees} />
      <BucketControlPanel buckets={snapshot.buckets} />
      <BillPaymentPanel buckets={snapshot.buckets} payees={snapshot.payees} />
      <CardAuthorizationPanel safeSpendCents={safeSpend} />
      <UnlockControlPanel buckets={snapshot.buckets} />
    </section>
  );
}

function StatusMetric({
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
      <p className="mt-2 text-xs font-black uppercase text-[#8f99aa]">
        {label}
      </p>
      <p className="mt-1 text-base font-black capitalize text-white">{value}</p>
    </div>
  );
}
