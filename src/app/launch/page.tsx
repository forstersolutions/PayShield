import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowRightLeft,
  BadgeDollarSign,
  CheckCircle2,
  Database,
  KeyRound,
  Link2,
  LockKeyhole,
  Mail,
  Radar,
  ReceiptText,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  GraystonLogo,
  PayShieldHeaderLogo,
} from "@/app/components/pay-shield-mark";
import { MoneyEngineConsole } from "@/app/components/money-engine-console";
import { PublicCheckoutForm } from "@/app/components/public-checkout-form";
import { SiteFooter } from "@/app/components/site-footer";
import {
  GRAYSTON_SUPPORT_EMAIL,
  PAYSHIELD_OWNERSHIP_LINE,
} from "@/app/lib/brand";
import { getAppAccessReadiness } from "@/app/lib/neobank/app-access.ts";
import { getCommercialReadiness } from "@/app/lib/commercial/billing.ts";
import { getMoneyRailReadiness } from "@/app/lib/neobank/money-rails.ts";
import { createHouseholdActivationPacket } from "@/app/lib/neobank/operations.ts";
import { getNeobankReadiness } from "@/app/lib/neobank/readiness.ts";
import { friendlyGateLabel } from "@/app/lib/readiness-gates.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "PayShield Revenue + Rails Console",
  description:
    "Redacted PayShield operator console for revenue setup, app access, bank connection, paycheck detection, protected transfers, and live-money readiness.",
  robots: {
    follow: false,
    index: false,
  },
};

type ActivationStage = ReturnType<
  typeof createHouseholdActivationPacket
>["activationPlan"]["stages"][number];

type ActivationSetupGroup = ReturnType<
  typeof createHouseholdActivationPacket
>["operatorRunbook"]["setupGroups"][number];

type ConsoleTrack = {
  body: string;
  endpoint: string;
  env: string[];
  icon: LucideIcon;
  key: string;
  ready: boolean;
  status: string;
  title: string;
};

function cleanStatus(value: string) {
  return value.replace(/_/g, " ");
}

function unique(values: string[]) {
  return [...new Set(values)].filter(Boolean);
}

function gateInAny(gate: string, patterns: string[]) {
  return patterns.some((pattern) => gate.includes(pattern));
}

