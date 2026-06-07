"use client";

import { PayShieldMark } from "@/app/components/pay-shield-mark";
import {
  AlertTriangle,
  Baby,
  Car,
  CheckCircle2,
  CircleDollarSign,
  Download,
  Home,
  KeyRound,
  Minus,
  Plus,
  Plane,
  RefreshCcw,
  ShieldCheck,
  SlidersHorizontal,
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
type PlannerStepId = "paycheck" | "buckets" | "spending";

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
    color: "#b8e7c5",
    icon: Home,
  },
  {
    id: "vehicle",
    name: "Vehicle",
    amount: 300,
    due: "15th",
    protection: "Bill-only",
    rail: "Auto loan payee",
    color: "#9fbfdd",
    icon: Car,
  },
  {
    id: "insurance",
    name: "Insurance",
    amount: 500,
    due: "22nd",
    protection: "Bill-only",
    rail: "Carrier autopay",
    color: "#edb981",
    icon: Umbrella,
  },
  {
    id: "kids",
    name: "Kids",
    amount: 50,
    due: "Every check",
    protection: "Hard lock",
    rail: "Savings transfer",
    color: "#eaa199",
    icon: Baby,
  },
  {
    id: "vacation",
    name: "Vacation",
    amount: 100,
    due: "Every check",
    protection: "Soft lock",
    rail: "Goal reserve",
    color: "#a7d8d1",
    icon: Plane,
  },
  {
    id: "misc",
    name: "Miscellaneous",
    amount: 100,
    due: "Every check",
    protection: "Flexible",
    rail: "Flexible reserve",
    color: "#d6c8b8",
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
const plannerSteps: Array<{
  body: string;
  hash: string;
  icon: LucideIcon;
  id: PlannerStepId;
  label: string;
  title: string;
}> = [
  {
    body: "Start with the money that landed.",
    hash: "paycheck",
    icon: CircleDollarSign,
    id: "paycheck",
    label: "Paycheck",
    title: "Enter the paycheck",
  },
  {
    body: "Set aside what has to be paid.",
    hash: "buckets",
    icon: ShieldCheck,
    id: "buckets",
    label: "Protect",
    title: "Protect what has to be paid",
  },
  {
    body: "Check the purchase before it happens.",
    hash: "card-guard",
    icon: WalletCards,
    id: "spending",
    label: "Spend",
    title: "Check a purchase",
  },
];
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
  const [activeStep, setActiveStep] = useState<PlannerStepId>("paycheck");
  const [scrollTargetId, setScrollTargetId] = useState<string | null>(null);
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
    function syncStepFromHash() {
      const hash = window.location.hash.replace("#", "");
      const step = plannerSteps.find((candidate) => candidate.hash === hash);

      if (step) {
        setActiveStep(step.id);
      }
    }

    syncStepFromHash();
    window.addEventListener("hashchange", syncStepFromHash);

    return () => {
      window.removeEventListener("hashchange", syncStepFromHash);
    };
  }, []);

  useEffect(() => {
    if (!scrollTargetId) {
      return;
    }

    const timeout = window.setTimeout(() => {
      document.getElementById(scrollTargetId)?.scrollIntoView({ block: "start" });
      setScrollTargetId(null);
    }, 25);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [activeStep, scrollTargetId]);

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
  const firstShortBucket = plan.allocations.find((bucket) => bucket.short > 0);
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

  function showStep(nextStep: PlannerStepId, targetId?: string) {
    const step = plannerSteps.find((candidate) => candidate.id === nextStep);
    const scrollTarget = targetId ?? step?.hash ?? "product";

    setActiveStep(nextStep);

    if (typeof window === "undefined") {
      return;
    }

    window.history.replaceState(null, "", `#${scrollTarget}`);
    setScrollTargetId(scrollTarget);
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
    : "Bills and goals covered";
  const safeSpendTone = plan.safeSpend > 0 ? "Ready" : "Hold";
  const purchaseTone = cardApproved ? "Fits" : "Pause";
  const protectedVisualWidth = `${clamp(protectedProgress, 2, 100)}%`;
  const safeSpendVisualWidth = `${clamp(safeSpendProgress, 0, 100)}%`;
  const safeSpendMessage = firstShortBucket
    ? `${firstShortBucket.name} is short by ${formatMoney(firstShortBucket.short)}. Lower a target or increase the check before spending.`
    : `${coveredBuckets.length} buckets are covered. This is the amount left for normal spending.`;
  const dailyPace = Math.floor(plan.safeSpend / 7);
  const activeStepIndex = plannerSteps.findIndex((step) => step.id === activeStep);
  const activeStepConfig = plannerSteps[activeStepIndex] ?? plannerSteps[0];
  const previousStep = plannerSteps[activeStepIndex - 1];
  const nextStep = plannerSteps[activeStepIndex + 1];

  return (
    <section
      id="product"
      className="pay-app-shell relative min-h-screen overflow-x-hidden border-b border-[#3a3027] text-[#f9efe1]"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#edb981] to-transparent opacity-70" />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[#3a3027] bg-[#1a1511]/88 px-3 py-3 shadow-[0_18px_70px_rgba(0,0,0,0.28)] backdrop-blur-xl">
          <a className="flex items-center gap-3" href="#product">
            <PayShieldMark className="size-11 drop-shadow-[0_12px_26px_rgba(0,0,0,0.22)]" />
            <span>
              <span className="block text-base font-semibold leading-5 text-[#fff4e8]">
                PayShield
              </span>
              <span className="block text-xs font-medium uppercase leading-4 tracking-[0.14em] text-[#b7aa9b]">
                Paycheck clarity
              </span>
            </span>
          </a>
          <nav
            aria-label="Primary"
            className="flex flex-wrap items-center gap-1 rounded-[8px] border border-[#3a3027] bg-[#211b16]/82 p-1 text-sm font-medium text-[#eadccc]"
          >
            <a
              className="rounded-[8px] px-3 py-2 hover:bg-white/10"
              href="#product"
              onClick={(event) => {
                event.preventDefault();
                showStep("paycheck", "product");
              }}
            >
              Plan
            </a>
            <a
              className="rounded-[8px] px-3 py-2 hover:bg-white/10"
              href="#buckets"
              onClick={(event) => {
                event.preventDefault();
                showStep("buckets");
              }}
            >
              Buckets
            </a>
            <a
              className="rounded-[8px] px-3 py-2 hover:bg-white/10"
              href="#card-guard"
              onClick={(event) => {
                event.preventDefault();
                showStep("spending");
              }}
            >
              Spending
            </a>
            <a
              className="rounded-[8px] px-3 py-2 hover:bg-white/10"
              href="#recovery"
              onClick={(event) => {
                event.preventDefault();
                showStep("spending", "recovery");
              }}
            >
              Recovery
            </a>
            <button
              className="inline-flex items-center gap-2 rounded-[8px] bg-[#b8e7c5] px-4 py-2 font-semibold text-[#17301f] shadow-[0_14px_34px_rgba(184,231,197,0.16)] hover:bg-[#cff1d7]"
              type="button"
              onClick={exportPlan}
            >
              <Download className="size-4" aria-hidden="true" />
              Export plan
            </button>
          </nav>
        </header>

        <div className="grid flex-1 items-start gap-5 py-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <section className="rounded-[8px] border border-[#3a3027] bg-[#1c1713]/92 p-5 shadow-[0_24px_90px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:p-6">
            <p className="inline-flex items-center gap-2 rounded-[8px] border border-[#b8e7c5]/35 bg-[#b8e7c5]/12 px-3 py-2 text-sm font-semibold text-[#e5f8e9]">
              <ShieldCheck className="size-4" aria-hidden="true" />
              A calm number for real-life spending.
            </p>
            <h1 className="mt-5 max-w-2xl text-4xl font-semibold leading-[1.04] text-[#fff4e8] sm:text-5xl lg:text-[3rem]">
              Know what is safe to spend before the week gets busy.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#d6c8b8] sm:text-lg">
              Add the paycheck, set aside the money that has to be there, and
              PayShield gives you one clear amount for everyday spending.
            </p>

            <div className="mt-6 rounded-[8px] border border-[#44382e] bg-[#261f19] p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#b7aa9b]">
                    Safe to spend
                  </p>
                  <p className="mt-2 text-5xl font-semibold text-[#fff4e8] sm:text-6xl">
                    {formatMoney(plan.safeSpend)}
                  </p>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-[#d6c8b8]">
                    {safeSpendMessage}
                  </p>
                </div>
                <span
                  className={`rounded-[8px] border px-3 py-2 text-sm font-semibold ${
                    firstShortBucket
                      ? "border-[#eaa199]/45 bg-[#eaa199]/12 text-[#f3c2bd]"
                      : "border-[#b8e7c5]/35 bg-[#b8e7c5]/12 text-[#dff6e5]"
                  }`}
                >
                  {planStatus}
                </span>
              </div>

              <div className="mt-6 h-12 overflow-hidden rounded-[8px] border border-[#3a3027] bg-[#17130f]">
                <div className="flex h-full">
                  <div
                    className="grid min-w-0 place-items-center bg-[#edb981]/88 text-[#211205]"
                    style={{ width: protectedVisualWidth }}
                  >
                    <span className="truncate px-3 text-xs font-bold uppercase tracking-[0.08em]">
                      Set aside
                    </span>
                  </div>
                  <div
                    className="grid min-w-0 place-items-center bg-[#b8e7c5] text-[#17301f]"
                    style={{ width: safeSpendVisualWidth }}
                  >
                    {safeSpendProgress >= 8 ? (
                      <span className="truncate px-3 text-xs font-bold uppercase tracking-[0.08em]">
                        Safe spend
                      </span>
                    ) : null}
                  </div>
                  <div className="min-w-[6px] flex-1 bg-white/[0.04]" />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Metric label="Reserved" value={formatMoney(plan.protectedFunded)} />
                <Metric label="Spendable" value={safeSpendTone} />
                <Metric label="Short" value={formatMoney(plan.shortfall)} warning />
              </div>
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              <div className="rounded-[8px] border border-[#3a3027] bg-[#211b16]/82 p-3">
                <CheckCircle2 className="size-4 text-[#b8e7c5]" aria-hidden="true" />
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#b7aa9b]">
                  Save
                </p>
                <p className="mt-1 text-sm font-semibold text-[#fff4e8]">
                  {storageStatusCopy[storageStatus]}
                </p>
              </div>
              <div className="rounded-[8px] border border-[#3a3027] bg-[#211b16]/82 p-3">
                <SlidersHorizontal className="size-4 text-[#9fbfdd]" aria-hidden="true" />
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#b7aa9b]">
                  Setup
                </p>
                <p className="mt-1 text-sm font-semibold text-[#fff4e8]">
                  {activeScenarioLabel}
                </p>
              </div>
              <div className="rounded-[8px] border border-[#3a3027] bg-[#211b16]/82 p-3">
                <WalletCards className="size-4 text-[#edb981]" aria-hidden="true" />
                <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#b7aa9b]">
                  7-day pace
                </p>
                <p className="mt-1 text-sm font-semibold text-[#fff4e8]">
                  {formatMoney(dailyPace)}/day
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-[8px] border border-[#3a3027] bg-[#1c1713]/92 p-4 shadow-[0_24px_90px_rgba(0,0,0,0.24)] backdrop-blur-xl sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#3a3027] pb-4">
              <div>
                <p className="text-sm font-semibold text-[#fff4e8]">
                  Set up this paycheck
                </p>
                <p className="text-sm text-[#b7aa9b]">
                  Three steps. One spending number.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-[8px] border border-[#b8e7c5]/25 bg-[#b8e7c5]/10 px-3 py-2 text-xs font-semibold text-[#dff6e5]">
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  {storageStatusCopy[storageStatus]}
                </span>
                <button
                  className="inline-flex items-center gap-2 rounded-[8px] border border-[#3a3027] bg-[#211b16] px-3 py-2 text-sm font-semibold text-[#f5eadf] hover:border-[#b8e7c5]/50"
                  type="button"
                  onClick={() => applyScenario(plannerScenarios[0])}
                >
                  <RefreshCcw className="size-4" aria-hidden="true" />
                  Reset
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-4">
              <div
                aria-label="Paycheck setup steps"
                className="grid gap-2 sm:grid-cols-3"
                role="tablist"
              >
                {plannerSteps.map((step, index) => {
                  const Icon = step.icon;
                  const selected = activeStep === step.id;

                  return (
                    <button
                      aria-selected={selected}
                      className={`flex items-center gap-3 rounded-[8px] border p-3 text-left transition ${
                        selected
                          ? "border-[#b8e7c5]/55 bg-[#b8e7c5]/12 text-[#f4fff6]"
                          : "border-[#3a3027] bg-[#211b16] text-[#d6c8b8] hover:border-[#b8e7c5]/35"
                      }`}
                      key={step.id}
                      role="tab"
                      type="button"
                      onClick={() => showStep(step.id)}
                    >
                      <span
                        className={`grid size-9 shrink-0 place-items-center rounded-[8px] text-sm font-bold ${
                          selected
                            ? "bg-[#b8e7c5] text-[#17301f]"
                            : "bg-[#17130f] text-[#b7aa9b]"
                        }`}
                      >
                        {index + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-sm font-semibold">
                          <Icon className="size-4 shrink-0" aria-hidden="true" />
                          {step.label}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-[#b7aa9b]">
                          {step.body}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <section
                aria-labelledby={`${activeStepConfig.id}-title`}
                className="rounded-[8px] border border-[#3a3027] bg-[#211b16] p-4"
                id={activeStepConfig.hash}
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-[8px] bg-[#edb981] text-sm font-bold text-[#211205]">
                      {activeStepIndex + 1}
                    </span>
                    <div>
                      <h2
                        className="text-lg font-semibold text-[#fff4e8]"
                        id={`${activeStepConfig.id}-title`}
                      >
                        {activeStepConfig.title}
                      </h2>
                      <p className="text-sm leading-6 text-[#b7aa9b]">
                        {activeStepConfig.body}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    {previousStep ? (
                      <button
                        className="rounded-[8px] border border-[#3a3027] bg-[#17130f] px-3 py-2 text-xs font-semibold text-[#eadccc] hover:border-[#b8e7c5]/45"
                        type="button"
                        onClick={() => showStep(previousStep.id)}
                      >
                        Back
                      </button>
                    ) : null}
                    {nextStep ? (
                      <button
                        className="rounded-[8px] bg-[#b8e7c5] px-3 py-2 text-xs font-semibold text-[#17301f] shadow-[0_14px_34px_rgba(184,231,197,0.16)] hover:bg-[#cff1d7]"
                        type="button"
                        onClick={() => showStep(nextStep.id)}
                      >
                        Next: {nextStep.label}
                      </button>
                    ) : (
                      <button
                        className="rounded-[8px] bg-[#b8e7c5] px-3 py-2 text-xs font-semibold text-[#17301f] shadow-[0_14px_34px_rgba(184,231,197,0.16)] hover:bg-[#cff1d7]"
                        type="button"
                        onClick={exportPlan}
                      >
                        Export
                      </button>
                    )}
                  </div>
                </div>

                {activeStep === "paycheck" ? (
                  <div className="grid gap-4">
                    <div className="rounded-[8px] border border-[#3a3027] bg-[#17130f]/70 p-4">
                      <label className="block text-sm font-medium text-[#eadccc]">
                        Paycheck amount
                      </label>
                      <div className="mt-2 flex items-center rounded-[8px] border border-[#3a3027] bg-[#120f0c] px-3 focus-within:border-[#b8e7c5]/70">
                        <span className="text-[#b7aa9b]">$</span>
                        <input
                          aria-label="Paycheck deposit amount"
                          className="h-12 min-w-0 flex-1 bg-transparent px-2 text-xl font-semibold text-[#fff4e8] outline-none"
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
                        className="mt-4 w-full accent-[#b8e7c5]"
                        max={8000}
                        min={500}
                        step={50}
                        type="range"
                        value={paycheck}
                        onChange={(event) =>
                          updatePaycheck(Number(event.target.value))
                        }
                      />
                    </div>

                    <div>
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-[#fff4e8]">
                          Start with a common setup
                        </p>
                        <SlidersHorizontal
                          className="size-4 text-[#9fbfdd]"
                          aria-hidden="true"
                        />
                      </div>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {plannerScenarios.map((scenario) => (
                          <button
                            aria-pressed={activeScenario === scenario.id}
                            className={`rounded-[8px] border px-3 py-3 text-left transition ${
                              activeScenario === scenario.id
                                ? "border-[#b8e7c5]/70 bg-[#b8e7c5]/14 text-[#f4fff6]"
                                : "border-[#3a3027] bg-[#17130f]/70 text-[#eadccc] hover:border-white/25 hover:bg-white/[0.06]"
                            }`}
                            key={scenario.id}
                            type="button"
                            onClick={() => applyScenario(scenario)}
                          >
                            <span className="flex items-center justify-between gap-3">
                              <span className="text-sm font-semibold">
                                {scenario.name}
                              </span>
                              <span className="text-xs text-[#b8e7c5]">
                                {formatMoney(scenario.paycheck)}
                              </span>
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-[#c8b9aa]">
                              {scenario.body}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                {activeStep === "buckets" ? (
                  <div className="grid gap-3">
                    <div className="grid gap-2 rounded-[8px] border border-[#3a3027] bg-[#17130f]/70 p-3 sm:grid-cols-3">
                      <Metric
                        label="Target"
                        value={formatMoney(plan.protectedTarget)}
                      />
                      <Metric
                        label="Covered"
                        value={formatMoney(plan.protectedFunded)}
                      />
                      <Metric
                        label="Short"
                        value={formatMoney(plan.shortfall)}
                        warning
                      />
                    </div>
                    <div className="grid gap-2">
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
                  </div>
                ) : null}

                {activeStep === "spending" ? (
                  <div className="grid gap-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-sm font-medium text-[#eadccc]">
                        Merchant
                        <select
                          className="mt-2 h-11 w-full rounded-[8px] border border-[#3a3027] bg-[#17130f] px-3 text-[#fff4e8] outline-none focus:border-[#b8e7c5]"
                          value={merchant}
                          onChange={(event) => updateMerchant(event.target.value)}
                        >
                          {merchants.map((option) => (
                            <option key={option}>{option}</option>
                          ))}
                        </select>
                      </label>

                      <label className="text-sm font-medium text-[#eadccc]">
                        Purchase amount
                        <div className="mt-2 flex h-11 items-center rounded-[8px] border border-[#3a3027] bg-[#17130f] px-3 focus-within:border-[#b8e7c5]">
                          <span className="text-[#b7aa9b]">$</span>
                          <input
                            aria-label="Card transaction amount"
                            className="min-w-0 flex-1 bg-transparent px-2 text-[#fff4e8] outline-none"
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
                              updateCardAmount(
                                toNumber(event.target.value, cardAmount),
                              )
                            }
                          />
                        </div>
                      </label>
                    </div>

                    <div
                      className={`rounded-[8px] border p-3 ${
                        cardApproved
                          ? "border-[#b8e7c5]/40 bg-[#b8e7c5]/12"
                          : "border-[#eaa199]/45 bg-[#eaa199]/12"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {cardApproved ? (
                          <CheckCircle2
                            className="mt-0.5 size-5 text-[#b8e7c5]"
                            aria-hidden="true"
                          />
                        ) : (
                          <XCircle
                            className="mt-0.5 size-5 text-[#eaa199]"
                            aria-hidden="true"
                          />
                        )}
                        <div>
                          <p className="font-semibold text-[#fff4e8]">
                            {purchaseTone}: {merchant} for{" "}
                            {formatMoney(cardAmount)}
                          </p>
                          <p className="mt-1 text-sm leading-6 text-[#d6c8b8]">
                            Safe to spend is {formatMoney(plan.safeSpend)} after
                            the protected money is set aside.
                          </p>
                        </div>
                      </div>
                    </div>

                    <details
                      id="recovery"
                      className="rounded-[8px] border border-[#3a3027] bg-[#17130f]/70 p-4"
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-[#fff4e8]">
                        <span className="inline-flex items-center gap-2">
                          <KeyRound
                            className="size-4 text-[#edb981]"
                            aria-hidden="true"
                          />
                          Optional reserve recovery
                        </span>
                        <span className="text-xs font-medium text-[#b7aa9b]">
                          {formatMoney(recoveryAmount)}/check
                        </span>
                      </summary>

                      <div className="mt-4 grid gap-3">
                        <label className="text-sm font-medium text-[#eadccc]">
                          Reserve bucket
                          <select
                            className="mt-2 h-11 w-full rounded-[8px] border border-[#3a3027] bg-[#17130f] px-3 text-[#fff4e8] outline-none focus:border-[#b8e7c5]"
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

                        <label className="text-sm font-medium text-[#eadccc]">
                          Reserve draw amount
                          <input
                            aria-label="Reserve draw amount"
                            className="mt-2 h-11 w-full rounded-[8px] border border-[#3a3027] bg-[#17130f] px-3 text-[#fff4e8] outline-none focus:border-[#b8e7c5]"
                            inputMode="numeric"
                            max={2000}
                            min={25}
                            step={25}
                            type="number"
                            value={unlockAmount}
                            onInput={(event) =>
                              updateUnlockAmount(
                                toNumber(
                                  event.currentTarget.value,
                                  unlockAmount,
                                ),
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
                          className="grid grid-cols-2 gap-2 rounded-[8px] bg-[#120f0c] p-1"
                          role="group"
                        >
                          <button
                            className={`rounded-[8px] px-3 py-2 text-sm font-semibold ${
                              unlockMode === "slow"
                                ? "bg-[#b8e7c5] text-[#17301f] shadow-sm"
                                : "text-[#d6c8b8]"
                            }`}
                            type="button"
                            onClick={() => updateUnlockMode("slow")}
                          >
                            Two checks
                          </button>
                          <button
                            className={`inline-flex items-center justify-center gap-2 rounded-[8px] px-3 py-2 text-sm font-semibold ${
                              unlockMode === "instant"
                                ? "bg-[#b8e7c5] text-[#17301f] shadow-sm"
                                : "text-[#d6c8b8]"
                            }`}
                            type="button"
                            onClick={() => updateUnlockMode("instant")}
                          >
                            <Zap className="size-4" aria-hidden="true" />
                            Next check
                          </button>
                        </div>

                        <div className="rounded-[8px] border border-[#edb981]/35 bg-[#edb981]/10 p-3">
                          <div className="flex items-start gap-3">
                            <AlertTriangle
                              className="mt-0.5 size-5 text-[#edb981]"
                              aria-hidden="true"
                            />
                            <p className="text-sm leading-6 text-[#f9efe1]">
                              Drawing {formatMoney(actualUnlock)} from{" "}
                              {selectedUnlockBucket?.name} adds{" "}
                              {formatMoney(recoveryAmount)} to the next{" "}
                              {recoveryChecks} paycheck
                              {recoveryChecks === 1 ? "" : "s"}.
                            </p>
                          </div>
                        </div>
                      </div>
                    </details>
                  </div>
                ) : null}
              </section>

            </div>
          </section>
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
    <div className="rounded-[8px] border border-[#3a3027] bg-[#17130f]/70 p-2">
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#b7aa9b]">
        {label}
      </p>
      <p
        className={`mt-1 text-sm font-semibold ${
          warning ? "text-[#eaa199]" : "text-[#fff4e8]"
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
    <div className="group rounded-[8px] border border-[#3a3027] bg-[#17130f]/58 p-3 transition hover:border-[#b8e7c5]/40 hover:bg-[#1c1713]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="grid size-10 shrink-0 place-items-center rounded-[8px] text-[#17130f] shadow-[0_14px_30px_rgba(0,0,0,0.22)]"
            style={{ backgroundColor: bucket.color }}
          >
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-[#fff4e8]">{bucket.name}</p>
              <span className="rounded-[8px] border border-[#3a3027] bg-[#211b16] px-2 py-1 text-xs font-semibold text-[#d6c8b8]">
                {bucket.protection}
              </span>
            </div>
            <p className="mt-1 text-sm leading-6 text-[#b7aa9b]">
              {bucket.rail} - Due {bucket.due}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            aria-label={`Decrease ${bucket.name} target`}
            className="grid size-9 place-items-center rounded-[8px] border border-[#3a3027] bg-[#211b16] text-[#fff4e8] hover:border-[#b8e7c5]/60"
            type="button"
            onClick={() => onChange(bucket.target - 25)}
          >
            <Minus className="size-4" aria-hidden="true" />
          </button>
          <label className="sr-only" htmlFor={`${bucket.id}-amount`}>
            {bucket.name} target amount
          </label>
          <input
            className="h-9 w-24 rounded-[8px] border border-[#3a3027] bg-[#211b16] px-2 text-right text-sm font-semibold text-[#fff4e8] outline-none focus:border-[#b8e7c5]"
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
            className="grid size-9 place-items-center rounded-[8px] border border-[#3a3027] bg-[#211b16] text-[#fff4e8] hover:border-[#b8e7c5]/60"
            type="button"
            onClick={() => onChange(bucket.target + 25)}
          >
            <Plus className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-2 flex items-center justify-between gap-3 text-sm">
          <span className="font-medium text-[#d6c8b8]">
            Funded {formatMoney(bucket.funded)} of {formatMoney(bucket.target)}
          </span>
          {bucket.short > 0 ? (
            <span className="font-semibold text-[#eaa199]">
              Short {formatMoney(bucket.short)}
            </span>
          ) : (
            <span className="font-semibold text-[#b8e7c5]">Covered</span>
          )}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[#211b16]">
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
