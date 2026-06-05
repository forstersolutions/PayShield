"use client";

import Image from "next/image";
import {
  AlertTriangle,
  ArrowRight,
  Baby,
  CalendarDays,
  Car,
  CheckCircle2,
  CircleDollarSign,
  Home,
  KeyRound,
  Landmark,
  ListChecks,
  Lock,
  Plane,
  RefreshCcw,
  ShieldCheck,
  SlidersHorizontal,
  TimerReset,
  TrendingUp,
  Users,
  Umbrella,
  WalletCards,
  XCircle,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type BucketId =
  | "rent"
  | "vehicle"
  | "insurance"
  | "kids"
  | "vacation"
  | "misc";

type Bucket = {
  id: BucketId;
  name: string;
  amount: number;
  due: string;
  protection: "Bill-only" | "Hard lock" | "Soft lock" | "Flexible";
  rail: string;
  color: string;
  icon: LucideIcon;
};

type UnlockMode = "slow" | "instant";
type StorageStatus = "loading" | "saved" | "unavailable";
type ScenarioId = "household" | "tight-check" | "gig-worker" | "custom";

type PlannerSnapshot = {
  activeScenario: ScenarioId;
  bucketAmounts: Record<BucketId, number>;
  cardAmount: number;
  merchant: string;
  paycheck: number;
  unlockAmount: number;
  unlockBucket: BucketId;
  unlockMode: UnlockMode;
};

type PlannerScenario = {
  body: string;
  bucketAmounts: Record<BucketId, number>;
  cardAmount: number;
  id: Exclude<ScenarioId, "custom">;
  merchant: string;
  name: string;
  paycheck: number;
  unlockAmount: number;
  unlockBucket: BucketId;
  unlockMode: UnlockMode;
};

const buckets: Bucket[] = [
  {
    id: "rent",
    name: "Rent",
    amount: 500,
    due: "1st",
    protection: "Bill-only",
    rail: "Modeled landlord payee",
    color: "#0f766e",
    icon: Home,
  },
  {
    id: "vehicle",
    name: "Vehicle",
    amount: 300,
    due: "15th",
    protection: "Bill-only",
    rail: "Auto loan payee",
    color: "#2563eb",
    icon: Car,
  },
  {
    id: "insurance",
    name: "Insurance",
    amount: 500,
    due: "22nd",
    protection: "Bill-only",
    rail: "Carrier autopay",
    color: "#c2410c",
    icon: Umbrella,
  },
  {
    id: "kids",
    name: "Kids",
    amount: 50,
    due: "Every check",
    protection: "Hard lock",
    rail: "Savings transfer",
    color: "#7c3aed",
    icon: Baby,
  },
  {
    id: "vacation",
    name: "Vacation",
    amount: 100,
    due: "Every check",
    protection: "Soft lock",
    rail: "Goal reserve",
    color: "#0891b2",
    icon: Plane,
  },
  {
    id: "misc",
    name: "Miscellaneous",
    amount: 100,
    due: "Every check",
    protection: "Flexible",
    rail: "Manual transfer",
    color: "#a16207",
    icon: CircleDollarSign,
  },
];

const merchants = [
  "DoorDash",
  "Walmart",
  "Amazon",
  "ABC Apartments",
  "Fuel stop",
  "Grocery market",
];
const plannerStorageKey = "payshield:paycheck-planner:v1";
const defaultScenarioId: ScenarioId = "household";
const defaultUnlockBucket: BucketId = "rent";
const defaultUnlockMode: UnlockMode = "slow";
const bucketIds = buckets.map((bucket) => bucket.id);
const storageStatusCopy: Record<StorageStatus, string> = {
  loading: "Loading local plan",
  saved: "Saved on this device",
  unavailable: "Local save unavailable",
};
const plannerScenarios: PlannerScenario[] = [
  {
    body: "A steady check with core bills, family needs, and room to breathe.",
    bucketAmounts: {
      rent: 500,
      vehicle: 300,
      insurance: 500,
      kids: 50,
      vacation: 100,
      misc: 100,
    },
    cardAmount: 80,
    id: "household",
    merchant: "Walmart",
    name: "Household",
    paycheck: 3000,
    unlockAmount: 200,
    unlockBucket: "rent",
    unlockMode: "slow",
  },
  {
    body: "A smaller check that makes the first short bill obvious.",
    bucketAmounts: {
      rent: 700,
      vehicle: 360,
      insurance: 420,
      kids: 75,
      vacation: 100,
      misc: 80,
    },
    cardAmount: 180,
    id: "tight-check",
    merchant: "DoorDash",
    name: "Tight check",
    paycheck: 1350,
    unlockAmount: 250,
    unlockBucket: "vehicle",
    unlockMode: "instant",
  },
  {
    body: "Variable income with flexible goals and core bills protected first.",
    bucketAmounts: {
      rent: 450,
      vehicle: 220,
      insurance: 280,
      kids: 25,
      vacation: 50,
      misc: 200,
    },
    cardAmount: 65,
    id: "gig-worker",
    merchant: "Fuel stop",
    name: "Gig worker",
    paycheck: 1800,
    unlockAmount: 125,
    unlockBucket: "insurance",
    unlockMode: "slow",
  },
];

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function toNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toFiniteNumber(value: unknown, fallback: number) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function createDefaultBucketAmounts() {
  return plannerScenarios[0].bucketAmounts;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isBucketId(value: unknown): value is BucketId {
  return typeof value === "string" && bucketIds.includes(value as BucketId);
}

function isUnlockMode(value: unknown): value is UnlockMode {
  return value === "slow" || value === "instant";
}

function isScenarioId(value: unknown): value is ScenarioId {
  return (
    value === "custom" ||
    plannerScenarios.some((scenario) => scenario.id === value)
  );
}

function isMerchant(value: unknown): value is string {
  return typeof value === "string" && merchants.includes(value);
}

function readPlannerSnapshot(value: string): PlannerSnapshot | null {
  try {
    const parsed: unknown = JSON.parse(value);

    if (!isRecord(parsed)) {
      return null;
    }

    const defaults = plannerScenarios[0];
    const savedBuckets = isRecord(parsed.bucketAmounts)
      ? parsed.bucketAmounts
      : {};
    const bucketAmounts = buckets.reduce(
      (current, bucket) => ({
        ...current,
        [bucket.id]: clamp(
          toFiniteNumber(savedBuckets[bucket.id], defaults.bucketAmounts[bucket.id]),
          0,
          2000,
        ),
      }),
      {} as Record<BucketId, number>,
    );

    return {
      activeScenario: isScenarioId(parsed.activeScenario)
        ? parsed.activeScenario
        : "custom",
      bucketAmounts,
      cardAmount: clamp(toFiniteNumber(parsed.cardAmount, defaults.cardAmount), 1, 5000),
      merchant: isMerchant(parsed.merchant) ? parsed.merchant : defaults.merchant,
      paycheck: clamp(toFiniteNumber(parsed.paycheck, defaults.paycheck), 500, 8000),
      unlockAmount: clamp(
        toFiniteNumber(parsed.unlockAmount, defaults.unlockAmount),
        25,
        2000,
      ),
      unlockBucket: isBucketId(parsed.unlockBucket)
        ? parsed.unlockBucket
        : defaultUnlockBucket,
      unlockMode: isUnlockMode(parsed.unlockMode)
        ? parsed.unlockMode
        : defaultUnlockMode,
    };
  } catch {
    return null;
  }
}

export function PaycheckPlanner() {
  const [activeScenario, setActiveScenario] =
    useState<ScenarioId>(defaultScenarioId);
  const [storageReady, setStorageReady] = useState(false);
  const [storageStatus, setStorageStatus] =
    useState<StorageStatus>("loading");
  const [paycheck, setPaycheck] = useState(plannerScenarios[0].paycheck);
  const [bucketAmounts, setBucketAmounts] = useState<Record<BucketId, number>>(
    createDefaultBucketAmounts,
  );
  const [merchant, setMerchant] = useState(plannerScenarios[0].merchant);
  const [cardAmount, setCardAmount] = useState(plannerScenarios[0].cardAmount);
  const [unlockBucket, setUnlockBucket] =
    useState<BucketId>(defaultUnlockBucket);
  const [unlockAmount, setUnlockAmount] = useState(
    plannerScenarios[0].unlockAmount,
  );
  const [unlockMode, setUnlockMode] =
    useState<UnlockMode>(defaultUnlockMode);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      try {
        const saved = window.localStorage.getItem(plannerStorageKey);

        if (saved) {
          const snapshot = readPlannerSnapshot(saved);

          if (snapshot && !cancelled) {
            setActiveScenario(snapshot.activeScenario);
            setBucketAmounts(snapshot.bucketAmounts);
            setCardAmount(snapshot.cardAmount);
            setMerchant(snapshot.merchant);
            setPaycheck(snapshot.paycheck);
            setUnlockAmount(snapshot.unlockAmount);
            setUnlockBucket(snapshot.unlockBucket);
            setUnlockMode(snapshot.unlockMode);
          }
        }

        if (!cancelled) {
          setStorageStatus("saved");
          setStorageReady(true);
        }
      } catch {
        if (!cancelled) {
          setStorageStatus("unavailable");
          setStorageReady(true);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!storageReady) {
      return;
    }

    try {
      const snapshot: PlannerSnapshot = {
        activeScenario,
        bucketAmounts,
        cardAmount,
        merchant,
        paycheck,
        unlockAmount,
        unlockBucket,
        unlockMode,
      };

      window.localStorage.setItem(plannerStorageKey, JSON.stringify(snapshot));
    } catch {
      queueMicrotask(() => setStorageStatus("unavailable"));
    }
  }, [
    activeScenario,
    bucketAmounts,
    cardAmount,
    merchant,
    paycheck,
    storageReady,
    unlockAmount,
    unlockBucket,
    unlockMode,
  ]);

  const plan = useMemo(() => {
    const allocationState = buckets.reduce(
      (state, bucket) => {
        const target = bucketAmounts[bucket.id];
        const funded = Math.min(target, Math.max(0, state.remaining));

        return {
          remaining: state.remaining - funded,
          allocations: [
            ...state.allocations,
            {
              ...bucket,
              target,
              funded,
              short: target - funded,
            },
          ],
        };
      },
      {
        remaining: paycheck,
        allocations: [] as Array<
          Bucket & { target: number; funded: number; short: number }
        >,
      },
    );
    const allocations = allocationState.allocations;

    const protectedTarget = allocations.reduce(
      (total, bucket) => total + bucket.target,
      0,
    );
    const protectedFunded = allocations.reduce(
      (total, bucket) => total + bucket.funded,
      0,
    );

    return {
      allocations,
      protectedTarget,
      protectedFunded,
      safeSpend: Math.max(0, allocationState.remaining),
      shortfall: Math.max(0, protectedTarget - paycheck),
    };
  }, [bucketAmounts, paycheck]);

  const cardApproved = cardAmount <= plan.safeSpend;
  const selectedUnlockBucket = plan.allocations.find(
    (bucket) => bucket.id === unlockBucket,
  );
  const actualUnlock = Math.min(
    unlockAmount,
    selectedUnlockBucket?.funded ?? unlockAmount,
  );
  const recoveryChecks = unlockMode === "slow" ? 2 : 1;
  const recoveryAmount = Math.ceil(actualUnlock / recoveryChecks);
  const safeSpendShare = paycheck > 0 ? (plan.safeSpend / paycheck) * 100 : 0;
  const coveredBuckets = plan.allocations.filter((bucket) => bucket.short === 0);
  const priorityQueue = plan.allocations
    .filter((bucket) => bucket.protection !== "Flexible")
    .slice(0, 4);
  const firstShortBucket = plan.allocations.find((bucket) => bucket.short > 0);
  const operatingVitals = [
    {
      body: "Plan ready before payday starts",
      icon: CalendarDays,
      label: "Next check",
      value: "Next check",
    },
    {
      body: `${coveredBuckets.length} of ${plan.allocations.length} buckets covered`,
      icon: ListChecks,
      label: "Coverage",
      value: firstShortBucket ? `${firstShortBucket.name} short` : "All covered",
    },
    {
      body: `${merchant} ${cardApproved ? "fits" : "goes over"} today's spendable number`,
      icon: SlidersHorizontal,
      label: "Purchase check",
      value: cardApproved ? "Fits" : "Pause",
    },
    {
      body: "Refill amount shown before money moves",
      icon: RefreshCcw,
      label: "Unlock plan",
      value: unlockMode === "slow" ? "24h wait" : "Instant",
    },
  ];
  const heroSignals = [
    {
      body: "Bills and goals funded before spending",
      icon: ShieldCheck,
      label: "Reserved",
      value: formatMoney(plan.protectedFunded),
    },
    {
      body: "The number the household can actually use",
      icon: WalletCards,
      label: "Safe to spend",
      value: formatMoney(plan.safeSpend),
    },
    {
      body: `${recoveryChecks} paycheck${recoveryChecks === 1 ? "" : "s"} to make the bucket whole`,
      icon: KeyRound,
      label: "Refill",
      value: `${formatMoney(recoveryAmount)}/check`,
    },
  ];
  const decisionSteps = [
    {
      body: `${formatMoney(plan.protectedFunded)} is reserved before everyday spending opens.`,
      icon: Lock,
      title: "1. Bills first",
    },
    {
      body: `${formatMoney(plan.safeSpend)} is the only amount treated as spendable.`,
      icon: WalletCards,
      title: "2. Spendable check",
    },
    {
      body: `${merchant} ${cardApproved ? "fits inside" : "goes beyond"} the spendable balance.`,
      icon: cardApproved ? CheckCircle2 : XCircle,
      title: cardApproved ? "3. Purchase fits" : "3. Purchase paused",
    },
  ];
  const activity = [
    {
      body: `${formatMoney(plan.protectedFunded)} reserved from the paycheck before everyday spending.`,
      icon: ShieldCheck,
      title: "Plan applied",
    },
    {
      body: `${formatMoney(plan.safeSpend)} remains available after the important buckets are funded.`,
      icon: WalletCards,
      title: "Spendable number refreshed",
    },
    {
      body: cardApproved
        ? `${merchant} can clear because ${formatMoney(cardAmount)} stays within safe spend.`
        : `${merchant} is blocked because ${formatMoney(cardAmount)} exceeds safe spend.`,
      icon: cardApproved ? CheckCircle2 : XCircle,
      title: cardApproved ? "Purchase fits" : "Purchase needs a pause",
    },
    {
      body: `${formatMoney(actualUnlock)} unlock request creates ${formatMoney(recoveryAmount)} refill steps.`,
      icon: TimerReset,
      title: "Recovery plan staged",
    },
  ];
  const activeScenarioLabel =
    activeScenario === "custom"
      ? "Custom plan"
      : plannerScenarios.find((scenario) => scenario.id === activeScenario)?.name ??
        "Custom plan";

  function applyScenario(scenario: PlannerScenario) {
    setActiveScenario(scenario.id);
    setBucketAmounts(scenario.bucketAmounts);
    setCardAmount(scenario.cardAmount);
    setMerchant(scenario.merchant);
    setPaycheck(scenario.paycheck);
    setUnlockAmount(scenario.unlockAmount);
    setUnlockBucket(scenario.unlockBucket);
    setUnlockMode(scenario.unlockMode);
  }

  function updatePaycheck(nextAmount: number) {
    setActiveScenario("custom");
    setPaycheck(clamp(nextAmount, 500, 8000));
  }

  function updateBucketAmount(id: BucketId, nextAmount: number) {
    setActiveScenario("custom");
    setBucketAmounts((current) => ({
      ...current,
      [id]: clamp(nextAmount, 0, 2000),
    }));
  }

  function updateCardAmount(nextAmount: number) {
    setActiveScenario("custom");
    setCardAmount(clamp(nextAmount, 1, 5000));
  }

  function updateMerchant(nextMerchant: string) {
    setActiveScenario("custom");
    setMerchant(nextMerchant);
  }

  function updateUnlockAmount(nextAmount: number) {
    setActiveScenario("custom");
    setUnlockAmount(clamp(nextAmount, 25, 2000));
  }

  function updateUnlockBucket(nextBucket: BucketId) {
    setActiveScenario("custom");
    setUnlockBucket(nextBucket);
  }

  function updateUnlockMode(nextMode: UnlockMode) {
    setActiveScenario("custom");
    setUnlockMode(nextMode);
  }

  return (
    <section
      id="product"
      className="pay-app-shell relative min-h-screen overflow-x-hidden border-b border-white/10 text-[#fff7ea]"
    >
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#08110f]/76 py-3 backdrop-blur">
          <a className="flex items-center gap-3" href="#product">
            <span className="grid size-10 place-items-center rounded-[8px] border border-[#9ee6d6]/40 bg-[#9ee6d6] text-[#07110f] shadow-[0_0_34px_rgba(158,230,214,0.18)]">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-base font-semibold leading-5 text-[#fff7ea]">
                PayShield
              </span>
              <span className="block text-xs font-medium uppercase leading-4 tracking-[0.18em] text-[#9c9588]">
                Paycheck planning app
              </span>
            </span>
          </a>
          <nav
            aria-label="Primary"
            className="flex flex-wrap items-center gap-1 rounded-[8px] border border-white/10 bg-white/[0.045] p-1 text-sm font-medium text-[#e1d6c5]"
          >
            <a className="rounded-[8px] px-3 py-2 hover:bg-white/10" href="#product">
              Today
            </a>
            <a
              className="rounded-[8px] px-3 py-2 hover:bg-white/10"
              href="#buckets"
            >
              Buckets
            </a>
            <a
              className="rounded-[8px] px-3 py-2 hover:bg-white/10"
              href="#card-guard"
            >
              Spending
            </a>
            <a
              className="rounded-[8px] px-3 py-2 hover:bg-white/10"
              href="#recovery"
            >
              Recovery
            </a>
            <a
              className="inline-flex items-center gap-2 rounded-[8px] bg-[#9ee6d6] px-4 py-2 font-semibold text-[#07110f] hover:bg-[#baf3e7]"
              href="#early-access"
            >
              Early access
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </nav>
        </header>

        <div className="grid flex-1 items-center gap-6 py-8 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_430px]">
          <div className="min-w-0">
            <div className="mb-5 max-w-3xl">
              <p className="mb-3 inline-flex items-center gap-2 rounded-[8px] border border-[#9ee6d6]/25 bg-[#9ee6d6]/10 px-3 py-2 text-sm font-semibold text-[#d9fff6] shadow-[0_0_36px_rgba(158,230,214,0.1)]">
                <Lock className="size-4" aria-hidden="true" />
                Manual MVP - no bank login required
              </p>
              <h1 className="text-4xl font-semibold leading-[1.03] text-[#fff7ea] sm:text-5xl lg:text-6xl">
                Know what is safe to spend before the week gets loud.
              </h1>
              <p className="mt-3 max-w-2xl text-lg leading-8 text-[#cfc6b7]">
                PayShield turns a paycheck into bill reserves, goal buckets,
                purchase checks, and one clear number the household can use.
              </p>
            </div>

            <div className="mb-4 grid max-w-4xl gap-3 sm:grid-cols-3">
              {heroSignals.map((signal) => {
                const Icon = signal.icon;

                return (
                  <div
                    className="rounded-[8px] border border-white/10 bg-[#101b18]/86 p-3 shadow-[0_18px_55px_rgba(0,0,0,0.2)]"
                    key={signal.label}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a89f90]">
                        {signal.label}
                      </p>
                      <Icon className="size-4 text-[#9ee6d6]" aria-hidden="true" />
                    </div>
                    <p className="mt-3 text-xl font-semibold text-[#fff7ea]">
                      {signal.value}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[#cfc6b7]">
                      {signal.body}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="mb-4 grid max-w-4xl gap-3 md:grid-cols-4">
              {operatingVitals.map((vital) => {
                const Icon = vital.icon;

                return (
                  <div
                    className="rounded-[8px] border border-white/10 bg-[#0d1714]/82 p-3 ring-1 ring-white/[0.03]"
                    key={vital.label}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#95a79d]">
                        {vital.label}
                      </p>
                      <Icon className="size-4 text-[#a6d8ff]" aria-hidden="true" />
                    </div>
                    <p className="mt-2 text-sm font-semibold text-[#fff7ea]">
                      {vital.value}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[#b7c2b9]">
                      {vital.body}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="mb-4 grid max-w-4xl gap-3 lg:grid-cols-[minmax(0,1fr)_170px]">
              <div className="rounded-[8px] border border-white/10 bg-[#111d19]/88 p-3 ring-1 ring-white/[0.03]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#fff7ea]">
                      Try a paycheck week
                    </p>
                    <p className="text-xs leading-5 text-[#b7c2b9]">
                      {activeScenarioLabel} - {storageStatusCopy[storageStatus]}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-[8px] border border-[#9ee6d6]/25 bg-[#9ee6d6]/10 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#d9fff6]">
                    <CheckCircle2 className="size-3.5" aria-hidden="true" />
                    Local plan
                  </span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {plannerScenarios.map((scenario) => (
                    <button
                      aria-pressed={activeScenario === scenario.id}
                      className={`rounded-[8px] border px-3 py-2 text-left transition ${
                        activeScenario === scenario.id
                          ? "border-[#9ee6d6]/60 bg-[#9ee6d6]/15 text-[#f1fffb]"
                          : "border-white/10 bg-white/[0.035] text-[#e1d6c5] hover:border-white/25 hover:bg-white/[0.065]"
                      }`}
                      key={scenario.id}
                      type="button"
                      onClick={() => applyScenario(scenario)}
                    >
                      <span className="block text-sm font-semibold">
                        {scenario.name}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-[#b7c2b9]">
                        {scenario.body}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <button
                className="inline-flex min-h-24 items-center justify-center gap-2 rounded-[8px] border border-white/10 bg-[#111d19] px-4 py-3 text-sm font-semibold text-[#fff7ea] hover:border-[#9ee6d6]/50 hover:bg-[#9ee6d6]/10"
                type="button"
                onClick={() => applyScenario(plannerScenarios[0])}
              >
                <RefreshCcw className="size-4" aria-hidden="true" />
                Reset plan
              </button>
            </div>

            <div className="overflow-hidden rounded-[8px] border border-white/10 bg-[#101b18]/96 shadow-[0_28px_110px_rgba(0,0,0,0.36)] ring-1 ring-[#9ee6d6]/10">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-white/[0.045] px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="size-2 rounded-full bg-[#9ee6d6] shadow-[0_0_16px_rgba(158,230,214,0.64)]" />
                  <div>
                    <p className="text-sm font-semibold text-[#fff7ea]">
                      Your paycheck plan
                    </p>
                    <p className="text-xs leading-5 text-[#a89f90]">
                      Bills, spending, and recovery in one place
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#d7ccbb]">
                  <span className="rounded-[8px] border border-white/10 bg-[#08110f] px-2.5 py-1.5">
                    Manual plan
                  </span>
                  <span className="rounded-[8px] border border-[#ffbf91]/25 bg-[#ffbf91]/10 px-2.5 py-1.5 text-[#ffe0c8]">
                    Bill-first
                  </span>
                </div>
              </div>
              <div className="grid lg:grid-cols-[320px_minmax(0,1fr)]">
                <aside className="border-b border-white/10 bg-[#0b1412] p-4 lg:border-b-0 lg:border-r">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#fff7ea]">
                        Paycheck plan
                      </p>
                      <p className="text-sm text-[#a89f90]">
                        What this check needs to cover
                      </p>
                    </div>
                    <Landmark
                      className="size-5 text-[#9ee6d6]"
                      aria-hidden="true"
                    />
                  </div>

                  <label className="block text-sm font-medium text-[#e1d6c5]">
                    Paycheck amount
                  </label>
                  <div className="mt-2 flex items-center rounded-[8px] border border-white/10 bg-[#08110f] px-3">
                    <span className="text-[#a89f90]">$</span>
                    <input
                      aria-label="Paycheck deposit amount"
                      className="h-12 min-w-0 flex-1 bg-transparent px-2 text-xl font-semibold text-[#fff7ea] outline-none"
                      inputMode="numeric"
                      max={8000}
                      min={500}
                      step={50}
                      type="number"
                      value={paycheck}
                      onInput={(event) =>
                        updatePaycheck(
                          toNumber(event.currentTarget.value, paycheck),
                        )
                      }
                      onChange={(event) =>
                        updatePaycheck(toNumber(event.target.value, paycheck))
                      }
                    />
                  </div>
                  <input
                    aria-label="Adjust paycheck deposit amount"
                    className="mt-4 w-full accent-[#9ee6d6]"
                    max={8000}
                    min={500}
                    step={50}
                    type="range"
                    value={paycheck}
                    onChange={(event) => updatePaycheck(Number(event.target.value))}
                  />

                  <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                    <Metric
                      label="Protected"
                      value={formatMoney(plan.protectedFunded)}
                    />
                    <Metric
                      label="Spendable"
                      value={formatMoney(plan.safeSpend)}
                    />
                    <Metric
                      label="Short"
                      value={formatMoney(plan.shortfall)}
                      warning
                    />
                  </div>

                  <div className="mt-5 rounded-[8px] border border-white/10 bg-white/[0.04] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[#fff7ea]">
                        Spendable share
                      </p>
                      <p className="text-sm font-semibold text-[#9ee6d6]">
                        {Math.round(safeSpendShare)}%
                      </p>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-[#9ee6d6]"
                        style={{ width: `${clamp(safeSpendShare, 0, 100)}%` }}
                      />
                    </div>
                  </div>
                </aside>

                <div id="buckets" className="min-w-0 p-4">
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#fff7ea]">
                        Protected buckets
                      </p>
                      <p className="text-sm text-[#a89f90]">
                        These get funded before everyday spending.
                      </p>
                    </div>
                    <span className="rounded-[8px] border border-[#9ee6d6]/30 bg-[#9ee6d6]/10 px-3 py-2 text-sm font-semibold text-[#d9fff6]">
                      {formatMoney(plan.safeSpend)} safe to spend
                    </span>
                  </div>

                  <div className="grid gap-3">
                    {plan.allocations.map((bucket) => (
                      <BucketRow
                        bucket={bucket}
                        key={bucket.id}
                        onChange={(nextAmount) =>
                          updateBucketAmount(bucket.id, nextAmount)
                        }
                      />
                    ))}
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    <div className="rounded-[8px] border border-white/10 bg-[#0b1412] p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-[#fff7ea]">
                          Priority queue
                        </p>
                        <TrendingUp
                          className="size-4 text-[#a6d8ff]"
                          aria-hidden="true"
                        />
                      </div>
                      <div className="grid gap-2">
                        {priorityQueue.map((bucket, index) => (
                          <div
                            className="flex items-center justify-between gap-3 rounded-[8px] border border-white/10 bg-white/[0.04] px-3 py-2"
                            key={bucket.id}
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[#fff7ea]">
                                {index + 1}. {bucket.name}
                              </p>
                              <p className="text-xs text-[#a89f90]">
                                {bucket.protection} - {bucket.due}
                              </p>
                            </div>
                            <p
                              className={`text-sm font-semibold ${
                                bucket.short > 0 ? "text-[#f4cf7a]" : "text-[#9ee6d6]"
                              }`}
                            >
                              {bucket.short > 0
                                ? `${formatMoney(bucket.short)} short`
                                : "Locked"}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-[8px] border border-white/10 bg-[#0b1412] p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-[#fff7ea]">
                          Household access
                        </p>
                        <Users className="size-4 text-[#9ee6d6]" aria-hidden="true" />
                      </div>
                      <div className="grid gap-2 text-sm leading-6 text-[#d7ccbb]">
                        <p className="rounded-[8px] border border-white/10 bg-white/[0.03] px-3 py-2">
                          Primary user can adjust bucket targets before payday.
                        </p>
                        <p className="rounded-[8px] border border-white/10 bg-white/[0.03] px-3 py-2">
                          Partner view can see coverage, shortfalls, and recovery
                          plans without seeing notes.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <aside className="grid gap-4">
            <div
              id="card-guard"
              className="overflow-hidden rounded-[8px] border border-white/10 bg-[#101b18]/96 shadow-[0_24px_90px_rgba(0,0,0,0.32)] ring-1 ring-white/5"
            >
              <div className="flex items-center justify-between gap-3 border-b border-white/10 p-4">
                <div>
                  <p className="text-sm font-semibold text-[#fff7ea]">
                    Phone view
                  </p>
                  <p className="text-sm text-[#a89f90]">
                    Daily safe-to-spend snapshot
                  </p>
                </div>
                <span className="rounded-[8px] border border-[#ffbf91]/25 bg-[#ffbf91]/10 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#ffe0c8]">
                  MVP
                </span>
              </div>
              <Image
                alt="PayShield mobile dashboard and safe-to-spend view"
                className="aspect-[16/11] w-full object-cover"
                height={1024}
                priority
                src="/images/payshield-product-mockup.avif"
                width={1536}
              />
              <div className="border-t border-white/10 p-4">
                <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[#fff7ea]">
                    Purchase check
                  </p>
                  <WalletCards
                    className="size-5 text-[#a89f90]"
                    aria-hidden="true"
                  />
                </div>

                <div className="mt-4 grid gap-3">
                  <label className="text-sm font-medium text-[#e1d6c5]">
                    Merchant
                    <select
                      className="mt-2 h-11 w-full rounded-[8px] border border-white/10 bg-[#08110f] px-3 text-[#fff7ea] outline-none focus:border-[#9ee6d6]"
                      value={merchant}
                      onChange={(event) => updateMerchant(event.target.value)}
                    >
                      {merchants.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm font-medium text-[#e1d6c5]">
                    Purchase amount
                    <div className="mt-2 flex h-11 items-center rounded-[8px] border border-white/10 bg-[#08110f] px-3">
                      <span className="text-[#a89f90]">$</span>
                      <input
                        aria-label="Card transaction amount"
                        className="min-w-0 flex-1 bg-transparent px-2 text-[#fff7ea] outline-none"
                        inputMode="numeric"
                        max={5000}
                        min={1}
                        step={5}
                        type="number"
                        value={cardAmount}
                        onInput={(event) =>
                          updateCardAmount(
                            toNumber(event.currentTarget.value, cardAmount),
                          )
                        }
                        onChange={(event) =>
                          updateCardAmount(toNumber(event.target.value, cardAmount))
                        }
                      />
                    </div>
                  </label>
                </div>

                <div className="mt-4 grid gap-2">
                  {decisionSteps.map((step) => {
                    const Icon = step.icon;

                    return (
                      <div
                        className="flex items-start gap-3 rounded-[8px] border border-white/10 bg-[#0b1412] p-3"
                        key={step.title}
                      >
                        <Icon
                          className={`mt-0.5 size-4 shrink-0 ${
                            step.title.includes("declined")
                              ? "text-[#ff9f9f]"
                              : "text-[#9ee6d6]"
                          }`}
                          aria-hidden="true"
                        />
                        <div>
                          <p className="text-sm font-semibold text-[#fff7ea]">
                            {step.title}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-[#cfc6b7]">
                            {step.body}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div
                  className={`mt-4 rounded-[8px] border p-3 ${
                    cardApproved
                      ? "border-[#9ee6d6]/30 bg-[#9ee6d6]/10"
                      : "border-[#ff9f9f]/30 bg-[#ff9f9f]/10"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {cardApproved ? (
                      <CheckCircle2
                        className="mt-0.5 size-5 text-[#9ee6d6]"
                        aria-hidden="true"
                      />
                    ) : (
                      <XCircle
                        className="mt-0.5 size-5 text-[#ff9f9f]"
                        aria-hidden="true"
                      />
                    )}
                    <div>
                      <p className="font-semibold text-[#fff7ea]">
                        {cardApproved ? "Fits" : "Pause"} at {merchant}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-[#cfc6b7]">
                        The household has {formatMoney(plan.safeSpend)} safe to
                        spend after protected buckets.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[8px] border border-white/10 bg-[#101b18]/96 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.3)] ring-1 ring-[#a6d8ff]/10">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#fff7ea]">
                    What changed
                  </p>
                  <p className="text-sm text-[#a89f90]">
                    The plan explains each money decision.
                  </p>
                </div>
                <ListChecks className="size-5 text-[#a6d8ff]" aria-hidden="true" />
              </div>
              <div className="grid gap-2">
                {activity.map((event) => {
                  const Icon = event.icon;

                  return (
                    <div
                      className="flex items-start gap-3 rounded-[8px] border border-white/10 bg-[#0b1412] p-3"
                      key={event.title}
                    >
                      <Icon className="mt-0.5 size-4 shrink-0 text-[#a6d8ff]" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-semibold text-[#fff7ea]">
                          {event.title}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-[#cfc6b7]">
                          {event.body}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div
              id="recovery"
              className="rounded-[8px] border border-white/10 bg-[#101b18]/96 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.3)] ring-1 ring-[#ffbf91]/10"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#fff7ea]">
                    Emergency unlock
                  </p>
                  <p className="text-sm text-[#a89f90]">
                    Pause first, then show the refill plan.
                  </p>
                </div>
                <KeyRound className="size-5 text-[#ffbf91]" aria-hidden="true" />
              </div>

              <div className="grid gap-3">
                <label className="text-sm font-medium text-[#e1d6c5]">
                  Protected bucket
                  <select
                    className="mt-2 h-11 w-full rounded-[8px] border border-white/10 bg-[#08110f] px-3 text-[#fff7ea] outline-none focus:border-[#9ee6d6]"
                    value={unlockBucket}
                    onChange={(event) =>
                      updateUnlockBucket(event.target.value as BucketId)
                    }
                  >
                    {plan.allocations.map((bucket) => (
                      <option key={bucket.id} value={bucket.id}>
                        {bucket.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-medium text-[#e1d6c5]">
                  Unlock amount
                  <input
                    aria-label="Emergency unlock amount"
                    className="mt-2 h-11 w-full rounded-[8px] border border-white/10 bg-[#08110f] px-3 text-[#fff7ea] outline-none focus:border-[#9ee6d6]"
                    inputMode="numeric"
                    max={2000}
                    min={25}
                    step={25}
                    type="number"
                    value={unlockAmount}
                    onInput={(event) =>
                      updateUnlockAmount(
                        toNumber(event.currentTarget.value, unlockAmount),
                      )
                    }
                    onChange={(event) =>
                      updateUnlockAmount(
                        toNumber(event.target.value, unlockAmount),
                      )
                    }
                  />
                </label>

                <div
                  aria-label="Unlock speed"
                  className="grid grid-cols-2 gap-2 rounded-[8px] bg-[#08110f] p-1"
                  role="group"
                >
                  <button
                    className={`rounded-[8px] px-3 py-2 text-sm font-semibold ${
                      unlockMode === "slow"
                        ? "bg-[#eaf8ee] text-[#07110f] shadow-sm"
                        : "text-[#cfc6b7]"
                    }`}
                    type="button"
                    onClick={() => updateUnlockMode("slow")}
                  >
                    Free, 24h
                  </button>
                  <button
                    className={`inline-flex items-center justify-center gap-2 rounded-[8px] px-3 py-2 text-sm font-semibold ${
                      unlockMode === "instant"
                        ? "bg-[#eaf8ee] text-[#07110f] shadow-sm"
                        : "text-[#cfc6b7]"
                    }`}
                    type="button"
                    onClick={() => updateUnlockMode("instant")}
                  >
                    <Zap className="size-4" aria-hidden="true" />
                    Instant
                  </button>
                </div>
              </div>

              <div className="mt-4 rounded-[8px] border border-[#ffbf91]/30 bg-[#ffbf91]/10 p-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle
                    className="mt-0.5 size-5 text-[#ffbf91]"
                    aria-hidden="true"
                  />
                  <p className="text-sm leading-6 text-[#efe6d7]">
                    Unlocking {formatMoney(actualUnlock)} from{" "}
                    {selectedUnlockBucket?.name} creates a refill rule of{" "}
                    {formatMoney(recoveryAmount)} from the next{" "}
                    {recoveryChecks} paycheck
                    {recoveryChecks === 1 ? "" : "s"}.
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div className="rounded-[8px] border border-white/10 bg-white/[0.04] p-2">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#9f9484]">
        {label}
      </p>
      <p
        className={`mt-1 text-sm font-semibold ${
          warning ? "text-[#f4cf7a]" : "text-[#fff7ea]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function BucketRow({
  bucket,
  onChange,
}: {
  bucket: Bucket & { target: number; funded: number; short: number };
  onChange: (nextAmount: number) => void;
}) {
  const Icon = bucket.icon;
  const fundedPercent =
    bucket.target > 0 ? (bucket.funded / bucket.target) * 100 : 100;

  return (
    <div className="rounded-[8px] border border-white/10 bg-white/[0.04] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-[8px] text-white"
            style={{ backgroundColor: bucket.color }}
          >
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-[#fff7ea]">{bucket.name}</p>
              <span className="rounded-[8px] border border-white/10 bg-[#08110f] px-2 py-1 text-xs font-semibold text-[#cfc6b7]">
                {bucket.protection}
              </span>
            </div>
            <p className="mt-1 text-sm leading-6 text-[#a89f90]">
              {bucket.rail} - Due {bucket.due}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            aria-label={`Decrease ${bucket.name} target`}
            className="grid size-9 place-items-center rounded-[8px] border border-white/10 bg-[#08110f] text-lg font-semibold text-[#fff7ea] hover:border-[#9ee6d6]/60"
            type="button"
            onClick={() => onChange(bucket.target - 25)}
          >
            -
          </button>
          <label className="sr-only" htmlFor={`${bucket.id}-amount`}>
            {bucket.name} target amount
          </label>
          <input
            className="h-9 w-24 rounded-[8px] border border-white/10 bg-[#08110f] px-2 text-right text-sm font-semibold text-[#fff7ea] outline-none focus:border-[#9ee6d6]"
            id={`${bucket.id}-amount`}
            inputMode="numeric"
            max={2000}
            min={0}
            step={25}
            type="number"
            value={bucket.target}
            onInput={(event) => onChange(toNumber(event.currentTarget.value, 0))}
            onChange={(event) => onChange(toNumber(event.target.value, 0))}
          />
          <button
            aria-label={`Increase ${bucket.name} target`}
            className="grid size-9 place-items-center rounded-[8px] border border-white/10 bg-[#08110f] text-lg font-semibold text-[#fff7ea] hover:border-[#9ee6d6]/60"
            type="button"
            onClick={() => onChange(bucket.target + 25)}
          >
            +
          </button>
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-2 flex items-center justify-between gap-3 text-sm">
          <span className="font-medium text-[#cfc6b7]">
            Funded {formatMoney(bucket.funded)} of {formatMoney(bucket.target)}
          </span>
          {bucket.short > 0 ? (
            <span className="font-semibold text-[#ff9f9f]">
              Short {formatMoney(bucket.short)}
            </span>
          ) : (
            <span className="font-semibold text-[#9ee6d6]">Covered</span>
          )}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[#08110f]">
          <div
            className="h-full rounded-full"
            style={{
              width: `${clamp(fundedPercent, 0, 100)}%`,
              backgroundColor: bucket.color,
            }}
          />
        </div>
      </div>
    </div>
  );
}