function StageCard({ stage }: { stage: ActivationStage }) {
  const Icon = stage.ready ? CheckCircle2 : KeyRound;

  return (
    <article
      className={`rounded-[8px] border p-4 ${
        stage.ready
          ? "border-[#68f0c2]/25 bg-[#68f0c2]/10"
          : "border-[#ffb237]/25 bg-[#ffb237]/10"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="brand-kicker">{stage.label}</p>
          <h3 className="mt-1 text-lg font-black text-white">{stage.title}</h3>
        </div>
        <Icon
          className={`size-5 shrink-0 ${
            stage.ready ? "text-[#68f0c2]" : "text-[#ffcf72]"
          }`}
          aria-hidden="true"
        />
      </div>
      <p className="mt-3 text-sm leading-6 text-[#c9d0da]">
        {stage.businessImpact}
      </p>
      <div className="mt-4 rounded-[8px] border border-white/10 bg-black/35 p-3">
        <p className="font-mono text-xs font-black text-[#dffaff]">
          {stage.primaryEndpoint}
        </p>
        <p className="mt-2 text-xs font-black capitalize text-[#ffcf72]">
          {cleanStatus(stage.status)}
        </p>
      </div>
    </article>
  );
}

function BlockerGroupCard({
  group,
}: {
  group: {
    action: string;
    detail: string;
    icon: LucideIcon;
    key: string;
    title: string;
    gates: string[];
  };
}) {
  const Icon = group.icon;

  return (
    <article
      className={`rounded-[8px] border p-4 ${
        group.gates.length
          ? "border-[#ffb237]/25 bg-[#ffb237]/10"
          : "border-[#68f0c2]/25 bg-[#68f0c2]/10"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="brand-kicker">{group.key}</p>
          <h3 className="mt-1 text-lg font-black text-white">{group.title}</h3>
        </div>
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-[8px] border ${
            group.gates.length
              ? "border-[#ffb237]/25 bg-black/30 text-[#ffcf72]"
              : "border-[#68f0c2]/25 bg-black/30 text-[#68f0c2]"
          }`}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-[#c9d0da]">{group.detail}</p>
      <p className="mt-3 text-sm font-black leading-6 text-white">
        {group.action}
      </p>
      <div className="mt-4 grid gap-2">
        {group.gates.length ? (
          group.gates.slice(0, 6).map((gate) => (
            <div
              className="grid gap-1 rounded-[8px] border border-white/10 bg-black/35 px-3 py-2"
              key={`${group.key}-${gate}`}
            >
              <span className="text-sm font-black text-white">
                {friendlyGateLabel(gate)}
              </span>
              <code className="overflow-x-auto font-mono text-xs font-bold text-[#ffcf72]">
                {gate}
              </code>
            </div>
          ))
        ) : (
          <p className="rounded-[8px] border border-[#68f0c2]/20 bg-black/30 px-3 py-2 text-sm font-black text-[#9af7d5]">
            Ready in the current production evidence.
          </p>
        )}
      </div>
    </article>
  );
}

function ConsoleTrackCard({ track }: { track: ConsoleTrack }) {
  const Icon = track.icon;

  return (
    <article
      className={`grid gap-4 rounded-[8px] border p-4 sm:grid-cols-[2.9rem_minmax(0,1fr)_auto] ${
        track.ready
          ? "border-[#68f0c2]/25 bg-[#68f0c2]/10"
          : "border-white/10 bg-black/35"
      }`}
    >
      <span className="grid size-11 place-items-center rounded-[8px] border border-[#39e8ff]/25 bg-[#39e8ff]/10 text-[#39e8ff]">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="brand-kicker">{track.key}</span>
        <span className="mt-1 block text-lg font-black text-white">
          {track.title}
        </span>
        <span className="mt-2 block text-sm leading-6 text-[#c9d0da]">
          {track.body}
        </span>
        <span className="mt-3 block rounded-[8px] border border-white/10 bg-black/45 px-3 py-2 font-mono text-xs font-bold text-[#dffaff]">
          {track.endpoint}
        </span>
      </span>
      <span className="grid gap-2 sm:min-w-[14rem]">
        <span
          className={`inline-flex min-h-8 items-center justify-center rounded-[8px] px-3 text-center text-xs font-black capitalize ${
            track.ready
              ? "bg-[#68f0c2]/10 text-[#9af7d5]"
              : "bg-[#ffb237]/10 text-[#ffe4ad]"
          }`}
        >
          {track.status}
        </span>
        <span className="rounded-[8px] border border-white/10 bg-white/[0.04] p-3 text-xs leading-5 text-[#aab3c2]">
          {track.env.map((item) => (
            <code
              className="mb-1 block overflow-x-auto font-mono text-[#dffaff]"
              key={item}
            >
              {item}
            </code>
          ))}
        </span>
      </span>
    </article>
  );
}

function WorkbenchGroupCard({ group }: { group: ActivationSetupGroup }) {
  return (
    <article
      className={`rounded-[8px] border p-4 ${
        group.ready
          ? "border-[#68f0c2]/25 bg-[#68f0c2]/10"
          : "border-white/10 bg-black/35"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-black uppercase text-[#8f99aa]">
            {group.endpoint}
          </p>
          <h3 className="mt-1 text-xl font-black text-white">{group.title}</h3>
        </div>
        <span
          className={`rounded-[8px] px-3 py-1.5 text-xs font-black uppercase ${
            group.ready
              ? "bg-[#68f0c2]/10 text-[#9af7d5]"
              : "bg-[#ffb237]/10 text-[#ffe4ad]"
          }`}
        >
          {group.ready ? "Ready" : "Needs setup"}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-[#c9d0da]">
        {group.productAction}
      </p>
      <p className="mt-2 text-xs font-bold leading-5 text-[#aab3c2]">
        Unlocks: {group.unlocks}
      </p>
      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <div>
          <p className="brand-kicker">Vercel env setup</p>
          <div className="mt-2 grid gap-2">
            {group.setupCommands.map((command) => (
              <code
                className="block overflow-x-auto rounded-[8px] border border-white/10 bg-black/45 px-3 py-2 font-mono text-xs font-bold text-[#dffaff]"
                key={command}
              >
                {command}
              </code>
            ))}
          </div>
        </div>
        <div>
          <p className="brand-kicker">Verify</p>
          <div className="mt-2 grid gap-2">
            {group.checks.map((command) => (
              <code
                className="block overflow-x-auto rounded-[8px] border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-xs font-bold text-[#ffe4ad]"
                key={command}
              >
                {command}
              </code>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

function Metric({
  label,
  ready,
  value,
}: {
  label: string;
  ready: boolean;
  value: string;
}) {
  return (
    <div
      className={`min-w-0 rounded-[8px] border p-3 ${
        ready
          ? "border-[#68f0c2]/25 bg-[#68f0c2]/10"
          : "border-[#ffb237]/25 bg-[#ffb237]/10"
      }`}
    >
      <p className="brand-kicker">{label}</p>
      <p className="mt-2 break-words text-2xl font-black capitalize text-white">
        {value}
      </p>
      <p
        className={`mt-1 text-xs font-black ${
          ready ? "text-[#9af7d5]" : "text-[#ffe4ad]"
        }`}
      >
        {ready ? "Ready" : "Needs setup"}
      </p>
    </div>
  );
}

export default function LaunchConsolePage() {
  const appAccess = getAppAccessReadiness();
  const commercial = getCommercialReadiness();
  const moneyRails = getMoneyRailReadiness();
  const neobank = getNeobankReadiness();
  const packet = createHouseholdActivationPacket();
  const stages = packet.activationPlan.stages;
  const nextStage =
    stages.find((stage) => stage.key === packet.activationPlan.nextStageKey) ??
    stages[0];
  const allRemainingGates = unique([
    ...commercial.missing,
    ...moneyRails.missing,
    ...neobank.gates.filter((gate) => !gate.ok).map((gate) => gate.id),
    ...appAccess.missing,
  ]);
  const blockerGroups = [
    {
      action:
        "Create the Stripe subscription price, add the live key and webhook secret, then point webhook activation at the core service.",
      detail:
        "This is the money-making path. It turns a household email into paid access before private money controls open.",
      gates: allRemainingGates.filter(
        (gate) =>
          gateInAny(gate, ["STRIPE", "COMMERCIAL"]) ||
          gate === "core_service_auth",
      ),
      icon: BadgeDollarSign,
      key: "Configure now",
      title: "Revenue activation",
    },
    {
      action:
        "Add Plaid credentials, the signed token-vault webhook URL, and a 32-byte encryption key before launching bank connections.",
      detail:
        "This makes bank linking and paycheck detection real by keeping access tokens out of the browser.",
      gates: allRemainingGates.filter((gate) =>
        gateInAny(gate, ["PLAID", "TOKEN_VAULT"]),
      ),
      icon: Link2,
      key: "Configure now",
      title: "Bank link and token custody",
    },
    {
      action:
        "Deploy the always-on core service, attach Postgres, run schema verification, and configure Clerk keys for household identity.",
      detail:
        "This moves the product from Vercel control surfaces to durable household records, ledger journals, and authenticated access.",
      gates: allRemainingGates.filter((gate) =>
        [
          "clerk_auth",
          "core_service_auth",
          "dedicated_backend",
          "postgres_ledger",
        ].includes(gate),
      ),
      icon: Database,
      key: "Configure now",
      title: "Core ledger and household auth",
    },
    {
      action:
        "Finish provider selection, record the contract and credentials, then complete counsel and operations approvals before enabling live money.",
      detail:
        "These gates are intentionally external because account opening, card authorization, and money movement need approved operating evidence.",
      gates: allRemainingGates.filter((gate) =>
        [
          "counsel_signoff",
          "operations_runbooks",
          "provider_adapter",
          "provider_contract",
          "provider_credentials",
          "sponsor_disclosures",
        ].includes(gate) || gateInAny(gate, ["BAAS", "TRANSFER"]),
      ),
      icon: ShieldCheck,
      key: "Approval required",
      title: "Provider, counsel, and live-money gates",
    },
  ];
  const setupTracks: ConsoleTrack[] = [
    {
      body:
        "This is the money-making lane. Paid access starts through Stripe checkout or a payment link, then the webhook activates the household in the always-on core.",
      endpoint: "POST /api/app/billing/checkout + POST /api/app/billing/webhook",
      env: [
        "STRIPE_SECRET_KEY",
        "PAYSHIELD_COMMERCIAL_PRICE_ID or PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL",
        "STRIPE_WEBHOOK_SECRET",
        "PAYSHIELD_CORE_API_URL",
      ],
      icon: BadgeDollarSign,
      key: "Revenue",
      ready: commercial.paidAccessReady,
      status: commercial.paidAccessReady
        ? "Paid access ready"
        : commercial.checkoutConfigured
          ? "Webhook or core needed"
          : "Stripe setup needed",
      title: `Collect ${commercial.priceLabel} per household`,
    },
    {
      body:
        "This opens the real app safely. Clerk maps each signed-in subject to a PayShield household before buckets, payees, ledger events, and support records can be touched.",
      endpoint: "GET /api/app/me + protected /app routes",
      env: [
        "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
        "CLERK_SECRET_KEY",
        "PAYSHIELD_REVIEW_APP_ACCESS_TOKEN 16+ chars for tokenized owner review",
        "/app?review_access_token=<token> sets the secure review cookie",
        "PAYSHIELD_ALLOW_REVIEW_APP_ACCESS for controlled review only",
      ],
      icon: LockKeyhole,
      key: "Access",
      ready: !appAccess.locked,
      status: appAccess.mode,
      title: "Unlock authenticated household access",
    },
    {
      body:
        "This lets households connect a funding source. Plaid Link creates the handoff, then token custody stores the access token outside the browser.",
      endpoint: "POST /api/app/bank-link/token + POST /api/app/bank-link/exchange",
      env: [
        "PLAID_CLIENT_ID",
        "PLAID_SECRET",
        "PLAID_ENV",
        "PAYSHIELD_TOKEN_VAULT_KEY_ID",
        "PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL or PAYSHIELD_CORE_API_URL",
        "PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET",
      ],
      icon: Link2,
      key: "Bank link",
      ready: moneyRails.bankLinkReady,
      status: moneyRails.bankLinkReady
        ? "Bank link ready"
        : moneyRails.plaidConfigured
          ? "Token vault needed"
          : "Plaid setup needed",
      title: "Connect household banks",
    },
    {
      body:
        "This turns linked-bank income activity into protected bucket funding. The app saves payroll rules, syncs Plaid transactions, accepts signed provider events, and posts balanced ledger splits.",
      endpoint:
        "POST /api/app/paychecks/rules + POST /api/app/paychecks/sync + POST /api/provider/webhooks",
      env: [
        "PLAID_CLIENT_ID",
        "PLAID_SECRET",
        "PAYSHIELD_TOKEN_VAULT_ENCRYPTION_KEY",
        "PAYSHIELD_PROVIDER_WEBHOOK_SECRET",
        "PAYSHIELD_LEDGER_DATABASE_URL",
        "PAYSHIELD_LEDGER_SCHEMA_VERIFIED=true",
        "PAYSHIELD_CORE_REQUIRE_DURABLE_STORAGE=true",
      ],
      icon: Radar,
      key: "Paycheck detection",
      ready: moneyRails.paycheckDetectionReady,
      status: moneyRails.paycheckDetectionReady
        ? "Automatic detection ready"
        : moneyRails.detectionMode,
      title: "Detect deposits and split buckets",
    },
    {
      body:
        "This is the release valve. PayShield validates bucket balance, approved destination, and provider handoff state before protected funds can move.",
      endpoint: "POST /api/app/transfers + POST /api/card/authorize",
      env: [
        "PAYSHIELD_TRANSFER_ENABLED=true",
        "PAYSHIELD_BAAS_PROVIDER",
        "PAYSHIELD_BAAS_ADAPTER=http_json",
        "PAYSHIELD_BAAS_API_BASE_URL",
        "PAYSHIELD_BAAS_API_KEY",
        "PAYSHIELD_LIVE_MONEY_ENABLED=true after gates pass",
        "PAYSHIELD_CORE_REQUIRE_DURABLE_STORAGE=true",
      ],
      icon: ArrowRightLeft,
      key: "Money movement",
      ready: moneyRails.transferReady && neobank.liveMoneyReady,
      status: moneyRails.transferReady
        ? "Transfers ready"
        : moneyRails.transferConfigured
          ? "Live gates needed"
          : "Intent validation active",
      title: "Move funds only after rules pass",
    },
  ];

  return (
    <main className="bg-[#050607] text-[#f7f8fb]">
      <section className="pay-app-shell relative min-h-screen overflow-x-hidden">
        <span
          aria-hidden="true"
          className="data-line left-[6%] top-[14rem] h-px w-[58rem] rotate-[-16deg]"
        />
        <span
          aria-hidden="true"
          className="data-line right-[-17rem] top-[36rem] h-px w-[52rem] rotate-[24deg]"
        />
        <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
          <header className="pay-header">
            <Link
              aria-label="PayShield home"
              className="pay-header-brand min-w-0"
              href="/"
            >
              <PayShieldHeaderLogo priority />
            </Link>
            <nav
              aria-label="Launch console"
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
                href="#money"
              >
                Money
              </a>
              <a
                className="pay-primary-nav-link rounded-[8px] px-3 py-2 text-center hover:bg-white/10"
                href="#rails"
              >
                Rails
              </a>
              <a
                className="pay-primary-nav-link rounded-[8px] px-3 py-2 text-center hover:bg-white/10"
                href="#activation-workbench"
              >
                Setup
              </a>
              <a
                className="pay-primary-nav-link rounded-[8px] px-3 py-2 text-center hover:bg-white/10"
                href="#commands"
              >
                Verify
              </a>
              <Link
                className="pay-primary-nav-link pay-primary-nav-cta brand-button-primary gap-2 rounded-[8px] px-4 py-2 font-black"
                href="/app#money-operations"
              >
                Open app
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </nav>
          </header>

          <MoneyEngineConsole initialPacket={packet} />

          <div className="grid min-w-0 flex-1 gap-6 py-8 lg:grid-cols-[0.95fr_1.05fr]">
            <section className="brand-panel accent-rule min-w-0 rounded-[8px] p-5 sm:p-7">
              <p className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-[8px] border border-[#39e8ff]/30 bg-[#39e8ff]/10 px-3 py-2 text-sm font-black uppercase text-[#dffaff]">
                <ShieldCheck className="size-4" aria-hidden="true" />
                <span className="min-w-0 break-words">
                  PayShield Revenue + Rails Console
                </span>
              </p>
              <h1 className="mt-6 max-w-3xl break-words text-4xl font-black leading-[1.02] text-white sm:text-5xl lg:text-[3.3rem]">
                Make the app earn, connect, detect, protect, and move.
              </h1>
              <p className="mt-5 max-w-2xl break-words text-lg leading-8 text-[#c9d0da]">
                PayShield becomes usable in one operating sequence: collect
                paid household access, open authenticated app access, connect a
                bank source, detect paycheck deposits, split protected buckets,
                then release only what the ledger allows.
              </p>

              <div className="mt-7 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Metric
                  label="Paid access"
                  ready={commercial.paidAccessReady}
                  value={commercial.priceLabel}
                />
                <Metric
                  label="App access"
                  ready={!appAccess.locked}
                  value={appAccess.mode}
                />
                <Metric
                  label="Bank link"
                  ready={moneyRails.bankLinkReady}
                  value={moneyRails.plaidEnv}
                />
                <Metric
                  label="Live controls"
                  ready={neobank.liveMoneyReady}
                  value={neobank.mode}
                />
              </div>

              <div className="mt-7 rounded-[8px] border border-[#ffb237]/30 bg-[#ffb237]/10 p-4">
                <div className="flex items-start gap-3">
                  <ReceiptText
                    className="mt-0.5 size-5 shrink-0 text-[#ffcf72]"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-sm font-black uppercase text-[#ffcf72]">
                      Next executable move
                    </p>
                    <h2 className="mt-1 text-2xl font-black text-white">
                      {nextStage.title}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-[#ffe4ad]">
                      {nextStage.ownerAction}
                    </p>
                    <code className="mt-3 block overflow-x-auto rounded-[8px] border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs font-bold text-[#dffaff]">
                      {nextStage.primaryEndpoint}
                    </code>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid min-w-0 gap-5">
              <div className="brand-panel min-w-0 max-w-full overflow-hidden rounded-[8px] p-5">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="brand-kicker">Operator clarity</p>
                    <h2 className="mt-1 break-words text-2xl font-black text-white">
                      The product is wired. These are the remaining switches.
                    </h2>
                  </div>
                  <div className="flex h-12 items-center rounded-[8px] border border-white/10 bg-black/45 px-3">
                    <GraystonLogo className="h-8 w-auto" />
                  </div>
                </div>
                <p className="mt-4 break-words text-sm leading-6 text-[#c9d0da]">
                  {PAYSHIELD_OWNERSHIP_LINE} Product and support requests route
                  to{" "}
                  <a
                    className="font-black text-[#39e8ff] underline"
                    href={`mailto:${GRAYSTON_SUPPORT_EMAIL}`}
                  >
                    {GRAYSTON_SUPPORT_EMAIL}
                  </a>
                  .
                </p>
                <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2">
                  <Link
                    className="brand-button-primary inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-[8px] px-4 text-center text-sm font-black"
                    href="/app#money-operations"
                  >
                    Open money operations
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                  <a
                    className="brand-button-blue inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-[8px] px-4 text-center text-sm font-black"
                    href="/api/health"
                  >
                    View health JSON
                    <Database className="size-4" aria-hidden="true" />
                  </a>
                </div>
              </div>

              <div className="brand-panel min-w-0 max-w-full overflow-hidden rounded-[8px] p-5">
                <p className="brand-kicker">Remaining gates</p>
                <div className="mt-3 grid min-w-0 gap-2">
                  {allRemainingGates.length ? (
                    allRemainingGates.slice(0, 12).map((gate) => (
                      <div
                        className="grid min-w-0 gap-2 rounded-[8px] border border-white/10 bg-black/35 px-3 py-2 sm:grid-cols-[1fr_auto] sm:items-center"
                        key={gate}
                      >
                        <span className="min-w-0 break-words text-sm font-black text-white">
                          {friendlyGateLabel(gate)}
                        </span>
                        <code className="min-w-0 max-w-full overflow-x-auto font-mono text-xs font-bold text-[#ffcf72] sm:text-right">
                          {gate}
                        </code>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[8px] border border-[#68f0c2]/25 bg-[#68f0c2]/10 p-4 text-sm font-black text-[#9af7d5]">
                      All visible launch gates are ready.
                    </div>
                  )}
                </div>
              </div>

              <div className="brand-panel min-w-0 max-w-full overflow-hidden rounded-[8px] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="brand-kicker">Blocker map</p>
                    <h2 className="mt-1 break-words text-2xl font-black text-white">
                      What can be configured now versus what needs external approval.
                    </h2>
                  </div>
                  <span className="rounded-[8px] border border-[#39e8ff]/25 bg-[#39e8ff]/10 px-3 py-2 text-sm font-black text-[#dffaff]">
                    {allRemainingGates.length} open
                  </span>
                </div>
                <div className="mt-5 grid gap-3">
                  {blockerGroups.map((group) => (
                    <BlockerGroupCard
                      group={group}
                      key={`${group.key}-${group.title}`}
                    />
                  ))}
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>

      <section
        className="border-y border-white/10 bg-[#090b0d]"
        id="money"
      >
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:px-8">
          <div className="accent-rule pt-5">
            <p className="brand-kicker">Start here</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-black leading-tight text-white sm:text-4xl">
              Revenue comes first, then banking controls become usable.
            </h2>
            <p className="mt-4 max-w-3xl text-lg leading-8 text-[#c9d0da]">
              The household cannot reach bank-link, paycheck detection, direct
              deposit setup, transfers, or card decisions until paid access and
              app access are ready. That is the commercial gate.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-[0.92fr_1.08fr]" id="rails">
            <div className="self-start">
              <PublicCheckoutForm />
            </div>
            <div className="grid gap-3">
              {setupTracks.map((track) => (
                <ConsoleTrackCard key={track.key} track={track} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-[#050607]">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:px-8">
          <div className="accent-rule pt-5">
            <p className="brand-kicker">Operating sequence</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-black leading-tight text-white sm:text-4xl">
              Six stages from paid access to protected spending decisions.
            </h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {stages.map((stage) => (
              <StageCard key={stage.key} stage={stage} />
            ))}
          </div>
        </div>
      </section>

      <section
        className="border-b border-white/10 bg-[#090b0d]"
        id="activation-workbench"
      >
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:px-8">
          <div className="accent-rule flex flex-wrap items-end justify-between gap-5 pt-5">
            <div>
              <p className="brand-kicker">Activation workbench</p>
              <h2 className="mt-3 max-w-4xl text-3xl font-black leading-tight text-white sm:text-4xl">
                The setup path that makes PayShield earn money, connect banks,
                detect deposits, and protect funds.
              </h2>
              <p className="mt-4 max-w-3xl text-lg leading-8 text-[#c9d0da]">
                Every command below is copy-safe: it names the Vercel variable
                to add, but never prints a secret value. Each lane maps directly
                to the product action the user sees in the app.
              </p>
            </div>
            <span className="inline-flex min-h-11 items-center gap-2 rounded-[8px] border border-[#39e8ff]/25 bg-[#39e8ff]/10 px-4 text-sm font-black text-[#dffaff]">
              <Terminal className="size-4" aria-hidden="true" />
              {packet.operatorRunbook.activationEndpoint}
            </span>
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            {packet.operatorRunbook.setupGroups.map((group) => (
              <WorkbenchGroupCard group={group} key={group.key} />
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#090b0d]" id="commands">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-16 sm:px-6 lg:grid-cols-[0.78fr_1.22fr] lg:px-8">
          <div className="accent-rule pt-5">
            <p className="brand-kicker">Verification</p>
            <h2 className="mt-3 text-3xl font-black leading-tight text-white sm:text-4xl">
              Use these commands to prove the money path after every change.
            </h2>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                className="brand-button-blue inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] px-4 text-sm font-black"
                href="/api/health"
              >
                Health check
                <Database className="size-4" aria-hidden="true" />
              </a>
              <a
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border border-[#39e8ff]/30 bg-[#39e8ff]/10 px-4 text-sm font-black text-[#dffaff]"
                href={`mailto:${GRAYSTON_SUPPORT_EMAIL}`}
              >
                <Mail className="size-4" aria-hidden="true" />
                Grayston support
              </a>
            </div>
          </div>

          <div className="brand-panel rounded-[8px] p-4">
            <div className="grid gap-2">
              {packet.operatorRunbook.smokeCommands.map((command) => (
                <code
                  className="block overflow-x-auto rounded-[8px] border border-white/10 bg-black/45 px-3 py-2 font-mono text-xs font-bold text-[#dffaff]"
                  key={command}
                >
                  {command}
                </code>
              ))}
              <code className="block overflow-x-auto rounded-[8px] border border-white/10 bg-black/45 px-3 py-2 font-mono text-xs font-bold text-[#dffaff]">
                npm run verify
              </code>
              <code className="block overflow-x-auto rounded-[8px] border border-white/10 bg-black/45 px-3 py-2 font-mono text-xs font-bold text-[#dffaff]">
                npm run market:status -- https://payshield-lime.vercel.app
                --expect-site-url https://payshield-lime.vercel.app
              </code>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-white/10 bg-[#050607]">
        <div className="mx-auto grid max-w-7xl gap-3 px-4 py-10 sm:px-6 lg:px-8">
          <p className="text-xs font-black uppercase text-[#8f99aa]">
            Live-money gate names
          </p>
          <p className="max-w-5xl text-sm leading-6 text-[#aab3c2]">
            PAYSHIELD_LIVE_MONEY_ENABLED can only be true after
            PAYSHIELD_BAAS_CONTRACT_APPROVED, PAYSHIELD_BAAS_PROVIDER,
            PAYSHIELD_BAAS_ADAPTER, PAYSHIELD_BAAS_API_BASE_URL,
            PAYSHIELD_BAAS_API_KEY, PAYSHIELD_SPONSOR_DISCLOSURES_APPROVED,
            PAYSHIELD_REGULATED_COUNSEL_SIGNOFF,
            PAYSHIELD_OPERATIONS_RUNBOOKS_APPROVED,
            PAYSHIELD_LEDGER_DATABASE_URL, PAYSHIELD_LEDGER_SCHEMA_VERIFIED,
            PAYSHIELD_LEDGER_SCHEMA_VERIFIED_VERSION, PAYSHIELD_CORE_API_URL,
            CLERK_SECRET_KEY, and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY are ready.
          </p>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
