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
    color: "#9dffb3",
    icon: Home,
  },
  {
    id: "vehicle",
    name: "Vehicle",
    amount: 300,
    due: "15th",
    protection: "Bill-only",
    rail: "Auto loan payee",
    color: "#7db7ff",
    icon: Car,
  },
  {
    id: "insurance",
    name: "Insurance",
    amount: 500,
    due: "22nd",
    protection: "Bill-only",
    rail: "Carrier autopay",
    color: "#f2a65a",
    icon: Umbrella,
  },
  {
    id: "kids",
    name: "Kids",
    amount: 50,
    due: "Every check",
    protection: "Hard lock",
    rail: "Savings transfer",
    color: "#ff8a7a",
    icon: Baby,
  },
  {
    id: "vacation",
    name: "Vacation",
    amount: 100,
    due: "Every check",
    protection: "Soft lock",
    rail: "Goal reserve",
    color: "#9ce7e1",
    icon: Plane,
  },
  {
    id: "misc",
    name: "Miscellaneous",
    amount: 100,
    due: "Every check",
    protection: "Flexible",
    rail: "Flexible reserve",
    color: "#f8f1e3",
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
  const flowStops = [
    {
      accent: "#f2a65a",
      body: activeScenarioLabel,
      icon: Landmark,
      label: "Paycheck lands",
      value: formatMoney(paycheck),
    },
    {
      accent: "#f8f1e3",
      body: `${coveredBuckets.length}/${plan.allocations.length} buckets covered`,
      icon: Lock,
      label: "Promises lock",
      value: formatMoney(plan.protectedFunded),
    },
    {
      accent: "#9dffb3",
      body: safeSpendTone,
      icon: WalletCards,
      label: "Usable money opens",
      value: formatMoney(plan.safeSpend),
    },
  ];
  const protectedVisualWidth = `${clamp(protectedProgress, 2, 100)}%`;
  const safeSpendVisualWidth = `${clamp(safeSpendProgress, 0, 100)}%`;

  return (
    <section
      id="product"
      className="pay-app-shell relative min-h-screen overflow-x-hidden border-b border-[#263026] text-[#f8f1e3]"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#9dffb3] to-transparent opacity-80" />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1560px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3 border border-[#263026] bg-[#080a08]/88 px-3 py-3 shadow-[0_28px_100px_rgba(0,0,0,0.48)] backdrop-blur-xl">
          <a className="flex items-center gap-3" href="#product">
            <PayShieldMark className="size-12 drop-shadow-[0_0_26px_rgba(157,255,179,0.16)]" />
            <span>
              <span className="block text-base font-semibold leading-5 text-[#f8f1e3]">
                PayShield
              </span>
              <span className="block text-xs font-medium uppercase leading-4 tracking-[0.18em] text-[#9aa79c]">
                Usable-number engine
              </span>
            </span>
          </a>
          <nav
            aria-label="Primary"
            className="flex flex-wrap items-center gap-1 border border-[#263026] bg-[#101410]/82 p-1 text-sm font-medium text-[#e9eee6]"
          >
            <a className="px-3 py-2 hover:bg-white/10" href="#product">
              Flow
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
              className="inline-flex items-center gap-2 bg-[#9dffb3] px-4 py-2 font-semibold text-[#06120a] shadow-[0_18px_42px_rgba(157,255,179,0.18)] hover:bg-[#c6ffd2]"
              type="button"
              onClick={exportPlan}
            >
              <Download className="size-4" aria-hidden="true" />
              Export plan
            </button>
          </nav>
        </header>

        <div className="grid flex-1 items-start gap-4 py-5 lg:grid-cols-[minmax(280px,0.82fr)_minmax(520px,1.36fr)_minmax(320px,0.86fr)] xl:gap-5">
          <section className="border border-[#263026] bg-[#0a0d0a]/90 p-4 shadow-[0_28px_110px_rgba(0,0,0,0.42)] ring-1 ring-white/[0.04] backdrop-blur-xl lg:min-h-[calc(100vh-116px)]">
            <p className="inline-flex items-center gap-2 border border-[#9dffb3]/30 bg-[#9dffb3]/10 px-3 py-2 text-sm font-semibold text-[#ddffe4] shadow-[0_0_38px_rgba(157,255,179,0.12)]">
              <Lock className="size-4" aria-hidden="true" />
              Balances are the decoy. The usable number is the truth.
            </p>
            <h1 className="mt-5 max-w-xl text-4xl font-semibold leading-[1.02] text-[#fff9ed] sm:text-5xl lg:text-[2.9rem] xl:text-[3.1rem]">
              Your paycheck gets an airlock before spending gets a vote.
            </h1>
            <p className="mt-4 text-base leading-7 text-[#cdd8ce] sm:text-lg">
              PayShield does what balances and budget apps do not: it subtracts
              rent, car notes, insurance, family needs, goals, and recovery
              before showing the money that can actually be touched.
            </p>

            <div className="mt-5 grid grid-cols-3 gap-2">
              {heroSignals.map((signal) => {
                const Icon = signal.icon;

                return (
                  <div
                    className="border border-white/10 bg-white/[0.045] p-3"
                    key={signal.label}
                  >
                    <Icon className="mb-3 size-4 text-[#9dffb3]" aria-hidden="true" />
                    <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#9aa79c]">
                      {signal.label}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[#fff9ed]">
                      {signal.value}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 border border-[#263026] bg-[#111610] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#fff9ed]">
                    Paycheck control
                  </p>
                  <p className="text-xs leading-5 text-[#9aa79c]">
                    {activeScenarioLabel} - {storageStatusCopy[storageStatus]}
                  </p>
                </div>
                <button
                  className="grid size-10 place-items-center border border-white/10 bg-[#050605] text-[#9dffb3] hover:border-[#9dffb3]/55"
                  type="button"
                  onClick={() => applyScenario(plannerScenarios[0])}
                  aria-label="Reset planner"
                >
                  <RefreshCcw className="size-4" aria-hidden="true" />
                </button>
              </div>

              <label className="mt-4 block text-sm font-medium text-[#e9eee6]">
                Paycheck amount
              </label>
              <div className="mt-2 flex items-center border border-white/10 bg-[#050605] px-3 focus-within:border-[#9dffb3]/70">
                <span className="text-[#9aa79c]">$</span>
                <input
                  aria-label="Paycheck deposit amount"
                  className="h-12 min-w-0 flex-1 bg-transparent px-2 text-xl font-semibold text-[#fff9ed] outline-none"
                  inputMode="numeric"
                  max={8000}
                  min={500}
                  step={50}
                  type="number"
                  value={paycheck}
                  onInput={(event) =>
                    updatePaycheck(toNumber(event.currentTarget.value, paycheck))
                  }
                  onChange={(event) =>
                    updatePaycheck(toNumber(event.target.value, paycheck))
                  }
                />
              </div>
              <input
                aria-label="Adjust paycheck deposit amount"
                className="mt-4 w-full accent-[#9dffb3]"
                max={8000}
                min={500}
                step={50}
                type="range"
                value={paycheck}
                onChange={(event) => updatePaycheck(Number(event.target.value))}
              />

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Metric label="Reserved" value={formatMoney(plan.protectedFunded)} />
                <Metric label="Spendable" value={safeSpendTone} />
                <Metric label="Short" value={formatMoney(plan.shortfall)} warning />
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#fff9ed]">
                    Scenarios
                  </p>
                  <p className="text-xs leading-5 text-[#9aa79c]">
                    Start fast, then tune every dollar.
                  </p>
                </div>
                <SlidersHorizontal className="size-4 text-[#7db7ff]" aria-hidden="true" />
              </div>
              <div className="grid gap-2">
                {plannerScenarios.map((scenario) => (
                  <button
                    aria-pressed={activeScenario === scenario.id}
                    className={`border px-3 py-3 text-left transition ${
                      activeScenario === scenario.id
                        ? "border-[#9dffb3]/70 bg-[#9dffb3]/14 text-[#f3fff2] shadow-[0_0_34px_rgba(157,255,179,0.14)]"
                        : "border-white/10 bg-white/[0.04] text-[#e9eee6] hover:border-white/25 hover:bg-white/[0.075]"
                    }`}
                    key={scenario.id}
                    type="button"
                    onClick={() => applyScenario(scenario)}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold">
                        {scenario.name}
                      </span>
                      <span className="text-xs text-[#9dffb3]">
                        {formatMoney(scenario.paycheck)}
                      </span>
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-[#aeb8ad]">
                      {scenario.body}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="min-w-0 overflow-hidden border border-[#263026] bg-[#0b0f0b]/92 shadow-[0_32px_130px_rgba(0,0,0,0.5)] ring-1 ring-[#9dffb3]/10 backdrop-blur-xl lg:min-h-[calc(100vh-116px)]">
            <div className="border-b border-white/10 bg-white/[0.035] p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#9dffb3]">
                    Paycheck truth engine
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-[#fff9ed] sm:text-3xl">
                    Money moves through promises before it becomes spendable.
                  </h2>
                </div>
                <span className="border border-[#f2a65a]/35 bg-[#f2a65a]/12 px-3 py-2 text-sm font-semibold text-[#ffd2a1]">
                  {planStatus}
                </span>
              </div>
            </div>

            <div className="grid gap-5 p-4 sm:p-5">
              <div className="grid gap-3 md:grid-cols-3">
                {flowStops.map((stop) => {
                  const Icon = stop.icon;

                  return (
                    <div
                      className="relative overflow-hidden border border-white/10 bg-[#111610] p-4"
                      key={stop.label}
                    >
                      <div
                        className="absolute inset-x-0 top-0 h-1"
                        style={{ backgroundColor: stop.accent }}
                      />
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9aa79c]">
                            {stop.label}
                          </p>
                          <p className="mt-2 text-2xl font-semibold text-[#fff9ed]">
                            {stop.value}
                          </p>
                          <p className="mt-1 text-sm text-[#aeb8ad]">
                            {stop.body}
                          </p>
                        </div>
                        <span
                          className="grid size-10 shrink-0 place-items-center border border-white/10 bg-[#050605]"
                          style={{ color: stop.accent }}
                        >
                          <Icon className="size-4" aria-hidden="true" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="relative overflow-hidden border border-[#263026] bg-[#050605] p-4">
                <div className="absolute inset-y-0 left-0 w-1/2 opacity-30 pay-scanline" />
                <div className="relative">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[#fff9ed]">
                      Live split
                    </p>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9aa79c]">
                      Protected first / spendable second
                    </p>
                  </div>
                  <div className="h-14 overflow-hidden border border-white/10 bg-[#0f130f]">
                    <div className="flex h-full">
                      <div
                        className="grid min-w-0 place-items-center bg-[#f2a65a]/78 text-[#160d04]"
                        style={{ width: protectedVisualWidth }}
                      >
                        <span className="truncate px-3 text-xs font-bold uppercase tracking-[0.12em]">
                          Protected
                        </span>
                      </div>
                      <div
                        className="grid min-w-0 place-items-center bg-[#9dffb3] text-[#06120a]"
                        style={{ width: safeSpendVisualWidth }}
                      >
                        {safeSpendProgress >= 8 ? (
                          <span className="truncate px-3 text-xs font-bold uppercase tracking-[0.12em]">
                            Usable
                          </span>
                        ) : null}
                      </div>
                      <div className="min-w-[6px] flex-1 bg-white/[0.035]" />
                    </div>
                  </div>
                  <div className="mt-3 h-1 overflow-hidden bg-white/10">
                    <div className="pay-flow-line h-full bg-gradient-to-r from-[#f2a65a] via-[#9dffb3] to-[#7db7ff]" />
                  </div>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {operatingVitals.map((vital) => {
                  const Icon = vital.icon;

                  return (
                    <div
                      className="border border-white/10 bg-white/[0.04] p-3"
                      key={vital.label}
                    >
                      <Icon className="mb-3 size-4 text-[#7db7ff]" aria-hidden="true" />
                      <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#9aa79c]">
                        {vital.label}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-[#fff9ed]">
                        {vital.value}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div id="buckets" className="grid gap-3">
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

              <div className="grid gap-3 xl:grid-cols-[0.92fr_1.08fr]">
                <div className="border border-white/10 bg-white/[0.045] p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[#fff9ed]">
                      Promise order
                    </p>
                    <TrendingUp className="size-4 text-[#7db7ff]" aria-hidden="true" />
                  </div>
                  <div className="grid gap-2">
                    {priorityQueue.map((bucket, index) => (
                      <div
                        className="flex items-center justify-between gap-3 border border-white/10 bg-[#050605]/62 px-3 py-2"
                        key={bucket.id}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[#fff9ed]">
                            {index + 1}. {bucket.name}
                          </p>
                          <p className="text-xs text-[#9aa79c]">
                            {bucket.protection} - {bucket.due}
                          </p>
                        </div>
                        <p
                          className={`text-sm font-semibold ${
                            bucket.short > 0
                              ? "text-[#ff8a7a]"
                              : "text-[#9dffb3]"
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

                <div className="border border-white/10 bg-white/[0.045] p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[#fff9ed]">
                      Household mode
                    </p>
                    <Users className="size-4 text-[#9dffb3]" aria-hidden="true" />
                  </div>
                  <div className="grid gap-2 text-sm leading-6 text-[#cdd8ce]">
                    <p className="border border-white/10 bg-[#050605]/54 px-3 py-2">
                      Every person sees what is covered, what is short, and how
                      the week recovers before money leaves the plan.
                    </p>
                    <p className="border border-white/10 bg-[#050605]/54 px-3 py-2">
                      No bank credentials, account numbers, or sensitive notes
                      are required to build the usable number.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <aside className="grid gap-4 lg:sticky lg:top-4">
            <div
              id="card-guard"
              className="overflow-hidden border border-[#263026] bg-[#0b0f0b]/92 shadow-[0_28px_100px_rgba(0,0,0,0.48)] ring-1 ring-white/[0.04] backdrop-blur-xl"
            >
              <div className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#f2a65a]">
                      Decision lens
                    </p>
                    <p className="mt-1 text-sm text-[#aeb8ad]">
                      Test the swipe before the account regrets it.
                    </p>
                  </div>
                  <WalletCards className="size-5 text-[#f2a65a]" aria-hidden="true" />
                </div>

                <div
                  className={`mt-5 border p-4 ${
                    cardApproved
                      ? "border-[#9dffb3]/35 bg-[#9dffb3]/11"
                      : "border-[#ff8a7a]/40 bg-[#ff8a7a]/11"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9aa79c]">
                        Purchase check
                      </p>
                      <p
                        className={`mt-2 text-3xl font-semibold ${
                          cardApproved ? "text-[#9dffb3]" : "text-[#ffb2a8]"
                        }`}
                      >
                        {purchaseTone}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[#cdd8ce]">
                        {merchant} at {formatMoney(cardAmount)}{" "}
                        {cardApproved ? "fits inside" : "runs past"} the{" "}
                        {formatMoney(plan.safeSpend)} usable number.
                      </p>
                    </div>
                    {cardApproved ? (
                      <CheckCircle2 className="size-7 text-[#9dffb3]" aria-hidden="true" />
                    ) : (
                      <XCircle className="size-7 text-[#ff8a7a]" aria-hidden="true" />
                    )}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  <label className="text-sm font-medium text-[#e9eee6]">
                    Merchant
                    <select
                      className="mt-2 h-11 w-full border border-white/10 bg-[#050605] px-3 text-[#fff9ed] outline-none focus:border-[#9dffb3]"
                      value={merchant}
                      onChange={(event) => updateMerchant(event.target.value)}
                    >
                      {merchants.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm font-medium text-[#e9eee6]">
                    Purchase amount
                    <div className="mt-2 flex h-11 items-center border border-white/10 bg-[#050605] px-3 focus-within:border-[#9dffb3]">
                      <span className="text-[#9aa79c]">$</span>
                      <input
                        aria-label="Card transaction amount"
                        className="min-w-0 flex-1 bg-transparent px-2 text-[#fff9ed] outline-none"
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
                        className="flex items-start gap-3 border border-white/10 bg-white/[0.045] p-3"
                        key={step.title}
                      >
                        <Icon
                          className={`mt-0.5 size-4 shrink-0 ${
                            step.title.includes("paused")
                              ? "text-[#ff8a7a]"
                              : "text-[#9dffb3]"
                          }`}
                          aria-hidden="true"
                        />
                        <div>
                          <p className="text-sm font-semibold text-[#fff9ed]">
                            {step.title}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-[#cdd8ce]">
                            {step.body}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div
              id="recovery"
              className="border border-[#263026] bg-[#0b0f0b]/92 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.38)] ring-1 ring-[#f2a65a]/10 backdrop-blur-xl"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#fff9ed]">
                    Recovery rule
                  </p>
                  <p className="text-sm text-[#aeb8ad]">
                    A reserve draw has a refill path before it happens.
                  </p>
                </div>
                <KeyRound className="size-5 text-[#f2a65a]" aria-hidden="true" />
              </div>

              <div className="grid gap-3">
                <label className="text-sm font-medium text-[#e9eee6]">
                  Reserve bucket
                  <select
                    className="mt-2 h-11 w-full border border-white/10 bg-[#050605] px-3 text-[#fff9ed] outline-none focus:border-[#9dffb3]"
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

                <label className="text-sm font-medium text-[#e9eee6]">
                  Reserve draw amount
                  <input
                    aria-label="Reserve draw amount"
                    className="mt-2 h-11 w-full border border-white/10 bg-[#050605] px-3 text-[#fff9ed] outline-none focus:border-[#9dffb3]"
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
                  className="grid grid-cols-2 gap-2 bg-[#050605] p-1"
                  role="group"
                >
                  <button
                    className={`px-3 py-2 text-sm font-semibold ${
                      unlockMode === "slow"
                        ? "bg-[#9dffb3] text-[#06120a] shadow-sm"
                        : "text-[#cdd8ce]"
                    }`}
                    type="button"
                    onClick={() => updateUnlockMode("slow")}
                  >
                    Two checks
                  </button>
                  <button
                    className={`inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold ${
                      unlockMode === "instant"
                        ? "bg-[#9dffb3] text-[#06120a] shadow-sm"
                        : "text-[#cdd8ce]"
                    }`}
                    type="button"
                    onClick={() => updateUnlockMode("instant")}
                  >
                    <Zap className="size-4" aria-hidden="true" />
                    Next check
                  </button>
                </div>
              </div>

              <div className="mt-4 border border-[#f2a65a]/35 bg-[#f2a65a]/10 p-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle
                    className="mt-0.5 size-5 text-[#f2a65a]"
                    aria-hidden="true"
                  />
                  <p className="text-sm leading-6 text-[#f8f1e3]">
                    Drawing {formatMoney(actualUnlock)} from{" "}
                    {selectedUnlockBucket?.name} creates a refill rule of{" "}
                    {formatMoney(recoveryAmount)} from the next{" "}
                    {recoveryChecks} paycheck
                    {recoveryChecks === 1 ? "" : "s"}.
                  </p>
                </div>
              </div>
            </div>

            <div className="overflow-hidden border border-[#263026] bg-[#0b0f0b]/92 shadow-[0_24px_80px_rgba(0,0,0,0.34)] ring-1 ring-[#7db7ff]/10 backdrop-blur-xl">
              <div className="relative min-h-[270px]">
                <Image
                  alt="PayShield mobile dashboard and safe-to-spend view"
                  className="absolute inset-0 h-full w-full object-cover opacity-38"
                  height={1024}
                  priority
                  src="/images/payshield-product-mockup.avif"
                  width={1536}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-[#050605]/20 via-[#050605]/68 to-[#050605]" />
                <div className="relative p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#fff9ed]">
                        Daily pocket view
                      </p>
                      <p className="text-sm text-[#cdd8ce]">
                        The same truth, compressed for the next decision.
                      </p>
                    </div>
                    <span className="border border-[#7db7ff]/35 bg-[#7db7ff]/12 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#bfd7ff]">
                      Live
                    </span>
                  </div>
                  <div className="mt-6 border border-white/15 bg-[#050605]/90 p-4 shadow-[0_30px_90px_rgba(0,0,0,0.58)]">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9dffb3]">
                      Spendable now
                    </p>
                    <p className="mt-1 text-4xl font-semibold text-[#fff9ed]">
                      {formatMoney(plan.safeSpend)}
                    </p>
                    <div className="mt-4 grid gap-2">
                      {activity.slice(0, 3).map((event) => {
                        const Icon = event.icon;

                        return (
                          <div
                            className="flex items-start gap-2 border border-white/10 bg-white/[0.045] p-2"
                            key={event.title}
                          >
                            <Icon className="mt-0.5 size-3.5 shrink-0 text-[#7db7ff]" aria-hidden="true" />
                            <p className="text-xs leading-5 text-[#dfe7de]">
                              {event.title}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
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
    <div className="border border-white/10 bg-white/[0.05] p-2">
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#9aa79c]">
        {label}
      </p>
      <p
        className={`mt-1 text-sm font-semibold ${
          warning ? "text-[#ff8a7a]" : "text-[#fff9ed]"
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
    <div className="group border border-white/10 bg-white/[0.045] p-3 transition hover:border-[#9dffb3]/35 hover:bg-white/[0.07]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="grid size-10 shrink-0 place-items-center text-[#050605] shadow-[0_14px_36px_rgba(0,0,0,0.32)]"
            style={{ backgroundColor: bucket.color }}
          >
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-[#fff9ed]">{bucket.name}</p>
              <span className="border border-white/10 bg-[#050605] px-2 py-1 text-xs font-semibold text-[#cdd8ce]">
                {bucket.protection}
              </span>
            </div>
            <p className="mt-1 text-sm leading-6 text-[#aeb8ad]">
              {bucket.rail} - Due {bucket.due}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            aria-label={`Decrease ${bucket.name} target`}
            className="grid size-9 place-items-center border border-white/10 bg-[#050605] text-[#fff9ed] hover:border-[#9dffb3]/60"
            type="button"
            onClick={() => onChange(bucket.target - 25)}
          >
            <Minus className="size-4" aria-hidden="true" />
          </button>
          <label className="sr-only" htmlFor={`${bucket.id}-amount`}>
            {bucket.name} target amount
          </label>
          <input
            className="h-9 w-24 border border-white/10 bg-[#050605] px-2 text-right text-sm font-semibold text-[#fff9ed] outline-none focus:border-[#9dffb3]"
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
            className="grid size-9 place-items-center border border-white/10 bg-[#050605] text-[#fff9ed] hover:border-[#9dffb3]/60"
            type="button"
            onClick={() => onChange(bucket.target + 25)}
          >
            <Plus className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-2 flex items-center justify-between gap-3 text-sm">
          <span className="font-medium text-[#cdd8ce]">
            Funded {formatMoney(bucket.funded)} of {formatMoney(bucket.target)}
          </span>
          {bucket.short > 0 ? (
            <span className="font-semibold text-[#ff8a7a]">
              Short {formatMoney(bucket.short)}
            </span>
          ) : (
            <span className="font-semibold text-[#9dffb3]">Covered</span>
          )}
        </div>
        <div className="h-2 overflow-hidden bg-[#050605]">
          <div
            className="h-full"
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
