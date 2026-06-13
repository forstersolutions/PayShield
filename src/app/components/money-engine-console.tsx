"use client";

import {
  ArrowRight,
  BadgeDollarSign,
  CheckCircle2,
  CreditCard,
  KeyRound,
  Landmark,
  Link2,
  Radar,
  ShieldCheck,
  Split,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";

type ActivationStage = {
  actionHref: string;
  businessImpact: string;
  key: string;
  label: string;
  primaryEndpoint: string;
  ready: boolean;
  requiredGates: string[];
  status: string;
  title: string;
  userAction: string;
};

type ActivationPacket = {
  activationPlan: {
    businessModel: {
      billingProvider: string;
      priceLabel: string;
      revenuePath: string;
    };
    liveMoneyReady: boolean;
    nextStageKey: string;
    readyCount: number;
    revenueReady: boolean;
    stages: ActivationStage[];
    totalStages: number;
  };
};

const stageIcons: Record<string, LucideIcon> = {
  bank_connection: Link2,
  card_control: CreditCard,
  money_movement: Landmark,
  paycheck_detection: Radar,
  protection_rules: Split,
  revenue: BadgeDollarSign,
};

const stageOrder = [
  "revenue",
  "bank_connection",
  "paycheck_detection",
  "protection_rules",
  "money_movement",
  "card_control",
];

function centsFromPriceLabel(priceLabel: string) {
  const match = priceLabel.match(/\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/);

  if (!match) {
    return 1900;
  }

  const value = Number(match[1].replace(/,/g, ""));

  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : 1900;
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    style: "currency",
  }).format(cents / 100);
}

function formatStatus(status: string) {
  return status.replace(/_/g, " ");
}

function gateSummary(gates: string[]) {
  if (!gates.length) {
    return "Ready to run";
  }

  return `${gates.length} setup item${gates.length === 1 ? "" : "s"}`;
}

