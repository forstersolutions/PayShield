"use client";

import {
  ArrowRight,
  BadgeDollarSign,
  CheckCircle2,
  FileDown,
  Landmark,
  Link2,
  Loader2,
  Radar,
  ShieldCheck,
  Split,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";

type ControlPlanStep = {
  blockers: string[];
  canRunNow: boolean;
  endpoint: string;
  key: string;
  ownerAction: string;
  ready: boolean;
  status: string;
  title: string;
  userAction: string;
};

export type MoneyControlPlanView = {
  allocation: {
    buckets: Array<{
      availableCents: number;
      bucketId: string;
      due: string;
      name: string;
      projectedFundingCents: number;
      protection: string;
      shortCents: number;
      targetCents: number;
    }>;
    projectedProtectedCents: number;
    projectedSafeToSpendCents: number;
  };
  detectionRule: {
    employerNamePattern: string;
    endpoint: string;
    expectedFrequency: string;
    ruleName: string;
  };
  input: {
    employerName: string;
    expectedFrequency: string;
    paycheckAmountCents: number;
    requestedTransferCents: number;
    ruleName: string;
  };
  monetization: {
    endpoint: string;
    paidAccessReady: boolean;
    paymentCollectionReady: boolean;
    priceLabel: string;
    status: string;
  };
  nextAction: ControlPlanStep;
  operatingSteps: ControlPlanStep[];
  proof: {
    auditEndpoint: string;
    operationsEndpoint: string;
    planEndpoint: string;
  };
  summary: {
    approvedPayeeCount: number;
    bucketCount: number;
    nextActionKey: string;
    paycheckAmountCents: number;
    projectedProtectedCents: number;
    projectedSafeToSpendCents: number;
    protectedTargetCents: number;
    readyStepCount: number;
    totalStepCount: number;
  };
  transferPlan: {
    allowedNow: boolean;
    destinationPayeeName: string | null;
    endpoint: string;
    maxTransferCents: number;
    providerReady: boolean;
    providerStatus: string;
    requestedTransferCents: number;
    sourceBucketName: string | null;
  };
};

type ActionState =
  | {
      message: string;
      status: "idle";
    }
  | {
      message: string;
      status: "loading";
    }
  | {
      message: string;
      status: "ready";
    }
  | {
      message: string;
      status: "error";
    };

const stepIcons: Record<string, LucideIcon> = {
  bank_connection: Link2,
  card_control: ShieldCheck,
  paycheck_detection: Radar,
  protected_buckets: Split,
  protected_transfer: Landmark,
  revenue_gate: BadgeDollarSign,
};

const stepTargets: Record<string, string> = {
  bank_connection: "#money-operations",
  card_control: "#card-authorization",
  paycheck_detection: "#money-operations",
  protected_buckets: "#bucket-studio",
  protected_transfer: "#money-operations",
  revenue_gate: "#money-operations",
};

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}

function centsToDollars(cents: number) {
  return String(Math.round(cents / 100));
}

function dollarsToCents(value: string) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0;
}

function cleanStatus(value: string) {
  return value.replace(/_/g, " ");
}

function PlanMessage({ state }: { state: ActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <p
      className={`rounded-[8px] border p-3 text-sm font-bold leading-6 ${
        state.status === "error"
          ? "border-[#ff6b35]/35 bg-[#ff6b35]/10 text-[#ffd2c2]"
          : "border-[#39e8ff]/25 bg-[#39e8ff]/10 text-[#dffaff]"
      }`}
    >
      {state.message}
    </p>
  );
}

function PlanMetric({
  icon: Icon,
  label,
  tone = "blue",
  value,
}: {
  icon: LucideIcon;
  label: string;
  tone?: "blue" | "gold" | "green";
  value: string;
}) {
  const toneClass =
    tone === "green"
      ? "border-[#68f0c2]/25 bg-[#68f0c2]/10 text-[#9af7d5]"
      : tone === "gold"
        ? "border-[#ffb237]/25 bg-[#ffb237]/10 text-[#ffe4ad]"
        : "border-[#39e8ff]/25 bg-[#39e8ff]/10 text-[#dffaff]";

  return (
    <div className={`rounded-[8px] border p-3 ${toneClass}`}>
      <Icon className="size-4" aria-hidden="true" />
      <p className="mt-2 text-xs font-black uppercase tracking-[0.12em] opacity-80">
        {label}
      </p>
      <p className="mt-1 text-xl font-black text-white">{value}</p>
    </div>
  );
}

