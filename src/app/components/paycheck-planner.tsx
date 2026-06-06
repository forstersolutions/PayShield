"use client";

import Image from "next/image";
import { PayShieldMark } from "@/app/components/pay-shield-mark";
import {
  AlertTriangle,
  Baby,
  CalendarDays,
  Car,
  CheckCircle2,
  CircleDollarSign,
  Download,
  Home,
  KeyRound,
  Landmark,
  ListChecks,
  Lock,
  Minus,
  Plus,
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
    color: "#7ee0a3",
    icon: Home,
  },
  {
    id: "vehicle",
    name: "Vehicle",
    amount: 300,
    due: "15th",
    protection: "Bill-only",
    rail: "Auto loan payee",
    color: "#8fb8ff",
    icon: Car,
  },
  {
    id: "insurance",
    name: "Insurance",
    amount: 500,
    due: "22nd",
    protection: "Bill-only",
    rail: "Carrier autopay",
    color: "#d89b57",
    icon: Umbrella,
  },
  {
    id: "kids",
    name: "Kids",
    amount: 50,
    due: "Every check",
    protection: "Hard lock",
    rail: "Savings transfer",
    color: "#c7a6ff",
    icon: Baby,
  },
  {
    id: "vacation",
    name: "Vacation",
    amount: 100,
    due: "Every check",
    protection: "Soft lock",
    rail: "Goal reserve",
    color: "#6bc6c9",
    icon: Plane,
  },
  {
    id: "misc",
    name: "Miscellaneous",
    amount: 100,
    due: "Every check",
    protection: "Flexible",
    rail: "Flexible reserve",
    color: "#b9ad99",
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
      body: "Refill amount shown before a reserve draw",
      icon: RefreshCcw,
      label: "Recovery pace",
      value: unlockMode === "slow" ? "Two checks" : "Next check",
    },
  ];
  const heroSignals = [
    {
      body: "Bills and goals funded before spending",
      icon: ShieldCheck,
      label: "Promises kept",
      value: formatMoney(plan.protectedFunded),
    },
    {
      body: "The number the household can actually use",
      icon: WalletCards,
      label: "Usable money",
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
      title: "1. Obligations first",
    },
    {
      body: `${formatMoney(plan.safeSpend)} is the only amount treated as spendable.`,
      icon: WalletCards,
      title: "2. Usable-money check",
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
      body: `${formatMoney(actualUnlock)} reserve draw creates ${formatMoney(recoveryAmount)} refill steps.`,
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

  function exportPlan() {
    if (typeof window === "undefined") {
      return;
    }

    const exportData = {
      exportedAt: new Date().toISOString(),
      product: "PayShield",
      promise:
        "Spend from the money left after obligations, goals, and recovery are covered.",
      scenario: activeScenarioLabel,
      paycheck,
      summary: {
        reserved: plan.protectedFunded,
        safeToSpend: plan.safeSpend,
        shortfall: plan.shortfall,
      },
      buckets: plan.allocations.map((bucket) => ({
        name: bucket.name,
        target: bucket.target,
        funded: bucket.funded,
        short: bucket.short,
        due: bucket.due,
        protection: bucket.protection,
      })),
      purchaseCheck: {
        merchant,
        amount: cardAmount,
        decision: cardApproved ? "fits" : "pause",
      },
      recoveryPlan: {
        bucket: selectedUnlockBucket?.name ?? "Reserve",
        amount: actualUnlock,
        repaymentChecks: recoveryChecks,
        perCheck: recoveryAmount,
      },
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `payshield-plan-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const protectedShare = paycheck > 0 ? (plan.protectedFunded / paycheck) * 100 : 0;
  const safeSpendProgress = clamp(safeSpendShare, 0, 100);
  const protectedProgress = clamp(protectedShare, 0, 100);
  const planStatus = firstShortBucket
    ? `${firstShortBucket.name} needs ${formatMoney(firstShortBucket.short)}`
    : "Every priority bucket is covered";
  const safeSpendTone = plan.safeSpend > 0 ? "Ready to use" : "Hold spending";
  const purchaseTone = cardApproved ? "Cleared" : "Needs a pause";

  return (
    <section
      id="product"
      className="pay-app-shell relative min-h-screen overflow-x-hidden border-b border-[#2d281f] text-[#f5efe4]"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#d89b57] to-transparent opacity-70" />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1480px] flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3 border border-[#2d281f] bg-[#0b0a08]/86 px-3 py-3 shadow-[0_22px_90px_rgba(0,0,0,0.42)] backdrop-blur-xl">
          <a className="flex items-center gap-3" href="#product">
            <PayShieldMark className="size-11 drop-shadow-[0_0_24px_rgba(216,155,87,0.2)]" />
            <span>
              <span className="block text-base font-semibold leading-5 text-[#fff6e8]">
                PayShield
              </span>
              <span className="block text-xs font-medium uppercase leading-4 tracking-[0.18em] text-[#9f9483]">
                Paycheck planning app
              </span>
            </span>
          </a>
          <nav
            aria-label="Primary"
            className="flex flex-wrap items-center gap-1 border border-[#2d281f] bg-[#171510]/80 p-1 text-sm font-medium text-[#ece2d3]"
          >
            <a className="px-3 py-2 hover:bg-white/10" href="#product">
              Today
            </a>
            <a
              className="px-3 py-2 hover:bg-white/10"
              href="#buckets"
            >
              Buckets
            </a>
            <a
              className="px-3 py-2 hover:bg-white/10"
              href="#card-guard"
            >
              Spending
            </a>
            <a
              className="px-3 py-2 hover:bg-white/10"
              href="#recovery"
            >
              Recovery
            </a>
            <button
              className="inline-flex items-center gap-2 bg-[#d89b57] px-4 py-2 font-semibold text-[#120d07] shadow-[0_16px_36px_rgba(216,155,87,0.2)] hover:bg-[#f0b86f]"
              type="button"
              onClick={exportPlan}
            >
              Export plan
              <Download className="size-4" aria-hidden="true" />
            </button>
          </nav>
        </header>

        <div className="grid flex-1 items-start gap-5 py-6 lg:grid-cols-[minmax(0,1fr)_410px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
          <div className="min-w-0">
            <div className="mb-4 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div>
                <p className="mb-3 inline-flex items-center gap-2 border border-[#7ee0a3]/25 bg-[#7ee0a3]/10 px-3 py-2 text-sm font-semibold text-[#e6ffe9] shadow-[0_0_36px_rgba(126,224,163,0.12)]">
                <Lock className="size-4" aria-hidden="true" />
                Balances lie. Buckets tell the truth.
                </p>
                <h1 className="max-w-4xl text-4xl font-semibold leading-[1.02] text-[#fff6e8] sm:text-5xl xl:text-6xl">
                  Spend after the paycheck keeps its promises.
                </h1>
                <p className="mt-4 max-w-2xl text-lg leading-8 text-[#d7d0c1]">
                  PayShield subtracts rent, car notes, insurance, family needs,
                  goals, and recovery before it shows the number the household
                  can actually use.
                </p>
              </div>

              <div className="h-fit border border-[#2d281f] bg-[#14120e]/86 p-4 shadow-[0_22px_90px_rgba(0,0,0,0.34)] ring-1 ring-[#d89b57]/10 backdrop-blur">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#d89b57]">
                      Paycheck truth layer
                    </p>
                    <p className="mt-1 text-sm text-[#b7ad9f]">
                      {activeScenarioLabel} - {storageStatusCopy[storageStatus]}
                    </p>
                  </div>
                  <span className="grid size-11 place-items-center border border-[#2d281f] bg-[#211b13] text-[#d89b57]">
                    <Zap className="size-5" aria-hidden="true" />
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {heroSignals.map((signal) => {
                    const Icon = signal.icon;

                    return (
                      <div
                        className="rounded-[8px] border border-white/10 bg-white/[0.045] p-3"
                        key={signal.label}
                      >
                        <Icon className="mb-3 size-4 text-[#7ee0a3]" aria-hidden="true" />
                        <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#9f9483]">
                          {signal.label}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-[#fff6e8]">
                          {signal.value}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
              <section className="overflow-hidden rounded-[8px] border border-white/10 bg-[#11100d]/92 shadow-[0_28px_120px_rgba(0,0,0,0.46)] ring-1 ring-white/[0.04] backdrop-blur-xl">
                <div className="border-b border-white/10 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#fff6e8]">
                        Paycheck splitter
                      </p>
                      <p className="text-sm text-[#b7ad9f]">
                        Obligations first, usable money second
                      </p>
                    </div>
                    <Landmark className="size-5 text-[#7ee0a3]" aria-hidden="true" />
                  </div>

                  <div className="mt-5 grid place-items-center">
                    <div
                      className="relative grid size-56 place-items-center rounded-full"
                      style={{
                        background: `conic-gradient(#7ee0a3 0 ${safeSpendProgress}%, #d89b57 ${safeSpendProgress}% ${clamp(safeSpendProgress + protectedProgress, 0, 100)}%, rgba(255,255,255,0.09) 0)`,
                      }}
                    >
                      <div className="absolute inset-3 rounded-full bg-[#070604]" />
                      <div className="relative text-center">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9f9483]">
                          Actually usable
                        </p>
                        <p className="mt-2 text-4xl font-semibold text-[#fff6e8]">
                          {formatMoney(plan.safeSpend)}
                        </p>
                        <p className="mt-2 text-sm text-[#7ee0a3]">
                          {Math.round(safeSpendProgress)}% of this check
                        </p>
                      </div>
                    </div>
                  </div>

                  <label className="mt-5 block text-sm font-medium text-[#e7dccb]">
                    Paycheck amount
                  </label>
                  <div className="mt-2 flex items-center rounded-[8px] border border-white/10 bg-white/[0.055] px-3 focus-within:border-[#7ee0a3]/70">
                    <span className="text-[#9f9483]">$</span>
                    <input
                      aria-label="Paycheck deposit amount"
                      className="h-12 min-w-0 flex-1 bg-transparent px-2 text-xl font-semibold text-[#fff6e8] outline-none"
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
                    className="mt-4 w-full accent-[#7ee0a3]"
                    max={8000}
                    min={500}
                    step={50}
                    type="range"
                    value={paycheck}
                    onChange={(event) => updatePaycheck(Number(event.target.value))}
                  />

                  <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                    <Metric label="Reserved" value={formatMoney(plan.protectedFunded)} />
                    <Metric label="Spendable" value={safeSpendTone} />
                    <Metric label="Short" value={formatMoney(plan.shortfall)} warning />
                  </div>
                </div>

                <div className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#fff6e8]">
                        Scenarios
                      </p>
                      <p className="text-xs leading-5 text-[#b7ad9f]">
                        Tap one, then tune the numbers.
                      </p>
                    </div>
                    <button
                      className="inline-flex items-center gap-2 rounded-[8px] border border-white/10 bg-white/[0.055] px-3 py-2 text-sm font-semibold text-[#f5efe4] hover:border-[#7ee0a3]/50 hover:bg-[#7ee0a3]/10"
                      type="button"
                      onClick={() => applyScenario(plannerScenarios[0])}
                    >
                      <RefreshCcw className="size-4" aria-hidden="true" />
                      Reset
                    </button>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {plannerScenarios.map((scenario) => (
                      <button
                        aria-pressed={activeScenario === scenario.id}
                        className={`rounded-[8px] border px-3 py-3 text-left transition ${
                          activeScenario === scenario.id
                            ? "border-[#7ee0a3]/70 bg-[#7ee0a3]/14 text-[#f3fff2] shadow-[0_0_32px_rgba(126,224,163,0.12)]"
                            : "border-white/10 bg-white/[0.04] text-[#ece2d3] hover:border-white/25 hover:bg-white/[0.075]"
                        }`}
                        key={scenario.id}
                        type="button"
                        onClick={() => applyScenario(scenario)}
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold">
                            {scenario.name}
                          </span>
                          <span className="text-xs text-[#7ee0a3]">
                            {formatMoney(scenario.paycheck)}
                          </span>
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-[#b7ad9f]">
                          {scenario.body}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section className="overflow-hidden rounded-[8px] border border-white/10 bg-[#11100d]/92 shadow-[0_28px_120px_rgba(0,0,0,0.46)] ring-1 ring-[#7ee0a3]/10 backdrop-blur-xl">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-white/[0.045] px-4 py-3">
                  <div>
                      <p className="text-sm font-semibold text-[#fff6e8]">
                        Paycheck promises
                      </p>
                      <p className="text-xs leading-5 text-[#b7ad9f]">
                      The order your balance never explains.
                    </p>
                  </div>
                  <span className="rounded-[8px] border border-[#d89b57]/30 bg-[#d89b57]/10 px-3 py-2 text-sm font-semibold text-[#f6d89b]">
                    {planStatus}
                  </span>
                </div>
                <div id="buckets" className="grid gap-4 p-4">
                  <div className="grid gap-3 md:grid-cols-4">
                    {operatingVitals.map((vital) => {
                      const Icon = vital.icon;

                      return (
                        <div
                          className="rounded-[8px] border border-white/10 bg-white/[0.045] p-3"
                          key={vital.label}
                        >
                          <Icon className="mb-3 size-4 text-[#8fb8ff]" aria-hidden="true" />
                          <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#9f9483]">
                            {vital.label}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-[#fff6e8]">
                            {vital.value}
                          </p>
                        </div>
                      );
                    })}
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

                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="rounded-[8px] border border-white/10 bg-white/[0.045] p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-[#fff6e8]">
                          Promise order
                        </p>
                        <TrendingUp className="size-4 text-[#8fb8ff]" aria-hidden="true" />
                      </div>
                      <div className="grid gap-2">
                        {priorityQueue.map((bucket, index) => (
                          <div
                            className="flex items-center justify-between gap-3 rounded-[8px] border border-white/10 bg-[#070604]/56 px-3 py-2"
                            key={bucket.id}
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[#fff6e8]">
                                {index + 1}. {bucket.name}
                              </p>
                              <p className="text-xs text-[#9f9483]">
                                {bucket.protection} - {bucket.due}
                              </p>
                            </div>
                            <p
                              className={`text-sm font-semibold ${
                                bucket.short > 0
                                  ? "text-[#ff8f70]"
                                  : "text-[#7ee0a3]"
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

                    <div className="rounded-[8px] border border-white/10 bg-white/[0.045] p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-[#fff6e8]">
                          Household truth mode
                        </p>
                        <Users className="size-4 text-[#7ee0a3]" aria-hidden="true" />
                      </div>
                      <div className="grid gap-2 text-sm leading-6 text-[#d7d0c1]">
                        <p className="rounded-[8px] border border-white/10 bg-[#070604]/48 px-3 py-2">
                          Shared view focuses on what is covered, what is short, and how the plan recovers.
                        </p>
                        <p className="rounded-[8px] border border-white/10 bg-[#070604]/48 px-3 py-2">
                          No bank credentials, account numbers, or sensitive notes required.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>

          <aside className="grid gap-5 lg:sticky lg:top-5">
            <div
              id="card-guard"
              className="overflow-hidden rounded-[8px] border border-white/10 bg-[#11100d]/92 shadow-[0_24px_100px_rgba(0,0,0,0.44)] ring-1 ring-white/[0.04] backdrop-blur-xl"
            >
              <div className="relative min-h-[320px] overflow-hidden">
                <Image
                  alt="PayShield mobile dashboard and safe-to-spend view"
                  className="absolute inset-0 h-full w-full object-cover opacity-45"
                  height={1024}
                  priority
                  src="/images/payshield-product-mockup.avif"
                  width={1536}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-[#0b0a08]/20 via-[#0b0a08]/48 to-[#0b0a08]" />
                <div className="relative p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#fff6e8]">
                        Phone view
                      </p>
                      <p className="text-sm text-[#d7d0c1]">
                        Daily safe-to-spend snapshot
                      </p>
                    </div>
                    <span className="rounded-[8px] border border-[#d89b57]/35 bg-[#d89b57]/12 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#f6d89b]">
                      Live plan
                    </span>
                  </div>
                  <div className="mx-auto mt-7 max-w-[270px] rounded-[30px] border border-white/20 bg-[#070604] p-3 shadow-[0_30px_90px_rgba(0,0,0,0.58)]">
                    <div className="rounded-[22px] border border-white/10 bg-[#171a22] p-4">
                      <div className="mb-4 flex items-center justify-between">
                        <span className="text-xs font-semibold text-[#b7ad9f]">
                          Today
                        </span>
                        <span
                          className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                            cardApproved
                              ? "bg-[#7ee0a3]/15 text-[#7ee0a3]"
                              : "bg-[#ff8f70]/15 text-[#ffb39e]"
                          }`}
                        >
                          {purchaseTone}
                        </span>
                      </div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7ee0a3]">
                        Spendable
                      </p>
                      <p className="mt-1 text-4xl font-semibold text-[#fff6e8]">
                        {formatMoney(plan.safeSpend)}
                      </p>
                      <div className="mt-5 grid gap-2">
                        {plan.allocations.slice(0, 4).map((bucket) => (
                          <div
                            className="flex items-center gap-2 rounded-[8px] bg-white/[0.055] p-2"
                            key={bucket.id}
                          >
                            <span
                              className="size-2.5 rounded-full"
                              style={{ backgroundColor: bucket.color }}
                            />
                            <span className="min-w-0 flex-1 truncate text-xs text-[#d7d0c1]">
                              {bucket.name}
                            </span>
                            <span className="text-xs font-semibold text-[#fff6e8]">
                              {bucket.short > 0 ? "Short" : "Set"}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-5 rounded-[8px] bg-[#7ee0a3] p-3 text-[#06120a]">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em]">
                          Next decision
                        </p>
                        <p className="mt-1 text-sm font-semibold">
                          {merchant} {cardApproved ? "fits" : "should wait"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-white/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#fff6e8]">
                      Purchase check
                    </p>
                    <p className="text-sm text-[#b7ad9f]">
                      Test a real-world swipe before it happens.
                    </p>
                  </div>
                  <WalletCards className="size-5 text-[#d89b57]" aria-hidden="true" />
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  <label className="text-sm font-medium text-[#e7dccb]">
                    Merchant
                    <select
                      className="mt-2 h-11 w-full rounded-[8px] border border-white/10 bg-[#070604] px-3 text-[#fff6e8] outline-none focus:border-[#7ee0a3]"
                      value={merchant}
                      onChange={(event) => updateMerchant(event.target.value)}
                    >
                      {merchants.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm font-medium text-[#e7dccb]">
                    Purchase amount
                    <div className="mt-2 flex h-11 items-center rounded-[8px] border border-white/10 bg-[#070604] px-3 focus-within:border-[#7ee0a3]">
                      <span className="text-[#9f9483]">$</span>
                      <input
                        aria-label="Card transaction amount"
                        className="min-w-0 flex-1 bg-transparent px-2 text-[#fff6e8] outline-none"
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
                        className="flex items-start gap-3 rounded-[8px] border border-white/10 bg-white/[0.045] p-3"
                        key={step.title}
                      >
                        <Icon
                          className={`mt-0.5 size-4 shrink-0 ${
                            step.title.includes("paused")
                              ? "text-[#ff8f70]"
                              : "text-[#7ee0a3]"
                          }`}
                          aria-hidden="true"
                        />
                        <div>
                          <p className="text-sm font-semibold text-[#fff6e8]">
                            {step.title}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-[#d7d0c1]">
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
                      ? "border-[#7ee0a3]/30 bg-[#7ee0a3]/10"
                      : "border-[#ff8f70]/35 bg-[#ff8f70]/10"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {cardApproved ? (
                      <CheckCircle2
                        className="mt-0.5 size-5 text-[#7ee0a3]"
                        aria-hidden="true"
                      />
                    ) : (
                      <XCircle
                        className="mt-0.5 size-5 text-[#ff8f70]"
                        aria-hidden="true"
                      />
                    )}
                    <div>
                      <p className="font-semibold text-[#fff6e8]">
                        {cardApproved ? "Fits" : "Pause"} at {merchant}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-[#d7d0c1]">
                        The household has {formatMoney(plan.safeSpend)} safe to
                        spend after protected buckets.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[8px] border border-white/10 bg-[#11100d]/92 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.34)] ring-1 ring-[#8fb8ff]/10 backdrop-blur-xl">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#fff6e8]">
                    What changed
                  </p>
                  <p className="text-sm text-[#b7ad9f]">
                    The plan explains each money decision.
                  </p>
                </div>
                <ListChecks className="size-5 text-[#8fb8ff]" aria-hidden="true" />
              </div>
              <div className="grid gap-2">
                {activity.map((event) => {
                  const Icon = event.icon;

                  return (
                    <div
                      className="flex items-start gap-3 rounded-[8px] border border-white/10 bg-white/[0.045] p-3"
                      key={event.title}
                    >
                      <Icon className="mt-0.5 size-4 shrink-0 text-[#8fb8ff]" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-semibold text-[#fff6e8]">
                          {event.title}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-[#d7d0c1]">
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
              className="rounded-[8px] border border-white/10 bg-[#11100d]/92 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.34)] ring-1 ring-[#d89b57]/10 backdrop-blur-xl"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#fff6e8]">
                    Recovery plan
                  </p>
                  <p className="text-sm text-[#b7ad9f]">
                    Model a reserve draw before the household commits.
                  </p>
                </div>
                <KeyRound className="size-5 text-[#d89b57]" aria-hidden="true" />
              </div>

              <div className="grid gap-3">
                <label className="text-sm font-medium text-[#e7dccb]">
                  Reserve bucket
                  <select
                    className="mt-2 h-11 w-full rounded-[8px] border border-white/10 bg-[#070604] px-3 text-[#fff6e8] outline-none focus:border-[#7ee0a3]"
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

                <label className="text-sm font-medium text-[#e7dccb]">
                  Reserve draw amount
                  <input
                    aria-label="Reserve draw amount"
                    className="mt-2 h-11 w-full rounded-[8px] border border-white/10 bg-[#070604] px-3 text-[#fff6e8] outline-none focus:border-[#7ee0a3]"
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
                  aria-label="Recovery pace"
                  className="grid grid-cols-2 gap-2 rounded-[8px] bg-[#070604] p-1"
                  role="group"
                >
                  <button
                    className={`rounded-[8px] px-3 py-2 text-sm font-semibold ${
                      unlockMode === "slow"
                        ? "bg-[#7ee0a3] text-[#06120a] shadow-sm"
                        : "text-[#d7d0c1]"
                    }`}
                    type="button"
                    onClick={() => updateUnlockMode("slow")}
                  >
                    Two checks
                  </button>
                  <button
                    className={`inline-flex items-center justify-center gap-2 rounded-[8px] px-3 py-2 text-sm font-semibold ${
                      unlockMode === "instant"
                        ? "bg-[#7ee0a3] text-[#06120a] shadow-sm"
                        : "text-[#d7d0c1]"
                    }`}
                    type="button"
                    onClick={() => updateUnlockMode("instant")}
                  >
                    <Zap className="size-4" aria-hidden="true" />
                    Next check
                  </button>
                </div>
              </div>

              <div className="mt-4 rounded-[8px] border border-[#d89b57]/30 bg-[#d89b57]/10 p-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle
                    className="mt-0.5 size-5 text-[#d89b57]"
                    aria-hidden="true"
                  />
                  <p className="text-sm leading-6 text-[#f5efe4]">
                    Drawing {formatMoney(actualUnlock)} from{" "}
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
    <div className="rounded-[8px] border border-white/10 bg-white/[0.055] p-2">
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#9f9483]">
        {label}
      </p>
      <p
        className={`mt-1 text-sm font-semibold ${
          warning ? "text-[#ff8f70]" : "text-[#fff6e8]"
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
    <div className="group rounded-[8px] border border-white/10 bg-white/[0.045] p-3 transition hover:border-white/20 hover:bg-white/[0.07]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-[8px] text-[#070604] shadow-[0_14px_36px_rgba(0,0,0,0.32)]"
            style={{ backgroundColor: bucket.color }}
          >
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-[#fff6e8]">{bucket.name}</p>
              <span className="rounded-[8px] border border-white/10 bg-[#070604] px-2 py-1 text-xs font-semibold text-[#d7d0c1]">
                {bucket.protection}
              </span>
            </div>
            <p className="mt-1 text-sm leading-6 text-[#b7ad9f]">
              {bucket.rail} - Due {bucket.due}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            aria-label={`Decrease ${bucket.name} target`}
            className="grid size-9 place-items-center rounded-[8px] border border-white/10 bg-[#070604] text-[#fff6e8] hover:border-[#7ee0a3]/60"
            type="button"
            onClick={() => onChange(bucket.target - 25)}
          >
            <Minus className="size-4" aria-hidden="true" />
          </button>
          <label className="sr-only" htmlFor={`${bucket.id}-amount`}>
            {bucket.name} target amount
          </label>
          <input
            className="h-9 w-24 rounded-[8px] border border-white/10 bg-[#070604] px-2 text-right text-sm font-semibold text-[#fff6e8] outline-none focus:border-[#7ee0a3]"
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
            className="grid size-9 place-items-center rounded-[8px] border border-white/10 bg-[#070604] text-[#fff6e8] hover:border-[#7ee0a3]/60"
            type="button"
            onClick={() => onChange(bucket.target + 25)}
          >
            <Plus className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-2 flex items-center justify-between gap-3 text-sm">
          <span className="font-medium text-[#d7d0c1]">
            Funded {formatMoney(bucket.funded)} of {formatMoney(bucket.target)}
          </span>
          {bucket.short > 0 ? (
            <span className="font-semibold text-[#ff8f70]">
              Short {formatMoney(bucket.short)}
            </span>
          ) : (
            <span className="font-semibold text-[#7ee0a3]">Covered</span>
          )}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[#070604]">
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