export function MoneyEngineConsole({
  initialPacket,
}: {
  initialPacket: ActivationPacket;
}) {
  const [targetHouseholds, setTargetHouseholds] = useState(100);
  const plan = initialPacket.activationPlan;
  const priceCents = centsFromPriceLabel(plan.businessModel.priceLabel);
  const monthlyRevenueCents = priceCents * targetHouseholds;
  const annualRevenueCents = monthlyRevenueCents * 12;
  const orderedStages = useMemo(
    () =>
      stageOrder
        .map((key) => plan.stages.find((stage) => stage.key === key))
        .filter((stage): stage is ActivationStage => Boolean(stage)),
    [plan.stages],
  );
  const nextStage =
    orderedStages.find((stage) => stage.key === plan.nextStageKey) ??
    orderedStages.find((stage) => !stage.ready) ??
    orderedStages[0];
  const NextStageIcon = nextStage ? stageIcons[nextStage.key] ?? KeyRound : KeyRound;

  return (
    <section
      className="grid gap-5 border-b border-white/10 py-6 lg:grid-cols-[0.82fr_1.18fr]"
      id="money-engine"
    >
      <div className="brand-panel accent-rule rounded-[8px] p-5 sm:p-6">
        <p className="inline-flex items-center gap-2 rounded-[8px] border border-[#68f0c2]/25 bg-[#68f0c2]/10 px-3 py-2 text-sm font-black uppercase text-[#cffff0]">
          <ShieldCheck className="size-4" aria-hidden="true" />
          Money engine console
        </p>
        <h1 className="mt-5 max-w-3xl text-4xl font-black leading-[1.02] text-white sm:text-5xl">
          Charge the household. Then protect every paycheck.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-[#c9d0da]">
          This is the operating path that makes PayShield usable and sellable:
          subscription access, bank connection, paycheck detection, protected
          bucket rules, controlled releases, and Safe to Spend decisions.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <label className="rounded-[8px] border border-[#68f0c2]/25 bg-[#68f0c2]/10 p-3">
            <span className="brand-kicker">Target households</span>
            <input
              className="mt-2 h-11 w-full rounded-[8px] border border-white/10 bg-black/45 px-3 text-2xl font-black text-white outline-none transition focus:border-[#68f0c2]"
              inputMode="numeric"
              min="1"
              onChange={(event) => {
                const nextValue = Number(event.target.value);
                setTargetHouseholds(
                  Number.isFinite(nextValue)
                    ? Math.max(1, Math.min(100_000, Math.round(nextValue)))
                    : 1,
                );
              }}
              type="number"
              value={targetHouseholds}
            />
          </label>
          <div className="rounded-[8px] border border-[#39e8ff]/25 bg-[#39e8ff]/10 p-3">
            <p className="brand-kicker">Monthly recurring revenue</p>
            <p className="mt-2 text-3xl font-black text-white">
              {formatMoney(monthlyRevenueCents)}
            </p>
            <p className="mt-1 text-xs font-bold text-[#dffaff]">
              {plan.businessModel.priceLabel} per household
            </p>
          </div>
          <div className="rounded-[8px] border border-[#ffb237]/25 bg-[#ffb237]/10 p-3">
            <p className="brand-kicker">Annual run rate</p>
            <p className="mt-2 text-3xl font-black text-white">
              {formatMoney(annualRevenueCents)}
            </p>
            <p className="mt-1 text-xs font-bold text-[#ffe4ad]">
              Stripe-backed access path
            </p>
          </div>
        </div>

        {nextStage ? (
          <a
            className="mt-5 grid gap-3 rounded-[8px] border border-[#ffb237]/30 bg-[#ffb237]/10 p-4 transition hover:border-[#ffcf72]/45 hover:bg-[#ffb237]/15 sm:grid-cols-[44px_1fr_auto]"
            href={nextStage.actionHref}
          >
            <span className="grid size-11 place-items-center rounded-[8px] border border-[#ffb237]/25 bg-black/35 text-[#ffcf72]">
              <NextStageIcon className="size-5" aria-hidden="true" />
            </span>
            <span>
              <span className="text-xs font-black uppercase text-[#ffcf72]">
                Next money action
              </span>
              <span className="mt-1 block text-base font-black text-white">
                {nextStage.title}
              </span>
              <span className="mt-1 block text-sm leading-6 text-[#ffe4bd]">
                {nextStage.businessImpact}
              </span>
            </span>
            <span className="inline-flex h-10 items-center justify-center rounded-[8px] bg-white px-3 text-sm font-black text-[#050607]">
              Open
            </span>
          </a>
        ) : null}
      </div>

      <div className="brand-panel rounded-[8px] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="brand-kicker">How the product works</p>
            <h2 className="mt-1 text-2xl font-black text-white">
              Every row is an app action.
            </h2>
          </div>
          <span className="rounded-[8px] border border-[#39e8ff]/25 bg-[#39e8ff]/10 px-3 py-2 text-sm font-black text-[#dffaff]">
            {plan.readyCount}/{plan.totalStages} active
          </span>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {orderedStages.map((stage, index) => {
            const Icon = stageIcons[stage.key] ?? KeyRound;

            return (
              <a
                className={`group grid min-h-40 gap-3 rounded-[8px] border p-4 transition ${
                  stage.ready
                    ? "border-[#68f0c2]/25 bg-[#68f0c2]/[0.07] hover:bg-[#68f0c2]/10"
                    : "border-white/10 bg-black/35 hover:border-[#39e8ff]/35 hover:bg-[#39e8ff]/10"
                }`}
                href={stage.actionHref}
                key={stage.key}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="flex items-center gap-3">
                    <span
                      className={`grid size-10 place-items-center rounded-[8px] border ${
                        stage.ready
                          ? "border-[#68f0c2]/25 bg-black/30 text-[#68f0c2]"
                          : "border-[#39e8ff]/20 bg-[#39e8ff]/10 text-[#39e8ff]"
                      }`}
                    >
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <span>
                      <span className="text-xs font-black uppercase text-[#8f99aa]">
                        {String(index + 1).padStart(2, "0")} / {stage.label}
                      </span>
                      <span className="mt-0.5 block text-base font-black text-white">
                        {stage.userAction}
                      </span>
                    </span>
                  </span>
                  {stage.ready ? (
                    <CheckCircle2 className="size-5 shrink-0 text-[#68f0c2]" aria-hidden="true" />
                  ) : (
                    <KeyRound className="size-5 shrink-0 text-[#ffcf72]" aria-hidden="true" />
                  )}
                </span>
                <span className="text-sm leading-6 text-[#aab3c2]">
                  {stage.businessImpact}
                </span>
                <span className="mt-auto grid gap-2">
                  <span className="font-mono text-[0.68rem] font-black uppercase text-[#ffcf72]">
                    {stage.primaryEndpoint}
                  </span>
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={`rounded-[8px] px-2.5 py-1 text-xs font-black capitalize ${
                        stage.ready
                          ? "bg-[#68f0c2]/10 text-[#9af7d5]"
                          : "bg-[#ffb237]/10 text-[#ffe4ad]"
                      }`}
                    >
                      {formatStatus(stage.status)}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs font-black text-[#dffaff] group-hover:text-white">
                      {gateSummary(stage.requiredGates)}
                      <ArrowRight className="size-3.5" aria-hidden="true" />
                    </span>
                  </span>
                </span>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