export function MoneyControlPlanPanel({
  initialPlan,
}: {
  initialPlan: MoneyControlPlanView;
}) {
  const [plan, setPlan] = useState(initialPlan);
  const [state, setState] = useState<ActionState>({
    message: "",
    status: "idle",
  });
  const [paycheckAmount, setPaycheckAmount] = useState(
    centsToDollars(initialPlan.input.paycheckAmountCents),
  );
  const [transferAmount, setTransferAmount] = useState(
    centsToDollars(initialPlan.input.requestedTransferCents),
  );
  const [employerName, setEmployerName] = useState(initialPlan.input.employerName);
  const [ruleName, setRuleName] = useState(initialPlan.input.ruleName);
  const [frequency, setFrequency] = useState(initialPlan.input.expectedFrequency);
  const NextIcon = stepIcons[plan.nextAction.key] ?? ArrowRight;
  const allocationTotal = Math.max(1, plan.summary.paycheckAmountCents);
  const protectedShare = Math.round(
    (plan.summary.projectedProtectedCents / allocationTotal) * 100,
  );
  const safeShare = Math.max(0, 100 - protectedShare);
  const nextHref = stepTargets[plan.nextAction.key] ?? "#money-operations";
  const bucketsWithFunding = useMemo(
    () =>
      plan.allocation.buckets.filter(
        (bucket) => bucket.projectedFundingCents > 0 || bucket.targetCents > 0,
      ),
    [plan.allocation.buckets],
  );

  async function generatePlan() {
    setState({
      message: "Generating household money-control plan...",
      status: "loading",
    });

    try {
      const response = await fetch("/api/app/control-plan", {
        body: JSON.stringify({
          employerName,
          expectedFrequency: frequency,
          paycheckAmountCents: dollarsToCents(paycheckAmount),
          requestedTransferCents: dollarsToCents(transferAmount),
          ruleName,
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as
        | MoneyControlPlanView
        | {
            errors?: string[];
          };

      if (!response.ok || !("summary" in payload)) {
        setState({
          message:
            "errors" in payload && payload.errors?.length
              ? payload.errors.join(" ")
              : "Money-control plan could not be generated.",
          status: "error",
        });
        return;
      }

      setPlan(payload);
      setState({
        message:
          "Plan generated. The next action, split preview, transfer intent, and proof endpoints are updated.",
        status: "ready",
      });
    } catch {
      setState({
        message: "Money-control plan request failed.",
        status: "error",
      });
    }
  }

  return (
    <section
      className="relative z-10 border-b border-white/10 py-8"
      id="control-plan"
    >
      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="brand-panel accent-rule rounded-[8px] p-5 sm:p-6">
          <p className="inline-flex items-center gap-2 rounded-[8px] border border-[#68f0c2]/30 bg-[#68f0c2]/10 px-3 py-2 text-sm font-black uppercase text-[#dffaff]">
            <ShieldCheck className="size-4" aria-hidden="true" />
            Household money control plan
          </p>
          <h2 className="mt-5 text-3xl font-black leading-tight text-white sm:text-4xl">
            Plan paycheck split, bank setup, revenue, and release in one pass.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-[#c9d0da]">
            Enter the next paycheck, confirm the employer match, and PayShield
            shows the split, next rail, transfer guardrail, and proof endpoints
            before money reaches ordinary spending.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-black text-white">
              Paycheck amount
              <input
                className="h-11 rounded-[8px] border border-white/10 bg-black/45 px-3 text-sm font-bold text-white outline-none transition focus:border-[#39e8ff]"
                inputMode="decimal"
                min="0"
                onChange={(event) => setPaycheckAmount(event.target.value)}
                type="number"
                value={paycheckAmount}
              />
            </label>
            <label className="grid gap-2 text-sm font-black text-white">
              Employer match
              <input
                className="h-11 rounded-[8px] border border-white/10 bg-black/45 px-3 text-sm font-bold text-white outline-none transition focus:border-[#39e8ff]"
                maxLength={80}
                onChange={(event) => setEmployerName(event.target.value)}
                value={employerName}
              />
            </label>
            <label className="grid gap-2 text-sm font-black text-white">
              Detection rule
              <input
                className="h-11 rounded-[8px] border border-white/10 bg-black/45 px-3 text-sm font-bold text-white outline-none transition focus:border-[#39e8ff]"
                maxLength={80}
                onChange={(event) => setRuleName(event.target.value)}
                value={ruleName}
              />
            </label>
            <label className="grid gap-2 text-sm font-black text-white">
              Frequency
              <select
                className="h-11 rounded-[8px] border border-white/10 bg-black/45 px-3 text-sm font-bold text-white outline-none transition focus:border-[#39e8ff]"
                onChange={(event) => setFrequency(event.target.value)}
                value={frequency}
              >
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="semimonthly">Twice monthly</option>
                <option value="monthly">Monthly</option>
                <option value="unknown">Variable</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-black text-white sm:col-span-2">
              Protected transfer test
              <input
                className="h-11 rounded-[8px] border border-white/10 bg-black/45 px-3 text-sm font-bold text-white outline-none transition focus:border-[#39e8ff]"
                inputMode="decimal"
                min="0"
                onChange={(event) => setTransferAmount(event.target.value)}
                type="number"
                value={transferAmount}
              />
            </label>
          </div>

          <button
            className="brand-button-primary mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] px-4 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50"
            disabled={
              state.status === "loading" ||
              !employerName ||
              !ruleName ||
              dollarsToCents(paycheckAmount) <= 0
            }
            onClick={generatePlan}
            type="button"
          >
            {state.status === "loading" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Radar className="size-4" aria-hidden="true" />
            )}
            Generate money plan
          </button>
          <div className="mt-3">
            <PlanMessage state={state} />
          </div>

          <div className="mt-5 rounded-[8px] border border-[#ffb237]/25 bg-[#ffb237]/10 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="brand-kicker">Next action</p>
                <h3 className="mt-1 text-2xl font-black text-white">
                  {plan.nextAction.title}
                </h3>
              </div>
              <span className="rounded-[8px] bg-[#ffb237]/15 px-2.5 py-1 text-xs font-black capitalize text-[#ffe4ad]">
                {cleanStatus(plan.nextAction.status)}
              </span>
            </div>
            <p className="mt-3 text-sm font-bold leading-6 text-[#ffe4bd]">
              {plan.nextAction.userAction}
            </p>
            <code className="mt-3 block overflow-x-auto rounded-[8px] border border-white/10 bg-black/35 px-3 py-2 font-mono text-xs font-black uppercase text-[#ffcf72]">
              {plan.nextAction.endpoint}
            </code>
            <a
              className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-white px-3 text-sm font-black text-[#050607]"
              href={nextHref}
            >
              <NextIcon className="size-4" aria-hidden="true" />
              Open rail
            </a>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <PlanMetric
              icon={BadgeDollarSign}
              label="Revenue"
              tone={plan.monetization.paymentCollectionReady ? "green" : "gold"}
              value={plan.monetization.priceLabel}
            />
            <PlanMetric
              icon={Split}
              label="Protected"
              tone="green"
              value={formatMoney(plan.summary.projectedProtectedCents)}
            />
            <PlanMetric
              icon={ShieldCheck}
              label="Projected Safe to Spend"
              value={formatMoney(plan.summary.projectedSafeToSpendCents)}
            />
            <PlanMetric
              icon={CheckCircle2}
              label="Runnable steps"
              tone="gold"
              value={`${plan.summary.readyStepCount}/${plan.summary.totalStepCount}`}
            />
          </div>

          <div className="brand-panel rounded-[8px] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="brand-kicker">Paycheck split preview</p>
                <h3 className="mt-1 text-xl font-black text-white">
                  Protected first, Safe to Spend last.
                </h3>
              </div>
              <span className="rounded-[8px] border border-white/10 bg-black/35 px-3 py-2 text-xs font-black uppercase text-[#dffaff]">
                /api/app/control-plan
              </span>
            </div>
            <div className="mt-4 h-4 overflow-hidden rounded-full border border-white/10 bg-black/45">
              <div
                className="h-full bg-[#68f0c2]"
                style={{ width: `${Math.min(100, protectedShare)}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs font-black uppercase text-[#8f99aa]">
              <span>{protectedShare}% protected</span>
              <span>{safeShare}% spendable</span>
            </div>
            <div className="mt-4 grid gap-2">
              {bucketsWithFunding.slice(0, 7).map((bucket) => {
                const width = Math.round(
                  (bucket.projectedFundingCents /
                    Math.max(1, bucket.targetCents)) *
                    100,
                );

                return (
                  <div
                    className="rounded-[8px] border border-white/10 bg-black/35 p-3"
                    key={bucket.bucketId}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <span className="block text-sm font-black text-white">
                          {bucket.name}
                        </span>
                        <span className="block text-xs font-bold capitalize text-[#8f99aa]">
                          {bucket.protection.replace(/_/g, " ")} · {bucket.due}
                        </span>
                      </span>
                      <span className="text-sm font-black text-[#dffaff]">
                        {formatMoney(bucket.projectedFundingCents)}
                      </span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full bg-[#39e8ff]"
                        style={{ width: `${Math.min(100, width)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_0.86fr]">
            <div className="brand-panel rounded-[8px] p-4">
              <p className="brand-kicker">Operating steps</p>
              <p className="mt-1 text-sm font-bold leading-6 text-[#aab3c2]">
                Revenue gate, Bank connection, Paycheck detection, Protected
                buckets, Protected transfer, and Card control stay in one
                sequence.
              </p>
              <div className="mt-3 grid gap-2">
                {plan.operatingSteps.map((step) => {
                  const Icon = stepIcons[step.key] ?? ArrowRight;

                  return (
                    <a
                      className={`grid gap-3 rounded-[8px] border p-3 transition hover:border-[#39e8ff]/35 sm:grid-cols-[2.35rem_1fr_auto] ${
                        step.canRunNow
                          ? "border-[#68f0c2]/25 bg-[#68f0c2]/[0.07]"
                          : "border-[#ffb237]/25 bg-[#ffb237]/10"
                      }`}
                      href={stepTargets[step.key] ?? "#money-operations"}
                      key={step.key}
                    >
                      <span
                        className={`grid size-9 place-items-center rounded-[8px] ${
                          step.canRunNow
                            ? "bg-[#68f0c2]/10 text-[#68f0c2]"
                            : "bg-[#ffb237]/10 text-[#ffcf72]"
                        }`}
                      >
                        <Icon className="size-5" aria-hidden="true" />
                      </span>
                      <span>
                        <span className="block text-sm font-black text-white">
                          {step.title}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-[#aab3c2]">
                          {step.userAction}
                        </span>
                        {step.blockers.length ? (
                          <span className="mt-1 block text-xs font-bold leading-5 text-[#ffe4ad]">
                            Needs {step.blockers.slice(0, 2).join(", ")}
                            {step.blockers.length > 2 ? " +" : ""}.
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={`self-start rounded-[8px] px-2.5 py-1 text-xs font-black capitalize ${
                          step.canRunNow
                            ? "bg-[#68f0c2]/10 text-[#9af7d5]"
                            : "bg-[#ffb237]/10 text-[#ffe4ad]"
                        }`}
                      >
                        {cleanStatus(step.status)}
                      </span>
                    </a>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4">
              <div className="brand-panel rounded-[8px] p-4">
                <p className="brand-kicker">Detection and release</p>
                <h3 className="mt-1 text-xl font-black text-white">
                  {plan.detectionRule.ruleName}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[#c9d0da]">
                  Match {plan.detectionRule.employerNamePattern} on a{" "}
                  {plan.detectionRule.expectedFrequency} cadence, then validate{" "}
                  {plan.transferPlan.sourceBucketName ?? "a protected bucket"} to{" "}
                  {plan.transferPlan.destinationPayeeName ?? "an approved payee"}.
                </p>
                <code className="mt-3 block overflow-x-auto rounded-[8px] border border-white/10 bg-black/35 px-3 py-2 font-mono text-xs font-black uppercase text-[#39e8ff]">
                  {plan.detectionRule.endpoint} + {plan.transferPlan.endpoint}
                </code>
                <div className="mt-3 rounded-[8px] border border-white/10 bg-black/35 p-3">
                  <p className="brand-kicker">Transfer guardrail</p>
                  <p className="mt-1 text-lg font-black text-white">
                    {formatMoney(plan.transferPlan.requestedTransferCents)} of{" "}
                    {formatMoney(plan.transferPlan.maxTransferCents)}
                  </p>
                  <p className="mt-1 text-xs font-bold capitalize text-[#aab3c2]">
                    {cleanStatus(plan.transferPlan.providerStatus)}
                  </p>
                </div>
              </div>

              <div className="brand-panel-soft rounded-[8px] p-4">
                <p className="brand-kicker">Proof artifacts</p>
                <div className="mt-3 grid gap-2">
                  {[plan.proof.planEndpoint, plan.proof.operationsEndpoint].map(
                    (endpoint) => (
                      <code
                        className="block overflow-x-auto rounded-[8px] border border-white/10 bg-black/35 px-3 py-2 font-mono text-xs font-black uppercase text-[#dffaff]"
                        key={endpoint}
                      >
                        {endpoint}
                      </code>
                    ),
                  )}
                </div>
                <a
                  className="brand-button-blue mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-[8px] px-3 text-sm font-black"
                  download="payshield-household-audit.json"
                  href={plan.proof.auditEndpoint}
                >
                  <FileDown className="size-4" aria-hidden="true" />
                  Export audit
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
