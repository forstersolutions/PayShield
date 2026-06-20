import {
  ArrowRight,
  BadgeDollarSign,
  CheckCircle2,
  CreditCard,
  Database,
  KeyRound,
  Landmark,
  Link2,
  LockKeyhole,
  Radar,
  RefreshCw,
  Split,
  UserRoundCheck,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { BillRoutingWorkspace } from "@/app/components/bill-routing-workspace";
import { BucketControlPanel } from "@/app/components/bucket-control-panel";
import { CardAuthorizationPanel } from "@/app/components/card-authorization-panel";
import { MoneyEngineConsole } from "@/app/components/money-engine-console";
import {
  MoneyControlPlanPanel,
  type MoneyControlPlanView,
} from "@/app/components/money-control-plan-panel";
import { MoneyOperationsPanel } from "@/app/components/money-operations-panel";
import { MoneySetupConsole } from "@/app/components/money-setup-console";
import { PayShieldHeaderLogo } from "@/app/components/pay-shield-mark";
import { UnlockControlPanel } from "@/app/components/unlock-control-panel";
import {
  GRAYSTON_SUPPORT_EMAIL,
  PAYSHIELD_OWNERSHIP_LINE,
  REGULATED_PARTNER_DISCLOSURE,
} from "@/app/lib/brand";
import { getCommercialReadiness } from "@/app/lib/commercial/billing.ts";
import { createHouseholdMoneyControlPlan } from "@/app/lib/neobank/control-plan.ts";
import { createNeobankSnapshot } from "@/app/lib/neobank/demo-state.ts";
import { formatCents } from "@/app/lib/neobank/ledger.ts";
import { getMoneyRailReadiness } from "@/app/lib/neobank/money-rails.ts";
import {
  createHouseholdActivationPacket,
  createHouseholdOperationsPacket,
} from "@/app/lib/neobank/operations.ts";

function stepTone(ready: boolean) {
  return ready ? "ready" : "attention";
}

export function HouseholdCommandCenter() {
  const snapshot = createNeobankSnapshot();
  const commercialReadiness = getCommercialReadiness();
  const moneyRailReadiness = getMoneyRailReadiness();
  const initialOperations = createHouseholdOperationsPacket();
  const initialActivationPacket = createHouseholdActivationPacket();
  const initialControlPlan =
    createHouseholdMoneyControlPlan() as MoneyControlPlanView;
  const initialOperationsReadiness = {
    commercial: {
      checkoutConfigured: commercialReadiness.checkoutConfigured,
      mode: commercialReadiness.mode,
      paidAccessReady: commercialReadiness.paidAccessReady,
      paymentCollectionReady: commercialReadiness.paymentCollectionReady,
      priceLabel: commercialReadiness.priceLabel,
      activationCoreReady: commercialReadiness.activationCoreReady,
      activationCoreServiceAuthConfigured:
        commercialReadiness.activationCoreServiceAuthConfigured,
      checkoutOperationalReady: commercialReadiness.checkoutOperationalReady,
      productionLiveStripeReady: commercialReadiness.productionLiveStripeReady,
      remainingGates: commercialReadiness.missing,
      webhookEndpointPath: commercialReadiness.webhookEndpointPath,
    },
    moneyRails: {
      bankLinkReady: moneyRailReadiness.bankLinkReady,
      detectionMode: moneyRailReadiness.detectionMode,
      paycheckDetectionReady: moneyRailReadiness.paycheckDetectionReady,
      plaidConfigured: moneyRailReadiness.plaidConfigured,
      plaidEnv: moneyRailReadiness.plaidEnv,
      providerAdapterConfigured: moneyRailReadiness.providerAdapterConfigured,
      providerAdapterMissing: moneyRailReadiness.providerAdapterMissing,
      providerWebhookSigningConfigured:
        moneyRailReadiness.providerWebhookSigningConfigured,
      remainingGates: moneyRailReadiness.missing,
      tokenVaultEncryptionConfigured:
        moneyRailReadiness.tokenVaultEncryptionConfigured,
      tokenVaultEncryptionReady: moneyRailReadiness.tokenVaultEncryptionReady,
      tokenVaultConfigured: moneyRailReadiness.tokenVaultConfigured,
      tokenVaultHandoffReady: moneyRailReadiness.tokenVaultHandoffReady,
      tokenVaultWebhookSource: moneyRailReadiness.tokenVaultWebhookSource,
      tokenVaultStoreReady: moneyRailReadiness.tokenVaultStoreReady,
      transactionSyncReady: moneyRailReadiness.transactionSyncReady,
      transferConfigured: moneyRailReadiness.transferConfigured,
      transferReady: moneyRailReadiness.transferReady,
    },
    neobank: {
      backendConfigured: snapshot.readiness.backendConfigured,
      liveMoneyReady: snapshot.readiness.liveMoneyReady,
      mode: snapshot.readiness.mode,
      postgresSchemaVerified: snapshot.readiness.postgresSchemaVerified,
      providerConfigured: snapshot.readiness.providerConfigured,
      remainingGates: snapshot.readiness.gates
        .filter((gate) => !gate.ok)
        .map((gate) => gate.id),
    },
  };
  const safeSpend =
    snapshot.buckets.find((bucket) => bucket.id === "safe_spending")
      ?.availableCents ?? 0;
  const protectedCents = snapshot.buckets
    .filter((bucket) => bucket.id !== "safe_spending")
    .reduce((sum, bucket) => sum + bucket.availableCents, 0);
  const latestEntries = snapshot.ledgerEntries.slice(-5).reverse();
  const openGates = snapshot.readiness.gates.filter((gate) => !gate.ok);
  const setupSteps = [
    {
      body: "Households subscribe before the money tools unlock. Checkout is the revenue switch.",
      endpoint: "POST /api/app/billing/checkout",
      href: "#money-operations",
      icon: BadgeDollarSign,
      label: "Access",
      ready: commercialReadiness.paidAccessReady,
      status: commercialReadiness.paidAccessReady
        ? "Ready"
        : commercialReadiness.checkoutConfigured
          ? "Webhook needed"
          : "Stripe needed",
      title: "Turn on paid access",
    },
    {
      body: "Each Clerk subject maps to one PayShield household for buckets, payees, ledger events, and support.",
      endpoint: "GET /api/app/me",
      href: "#readiness",
      icon: LockKeyhole,
      label: "Identity",
      ready:
        snapshot.readiness.backendConfigured && snapshot.readiness.clerkConfigured,
      status:
        snapshot.readiness.backendConfigured && snapshot.readiness.clerkConfigured
          ? "Account scoped"
          : snapshot.readiness.clerkConfigured
            ? "Core needed"
            : "Clerk needed",
      title: "Bind the household",
    },
    {
      body: "Plaid Link creates the user-approved source for income detection and transfer handoff.",
      endpoint: "POST /api/app/bank-link/token",
      href: "#money-operations",
      icon: Link2,
      label: "Bank",
      ready: moneyRailReadiness.bankLinkReady,
      status: moneyRailReadiness.bankLinkReady
        ? "Ready"
        : moneyRailReadiness.plaidConfigured
          ? "Vault needed"
          : "Plaid needed",
      title: "Connect the bank source",
    },
    {
      body: "The core syncs linked-bank transactions, detects payroll-like credits, and stores the cursor for the next run.",
      endpoint: "POST /api/app/paychecks/sync",
      href: "#money-operations",
      icon: RefreshCw,
      label: "Sync",
      ready: moneyRailReadiness.transactionSyncReady,
      status: moneyRailReadiness.transactionSyncReady
        ? "Ready"
        : moneyRailReadiness.bankLinkReady
          ? "Core needed"
          : "Bank needed",
      title: "Sync linked-bank activity",
    },
    {
      body: "Paycheck-routing setup records the masked payroll destination before income events fund buckets.",
      endpoint: "POST /api/app/direct-deposit",
      href: "#money-operations",
      icon: Landmark,
      label: "Routing",
      ready: snapshot.readiness.liveMoneyReady,
      status: snapshot.readiness.liveMoneyReady ? "Instructions" : "Provider activation",
      title: "Set paycheck routing",
    },
    {
      body: "Custom bucket targets, payees, priorities, and unlock rules are set before a paycheck is split.",
      endpoint: "POST /api/app/buckets",
      href: "#bucket-studio",
      icon: Split,
      label: "Rules",
      ready: true,
      status: snapshot.readiness.postgresSchemaVerified ? "Durable" : "Editable",
      title: "Build the rules",
    },
    {
      body: "Approved destinations bind each protected bucket to real-world obligations before money is released.",
      endpoint: "POST /api/app/payees",
      href: "#payee-controls",
      icon: UserRoundCheck,
      label: "Payees",
      ready: true,
      status: "Editable",
      title: "Approve destinations",
    },
    {
      body: "Income events post a journal entry and recalculate protected money versus Safe to Spend.",
      endpoint: "POST /api/app/paychecks/detect",
      href: "#money-operations",
      icon: Radar,
      label: "Income",
      ready: moneyRailReadiness.paycheckDetectionReady,
      status: moneyRailReadiness.paycheckDetectionReady
        ? "Auto"
        : moneyRailReadiness.bankLinkReady
          ? "Signing needed"
          : "Setup needed",
      title: "Detect the paycheck",
    },
    {
      body: "Every card or transfer decision checks Safe to Spend, approved payees, and protected buckets.",
      endpoint: "POST /api/card/authorize",
      href: "#card-authorization",
      icon: CreditCard,
      label: "Spend",
      ready: snapshot.readiness.liveMoneyReady,
      status: snapshot.readiness.liveMoneyReady ? "Gateway" : "Ledger",
      title: "Approve or decline",
    },
  ];
  const completedSetupSteps = setupSteps.filter((step) => step.ready).length;
  const nextSetupStep =
    setupSteps.find((step) => !step.ready) ?? setupSteps[setupSteps.length - 1];
  const NextIcon = nextSetupStep.icon;
  const activationFlightDeck = [
    {
      body: "Paid access is the first switch. A household pays, the webhook records access, and the money tools open for that account.",
      endpoint: "POST /api/app/billing/checkout",
      href: "#money-operations",
      icon: BadgeDollarSign,
      label: "Earn",
      ready: commercialReadiness.paidAccessReady,
      status: commercialReadiness.paidAccessReady
        ? "active"
        : commercialReadiness.checkoutConfigured
          ? "activation pending"
          : "Stripe setup",
      title: `Collect ${commercialReadiness.priceLabel}`,
    },
    {
      body: "Authenticated households connect a funding source through Plaid Link, then the token moves into server-side custody.",
      endpoint: "POST /api/app/bank-link/token",
      href: "#money-operations",
      icon: Link2,
      label: "Connect",
      ready: moneyRailReadiness.bankLinkReady,
      status: moneyRailReadiness.bankLinkReady
        ? "ready"
        : moneyRailReadiness.plaidConfigured
          ? "vault setup"
          : "Plaid setup",
      title: "Connect the bank source",
    },
    {
      body: "Employer, amount, frequency, and provider rules turn account activity into a paycheck event PayShield can split.",
      endpoint: "POST /api/app/paychecks/sync",
      href: "#money-operations",
      icon: RefreshCw,
      label: "Sync",
      ready: moneyRailReadiness.transactionSyncReady,
      status: moneyRailReadiness.transactionSyncReady ? "sync ready" : "core needed",
      title: "Recognize payroll",
    },
    {
      body: "Rules and controlled detections are still available for setup, support, and exception handling.",
      endpoint: "POST /api/app/paychecks/rules",
      href: "#money-operations",
      icon: Radar,
      label: "Rules",
      ready: moneyRailReadiness.paycheckDetectionReady,
      status: moneyRailReadiness.paycheckDetectionReady
        ? "automatic"
        : "rule check",
      title: "Tune detection rules",
    },
    {
      body: "Custom buckets, priorities, due rules, approved payees, and unlock rules define what money is protected before spending.",
      endpoint: "POST /api/app/buckets",
      href: "#bucket-studio",
      icon: Split,
      label: "Protect",
      ready: true,
      status: snapshot.readiness.postgresSchemaVerified ? "durable" : "editable",
      title: "Lock the obligations first",
    },
    {
      body: "Transfers and card decisions validate Safe to Spend, protected balances, approved destinations, and provider handoff state.",
      endpoint: "POST /api/app/transfers",
      href: "#money-operations",
      icon: CreditCard,
      label: "Release",
      ready: moneyRailReadiness.transferReady || snapshot.readiness.liveMoneyReady,
      status: moneyRailReadiness.transferReady
        ? "movement ready"
        : "intent validation",
      title: "Move only approved money",
    },
  ];

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
              href="#money-engine"
            >
              Engine
            </a>
            <a
              className="pay-primary-nav-link rounded-[8px] px-3 py-2 text-center hover:bg-white/10"
              href="#bucket-studio"
            >
              Buckets
            </a>
            <a
              className="pay-primary-nav-link rounded-[8px] px-3 py-2 text-center hover:bg-white/10"
              href="#control-plan"
            >
              Plan
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
              href="#money-flow"
            >
              Money flow
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </nav>
        </header>

        <section
          className="grid gap-6 border-b border-white/10 py-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]"
          id="money-flow"
        >
          <div className="brand-panel accent-rule rounded-[8px] p-5 sm:p-7">
            <p className="inline-flex items-center gap-2 rounded-[8px] border border-[#39e8ff]/30 bg-[#39e8ff]/10 px-3 py-2 text-sm font-black uppercase text-[#dffaff]">
              Revenue + real money controls
            </p>
            <h1 className="mt-6 max-w-3xl pb-2 text-4xl font-black leading-[1.16] text-white sm:text-5xl lg:text-[3.3rem]">
              Charge the household. Connect the paycheck. Protect the money.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[#c9d0da]">
              PayShield is usable as one guided operating flow: collect the
              subscription, connect the household funding source, detect payroll,
              fund protected buckets first, and release only what the rules
              approve.
            </p>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <StatusMetric
                icon={BadgeDollarSign}
                label="Revenue"
                value={commercialReadiness.priceLabel}
              />
              <StatusMetric
                icon={LockKeyhole}
                label="Protected now"
                value={formatCents(protectedCents)}
              />
              <StatusMetric
                icon={WalletCards}
                label="Spendable now"
                value={formatCents(safeSpend)}
              />
            </div>

            <div className="mt-6 grid gap-2 sm:grid-cols-3">
              <a
                className="brand-button-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] px-4 text-sm font-black"
                href="#money-operations"
              >
                <BadgeDollarSign className="size-4" aria-hidden="true" />
                Collect payment
              </a>
              <a
                className="brand-button-blue inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] px-4 text-sm font-black"
                href="#money-operations"
              >
                <Link2 className="size-4" aria-hidden="true" />
                Connect bank
              </a>
              <a
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border border-[#ffb237]/30 bg-[#ffb237]/10 px-4 text-sm font-black text-[#ffe4ad] hover:bg-[#ffb237]/15"
                href="#bucket-studio"
              >
                <Split className="size-4" aria-hidden="true" />
                Edit buckets
              </a>
            </div>
          </div>

          <div className="brand-panel rounded-[8px] p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="brand-kicker">Actual operating flow</p>
                <h2 className="mt-1 text-2xl font-black text-white">
                  Six actions make the product work.
                </h2>
              </div>
              <Link
                className="brand-button-blue inline-flex min-h-10 items-center justify-center gap-2 rounded-[8px] px-3 text-sm font-black"
                href="/launch"
              >
                Owner console
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>

            <div className="mt-5 grid gap-3">
              {activationFlightDeck.map((step, index) => {
                const Icon = step.icon;

                return (
                  <a
                    className="grid gap-3 rounded-[8px] border border-white/10 bg-black/35 p-3 transition hover:border-[#39e8ff]/35 hover:bg-[#39e8ff]/10 sm:grid-cols-[2.8rem_minmax(0,1fr)_auto]"
                    href={step.href}
                    key={step.label}
                  >
                    <span
                      className={`grid size-11 place-items-center rounded-[8px] border ${
                        step.ready
                          ? "border-[#68f0c2]/25 bg-[#68f0c2]/10 text-[#68f0c2]"
                          : "border-[#ffb237]/25 bg-[#ffb237]/10 text-[#ffcf72]"
                      }`}
                    >
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="text-xs font-black uppercase text-[#8f99aa]">
                        {String(index + 1).padStart(2, "0")} / {step.label}
                      </span>
                      <span className="mt-1 block text-base font-black text-white">
                        {step.title}
                      </span>
                      <span className="mt-1 block text-sm leading-6 text-[#c9d0da]">
                        {step.body}
                      </span>
                      <span className="mt-2 block overflow-x-auto font-mono text-[0.68rem] font-black uppercase text-[#39e8ff]">
                        {step.endpoint}
                      </span>
                    </span>
                    <span
                      className={`inline-flex h-8 items-center justify-center rounded-[8px] px-2.5 text-xs font-black capitalize ${
                        step.ready
                          ? "bg-[#68f0c2]/10 text-[#9af7d5]"
                          : "bg-[#ffb237]/10 text-[#ffe4ad]"
                      }`}
                    >
                      {step.status}
                    </span>
                  </a>
                );
              })}
            </div>
          </div>
        </section>

        <MoneyControlPlanPanel initialPlan={initialControlPlan} />

        <MoneyOperationsPanel
          buckets={snapshot.buckets}
          initialOperations={initialOperations}
          initialReadiness={initialOperationsReadiness}
          payees={snapshot.payees}
        />

        <section
          id="activation-console"
          className="grid gap-6 border-b border-white/10 py-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]"
        >
          <MoneySetupConsole initialPacket={initialActivationPacket} />

          <div className="grid gap-5">
            <div className="brand-panel rounded-[8px] p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="brand-kicker">Household setup</p>
                  <h2 className="mt-1 text-2xl font-black text-white">
                    One next move, then the next rail opens.
                  </h2>
                </div>
                <span className="rounded-[8px] border border-[#39e8ff]/25 bg-[#39e8ff]/10 px-3 py-2 text-sm font-black text-[#dffaff]">
                  {completedSetupSteps}/{setupSteps.length} active
                </span>
              </div>

              <a
                className="mt-5 grid gap-3 rounded-[8px] border border-[#ffb237]/30 bg-[#ffb237]/10 p-4 transition hover:border-[#ffcf72]/45 hover:bg-[#ffb237]/15 sm:grid-cols-[44px_1fr_auto]"
                href={nextSetupStep.href}
              >
                <span className="grid size-11 place-items-center rounded-[8px] border border-[#ffb237]/25 bg-black/35 text-[#ffcf72]">
                  <NextIcon className="size-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="text-xs font-black uppercase text-[#ffcf72]">
                    Next best action
                  </span>
                  <span className="mt-1 block text-base font-black text-white">
                    {nextSetupStep.title}
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-[#ffe4bd]">
                    {nextSetupStep.body}
                  </span>
                  <span className="mt-2 block overflow-x-auto font-mono text-[0.68rem] font-black uppercase text-[#ffcf72]">
                    {nextSetupStep.endpoint}
                  </span>
                </span>
                <span className="inline-flex h-10 items-center justify-center rounded-[8px] bg-white px-3 text-sm font-black text-[#050607]">
                  Open
                </span>
              </a>

              <div className="mt-5 grid gap-2">
                {setupSteps.map((step, index) => {
                  const Icon = step.icon;
                  const tone = stepTone(step.ready);

                  return (
                    <a
                      className="grid grid-cols-[2.25rem_1fr_auto] items-center gap-3 rounded-[8px] border border-white/10 bg-black/40 p-3 transition hover:border-[#39e8ff]/35 hover:bg-[#39e8ff]/10"
                      href={step.href}
                      key={step.label}
                    >
                      <span
                        className={`grid size-9 place-items-center rounded-[8px] border ${
                          tone === "ready"
                            ? "border-[#39e8ff]/20 bg-[#39e8ff]/10 text-[#39e8ff]"
                            : "border-[#ffb237]/25 bg-[#ffb237]/10 text-[#ffcf72]"
                        }`}
                      >
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <span className="text-xs font-black uppercase text-[#8f99aa]">
                          {String(index + 1).padStart(2, "0")} / {step.label}
                        </span>
                        <span className="block truncate text-sm font-black text-white">
                          {step.title}
                        </span>
                        <span className="mt-1 block overflow-x-auto font-mono text-[0.68rem] font-black uppercase text-[#39e8ff]">
                          {step.endpoint}
                        </span>
                      </span>
                      <span
                        className={`rounded-[8px] px-2.5 py-1 text-xs font-black ${
                          tone === "ready"
                            ? "bg-[#39e8ff]/10 text-[#dffaff]"
                            : "bg-[#ffb237]/10 text-[#ffe4ad]"
                        }`}
                      >
                        {step.status}
                      </span>
                    </a>
                  );
                })}
              </div>
            </div>

            <div className="brand-panel-soft rounded-[8px] p-5">
              <div className="flex items-start gap-3">
                <WalletCards className="mt-1 size-5 shrink-0 text-[#39e8ff]" aria-hidden="true" />
                <div>
                  <p className="brand-kicker">Usable product map</p>
                  <h2 className="mt-1 text-2xl font-black text-white">
                    The app is monetized before rails turn on.
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-[#c9d0da]">
                    A household pays first. Bank link, payroll detection,
                    protected transfers, bill routing, card decisions, unlocks,
                    and audit exports then operate behind the paid household
                    record.
                  </p>
                </div>
              </div>
              <div className="mt-5 grid gap-2">
                {[
                  "Stripe checkout records paid household access.",
                  "Plaid Link connects the external bank and vaults the token.",
                  "Payroll rules and sync detect deposits before spending.",
                  "Buckets, payees, unlocks, transfers, and card decisions enforce the ledger.",
                ].map((step, index) => (
                  <div
                    className="grid grid-cols-[2rem_1fr] items-center gap-3 rounded-[8px] border border-white/10 bg-black/35 p-3"
                    key={step}
                  >
                    <span className="grid size-8 place-items-center rounded-[8px] bg-[#39e8ff] text-sm font-black text-[#050607]">
                      {index + 1}
                    </span>
                    <p className="text-sm font-black leading-5 text-white">
                      {step}
                    </p>
                  </div>
                ))}
              </div>
              <Link
                className="brand-button-blue mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] px-4 text-sm font-black"
                href="/launch"
              >
                Open owner activation console
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        <MoneyEngineConsole initialPacket={initialActivationPacket} />

        <section
          id="readiness"
          className="grid gap-6 border-t border-white/10 py-8 lg:grid-cols-[0.9fr_1.1fr]"
        >
          <div className="brand-panel rounded-[8px] p-5">
            <p className="brand-kicker">Readiness state</p>
            <h2 className="mt-2 text-3xl font-black text-white">
              Activation gates protect the money path.
            </h2>
            <p className="mt-4 text-sm leading-6 text-[#c9d0da]">
              {REGULATED_PARTNER_DISCLOSURE} The app can still enforce household
              rules, validate decisions, and collect support requests while
              provider activation remains controlled.
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
                className="inline-flex min-h-9 items-center font-black text-[#39e8ff] underline"
                href={`mailto:${GRAYSTON_SUPPORT_EMAIL}`}
              >
                {GRAYSTON_SUPPORT_EMAIL}
              </a>
              .
            </p>
          </div>
        </section>
      </div>

      <BucketControlPanel buckets={snapshot.buckets} />
      <BillRoutingWorkspace
        buckets={snapshot.buckets}
        payees={snapshot.payees}
      />
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
