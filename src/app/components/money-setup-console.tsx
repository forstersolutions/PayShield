"use client";

import {
  BadgeDollarSign,
  CheckCircle2,
  CreditCard,
  FileDown,
  KeyRound,
  Landmark,
  Link2,
  Loader2,
  Radar,
  ShieldCheck,
  Split,
  Terminal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type ActivationStage = {
  actionHref: string;
  businessImpact: string;
  evidence: string;
  key: string;
  label: string;
  ownerAction: string;
  primaryEndpoint: string;
  ready: boolean;
  requiredGates: string[];
  setupChecklist: string[];
  status: string;
  title: string;
  userAction: string;
  verification: string;
};

type ActivationPacket = {
  activationPlan: {
    businessModel: {
      billingProvider: string;
      priceLabel: string;
      revenuePath: string;
      supportContact: string;
    };
    generatedAt: string;
    liveMoneyReady: boolean;
    nextStageKey: string;
    readyCount: number;
    revenueReady: boolean;
    stages: ActivationStage[];
    totalStages: number;
  };
  currentState: {
    commercialAccess?: {
      priceLabel?: string;
      state?: string;
    };
    moneyRails?: {
      bankLinkReady?: boolean;
      paycheckDetectionReady?: boolean;
      transferReady?: boolean;
    };
    readiness?: {
      liveMoneyReady?: boolean;
      mode?: string;
    };
    statusCards?: Array<{
      key: string;
      label: string;
      state: string;
    }>;
  };
  nextAction: {
    actionHref: string;
    ownerAction: string;
    primaryEndpoint: string;
    requiredGates: string[];
    title: string;
    userAction: string;
    verification: string;
  };
  operatorRunbook: {
    appActivationEndpoint?: string;
    auditEndpoint: string;
    authenticatedSmokeCommands?: string[];
    healthEndpoint: string;
    operationsEndpoint: string;
    remainingGates: string[];
    setupGroups?: Array<{
      checks: string[];
      endpoint: string;
      env: string[];
      key: string;
      productAction: string;
      ready: boolean;
      setupCommands: string[];
      title: string;
      unlocks: string;
    }>;
    smokeCommands: string[];
  };
  service: string;
  support: {
    contact: string;
    operator: string;
  };
};

type LoadState = "idle" | "loading" | "ready" | "error";

const stageIcons: Record<string, LucideIcon> = {
  bank_connection: Link2,
  card_control: CreditCard,
  money_movement: Landmark,
  paycheck_detection: Radar,
  protection_rules: Split,
  revenue: BadgeDollarSign,
};

function friendlyGateLabel(gate: string) {
  if (gate === "core_service_auth") {
    return "Core service auth";
  }

  if (gate.includes("STRIPE_SECRET_KEY")) {
    return "Stripe API key";
  }

  if (gate.includes("STRIPE_WEBHOOK_SECRET")) {
    return "Stripe webhook signing";
  }

  if (gate.includes("PAYSHIELD_CORE_API_URL")) {
    return "Core activation service";
  }

  if (gate.includes("PAYSHIELD_CORE_SERVICE_TOKEN")) {
    return "Core service auth";
  }

  if (gate.includes("PAYSHIELD_COMMERCIAL_PRICE_ID")) {
    return "Checkout price or payment link";
  }

  if (gate.includes("PLAID_CLIENT_ID") || gate.includes("PLAID_SECRET")) {
    return "Plaid credentials";
  }

  if (gate.includes("TOKEN_VAULT_ENCRYPTION_KEY")) {
    return "Token custody encryption key";
  }

  if (gate.includes("TOKEN_VAULT_WEBHOOK")) {
    return "Signed token-vault handoff";
  }

  if (gate.includes("TOKEN_VAULT")) {
    return "Token vault custody";
  }

  if (gate.includes("PROVIDER_WEBHOOK")) {
    return "Provider webhook signing";
  }

  if (gate.includes("PAYSHIELD_BAAS_ADAPTER")) {
    return "Provider adapter type";
  }

  if (gate.includes("PAYSHIELD_BAAS_API_BASE_URL")) {
    return "Provider adapter URL";
  }

  if (gate.includes("PAYSHIELD_BAAS_API_KEY")) {
    return "Provider API key";
  }

  if (gate.includes("PAYSHIELD_BAAS_PROVIDER")) {
    return "Provider name";
  }

  if (gate.includes("TRANSFER") || gate.includes("transfer/BaaS")) {
    return "Transfer or BaaS credentials";
  }

  if (gate === "provider_adapter") {
    return "Provider adapter";
  }

  if (gate === "provider_contract") {
    return "Provider contract";
  }

  if (gate === "provider_credentials") {
    return "Provider credentials";
  }

  if (gate === "sponsor_disclosures") {
    return "Approved sponsor disclosures";
  }

  if (gate === "counsel_signoff") {
    return "Counsel signoff";
  }

  if (gate === "operations_runbooks") {
    return "Operations runbooks";
  }

  if (gate === "postgres_ledger") {
    return "Verified Postgres ledger";
  }

  if (gate === "dedicated_backend") {
    return "Always-on core backend";
  }

  if (gate === "clerk_auth") {
    return "Clerk authentication";
  }

  return gate.replace(/^PAYSHIELD_/, "").replace(/_/g, " ").toLowerCase();
}

function gateCategory(gate: string) {
  if (gate.includes("STRIPE") || gate.includes("COMMERCIAL")) {
    return "Revenue";
  }

  if (gate.includes("PLAID") || gate.includes("TOKEN_VAULT")) {
    return "Bank link";
  }

  if (gate.includes("TRANSFER") || gate.includes("BaaS")) {
    return "Movement";
  }

  if (
    [
      "provider_contract",
      "provider_credentials",
      "sponsor_disclosures",
      "counsel_signoff",
      "operations_runbooks",
      "postgres_ledger",
      "dedicated_backend",
      "core_service_auth",
      "clerk_auth",
    ].includes(gate)
  ) {
    return "Live control";
  }

  return "Setup";
}

function statusIsReady(state: string) {
  return ["active", "automatic", "clear", "connected", "durable", "ready", "recorded"].includes(
    state,
  );
}

function formatStatus(value: string) {
  return value.replace(/_/g, " ");
}

function uniqueGates(gates: string[]) {
  return [...new Set(gates)].filter(Boolean);
}

function groupGates(gates: string[]) {
  return uniqueGates(gates).reduce<Record<string, string[]>>((groups, gate) => {
    const category = gateCategory(gate);
    groups[category] = [...(groups[category] ?? []), gate];
    return groups;
  }, {});
}

function friendlyGateSummary(gates: string[]) {
  return [...new Set(gates.map(friendlyGateLabel))].join(", ");
}

export function MoneySetupConsole({
  initialPacket,
}: {
  initialPacket: ActivationPacket;
}) {
  const [packet, setPacket] = useState(initialPacket);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadActivationPacket() {
      setLoadState("loading");

      try {
        const response = await fetch("/api/app/activation", {
          headers: { accept: "application/json" },
        });
        const payload = (await response.json().catch(() => null)) as
          | ActivationPacket
          | null;

        if (cancelled) {
          return;
        }

        if (!response.ok || !payload?.activationPlan) {
          throw new Error("Activation status could not be loaded.");
        }

        setPacket(payload);
        setErrorMessage("");
        setLoadState("ready");
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Activation status could not be loaded.",
          );
          setLoadState("error");
        }
      }
    }

    void loadActivationPacket();

    return () => {
      cancelled = true;
    };
  }, []);

  const plan = packet.activationPlan;
  const nextStage =
    plan.stages.find((stage) => stage.key === plan.nextStageKey) ??
    plan.stages[0];
  const NextIcon = stageIcons[nextStage.key] ?? KeyRound;
  const groupedGates = useMemo(
    () => groupGates(packet.operatorRunbook.remainingGates),
    [packet.operatorRunbook.remainingGates],
  );
  const setupGroups = packet.operatorRunbook.setupGroups ?? [];
  const statusCards = packet.currentState.statusCards ?? [];
  const stageProgress = Math.round(
    (plan.readyCount / Math.max(1, plan.totalStages)) * 100,
  );

  return (
    <section className="brand-panel rounded-[8px] p-4 sm:p-5">
      <div className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="accent-rule pt-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="inline-flex items-center gap-2 rounded-[8px] border border-[#39e8ff]/30 bg-[#39e8ff]/10 px-3 py-2 text-sm font-black uppercase text-[#dffaff]">
              <ShieldCheck className="size-4" aria-hidden="true" />
              Money setup console
            </p>
            <span className="inline-flex min-h-9 items-center rounded-[8px] border border-white/10 bg-black/35 px-3 text-xs font-black uppercase text-[#8f99aa]">
              {loadState === "loading" ? "Refreshing" : packet.service}
            </span>
          </div>

          <h2 className="mt-4 text-3xl font-black leading-tight text-white sm:text-4xl">
            The shortest route from subscription to protected paycheck.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-[#c9d0da]">
            PayShield turns into a usable money-control product in this order:
            charge the household, connect a bank source, route payroll, split
            income into rules, then let card and transfer decisions enforce Safe
            to Spend.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[8px] border border-[#68f0c2]/25 bg-[#68f0c2]/10 p-3">
              <p className="brand-kicker">Price</p>
              <p className="mt-2 text-2xl font-black text-white">
                {plan.businessModel.priceLabel}
              </p>
              <p className="mt-1 text-xs font-bold text-[#9af7d5]">
                Per household access
              </p>
            </div>
            <div className="rounded-[8px] border border-[#39e8ff]/25 bg-[#39e8ff]/10 p-3">
              <p className="brand-kicker">Active stages</p>
              <p className="mt-2 text-2xl font-black text-white">
                {plan.readyCount}/{plan.totalStages}
              </p>
              <p className="mt-1 text-xs font-bold text-[#dffaff]">
                {stageProgress}% setup complete
              </p>
            </div>
            <div className="rounded-[8px] border border-[#ffb237]/25 bg-[#ffb237]/10 p-3">
              <p className="brand-kicker">Mode</p>
              <p className="mt-2 text-2xl font-black capitalize text-white">
                {packet.currentState.readiness?.mode ?? "control"}
              </p>
              <p className="mt-1 text-xs font-bold text-[#ffe4ad]">
                {plan.liveMoneyReady ? "Live controls" : "Live gates locked"}
              </p>
            </div>
          </div>

          <a
            className="mt-5 grid gap-3 rounded-[8px] border border-[#ffb237]/30 bg-[#ffb237]/10 p-4 transition hover:border-[#ffcf72]/45 hover:bg-[#ffb237]/15 sm:grid-cols-[44px_1fr_auto]"
            href={nextStage.actionHref}
          >
            <span className="grid size-11 place-items-center rounded-[8px] border border-[#ffb237]/25 bg-black/35 text-[#ffcf72]">
              <NextIcon className="size-5" aria-hidden="true" />
            </span>
            <span>
              <span className="text-xs font-black uppercase text-[#ffcf72]">
                Next executable move
              </span>
              <span className="mt-1 block text-base font-black text-white">
                {packet.nextAction.title}
              </span>
              <span className="mt-1 block text-sm leading-6 text-[#ffe4bd]">
                {packet.nextAction.ownerAction}
              </span>
              <span className="mt-2 block font-mono text-xs font-black text-[#ffcf72]">
                {packet.nextAction.primaryEndpoint}
              </span>
            </span>
            <span className="inline-flex h-10 items-center justify-center rounded-[8px] bg-white px-3 text-sm font-black text-[#050607]">
              Open
            </span>
          </a>

          {errorMessage ? (
            <p className="mt-3 rounded-[8px] border border-[#ff6b35]/30 bg-[#ff6b35]/10 p-3 text-sm font-bold leading-6 text-[#ffd2c2]">
              {errorMessage}
            </p>
          ) : null}
        </div>

        <div className="grid gap-4">
          <div className="rounded-[8px] border border-white/10 bg-black/35 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="brand-kicker">Money path</p>
              <span className="inline-flex items-center gap-2 text-xs font-black uppercase text-[#8f99aa]">
                {loadState === "loading" ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="size-3.5 text-[#68f0c2]" aria-hidden="true" />
                )}
                Endpoint backed
              </span>
            </div>
            <div className="mt-3 grid gap-2">
              {plan.stages.map((stage, index) => {
                const Icon = stageIcons[stage.key] ?? KeyRound;

                return (
                  <a
                    className="grid gap-3 rounded-[8px] border border-white/10 bg-white/[0.035] p-3 transition hover:border-[#39e8ff]/35 hover:bg-[#39e8ff]/10 sm:grid-cols-[2.25rem_minmax(0,1fr)_auto]"
                    href={stage.actionHref}
                    key={stage.key}
                  >
                    <span
                      className={`grid size-9 place-items-center rounded-[8px] border ${
                        stage.ready
                          ? "border-[#68f0c2]/25 bg-[#68f0c2]/10 text-[#68f0c2]"
                          : "border-[#ffb237]/25 bg-[#ffb237]/10 text-[#ffcf72]"
                      }`}
                    >
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="text-xs font-black uppercase text-[#8f99aa]">
                        {String(index + 1).padStart(2, "0")} / {stage.label}
                      </span>
                      <span className="mt-0.5 block text-sm font-black text-white">
                        {stage.userAction}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-[#aab3c2]">
                        {stage.businessImpact}
                      </span>
                    </span>
                    <span
                      className={`self-start rounded-[8px] px-2.5 py-1 text-xs font-black capitalize ${
                        stage.ready
                          ? "bg-[#68f0c2]/10 text-[#9af7d5]"
                          : "bg-[#ffb237]/10 text-[#ffe4ad]"
                      }`}
                    >
                      {formatStatus(stage.status)}
                    </span>
                  </a>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-[8px] border border-white/10 bg-black/35 p-3">
              <p className="brand-kicker">Current controls</p>
              <div className="mt-3 grid gap-2">
                {statusCards.map((card) => (
                  <div
                    className="flex items-center justify-between gap-3 rounded-[8px] border border-white/10 bg-white/[0.035] px-3 py-2"
                    key={card.key}
                  >
                    <span className="text-sm font-black text-white">
                      {card.label}
                    </span>
                    <span
                      className={`rounded-[8px] px-2.5 py-1 text-xs font-black capitalize ${
                        statusIsReady(card.state)
                          ? "bg-[#68f0c2]/10 text-[#9af7d5]"
                          : "bg-[#ffb237]/10 text-[#ffe4ad]"
                      }`}
                    >
                      {formatStatus(card.state)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[8px] border border-white/10 bg-black/35 p-3">
              <p className="brand-kicker">Remaining gates</p>
              <div className="mt-3 grid gap-2">
                {Object.entries(groupedGates).map(([category, gates]) => (
                  <div
                    className="rounded-[8px] border border-white/10 bg-white/[0.035] p-3"
                    key={category}
                  >
                    <p className="text-xs font-black uppercase text-[#dffaff]">
                      {category}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[#aab3c2]">
                      {friendlyGateSummary(gates)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-[8px] border border-[#39e8ff]/25 bg-[#39e8ff]/10 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="brand-kicker">Activation workbench</p>
                <p className="mt-1 text-sm font-bold leading-6 text-[#dffaff]">
                  These commands add the switches that make revenue, bank
                  linking, payroll detection, transfers, and live controls
                  operational.
                </p>
              </div>
              <span className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-[#39e8ff]/25 bg-black/35 px-3 text-xs font-black uppercase text-[#dffaff]">
                <Terminal className="size-4" aria-hidden="true" />
                Vercel setup
              </span>
            </div>
            <div className="mt-3 grid gap-3">
              {setupGroups.map((group) => (
                <div
                  className={`rounded-[8px] border p-3 ${
                    group.ready
                      ? "border-[#68f0c2]/25 bg-[#68f0c2]/10"
                      : "border-white/10 bg-black/35"
                  }`}
                  key={group.key}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase text-[#8f99aa]">
                        {group.endpoint}
                      </p>
                      <h3 className="mt-1 text-base font-black text-white">
                        {group.title}
                      </h3>
                      <p className="mt-1 max-w-2xl text-sm leading-6 text-[#c9d0da]">
                        {group.productAction}
                      </p>
                    </div>
                    <span
                      className={`rounded-[8px] px-2.5 py-1 text-xs font-black uppercase ${
                        group.ready
                          ? "bg-[#68f0c2]/10 text-[#9af7d5]"
                          : "bg-[#ffb237]/10 text-[#ffe4ad]"
                      }`}
                    >
                      {group.ready ? "Ready" : "Needs setup"}
                    </span>
                  </div>
                  <p className="mt-2 text-xs font-bold leading-5 text-[#aab3c2]">
                    Unlocks: {group.unlocks}
                  </p>
                  <div className="mt-3 grid gap-2 lg:grid-cols-2">
                    <div className="grid gap-2">
                      {group.setupCommands.map((command) => (
                        <code
                          className="block overflow-x-auto rounded-[8px] border border-white/10 bg-black/45 px-3 py-2 font-mono text-xs font-bold text-[#dffaff]"
                          key={command}
                        >
                          {command}
                        </code>
                      ))}
                    </div>
                    <div className="grid content-start gap-2">
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
              ))}
            </div>
          </div>

          <div className="rounded-[8px] border border-[#39e8ff]/25 bg-[#39e8ff]/10 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="brand-kicker">Proof commands</p>
                <p className="mt-1 text-sm font-bold leading-6 text-[#dffaff]">
                  Runbook evidence for health, activation, market status, and
                  ledger migration verification.
                </p>
              </div>
              <a
                className="brand-button-blue inline-flex h-10 items-center justify-center gap-2 rounded-[8px] px-3 text-sm font-black"
                download="payshield-household-audit.json"
                href={packet.operatorRunbook.auditEndpoint}
              >
                <FileDown className="size-4" aria-hidden="true" />
                Export audit
              </a>
            </div>
            <div className="mt-3 grid gap-2">
              {packet.operatorRunbook.smokeCommands.slice(0, 4).map((command) => (
                <code
                  className="block overflow-x-auto rounded-[8px] border border-white/10 bg-black/45 px-3 py-2 font-mono text-xs font-bold text-[#dffaff]"
                  key={command}
                >
                  {command}
                </code>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
