"use client";

import Image from "next/image";
import {
  AlertTriangle,
  ArrowRight,
  Baby,
  Car,
  CheckCircle2,
  CircleDollarSign,
  Home,
  KeyRound,
  Landmark,
  Lock,
  Plane,
  ShieldCheck,
  Umbrella,
  WalletCards,
  XCircle,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";

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

const buckets: Bucket[] = [
  {
    id: "rent",
    name: "Rent",
    amount: 500,
    due: "1st",
    protection: "Bill-only",
    rail: "ACH to approved landlord",
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function PaycheckPlanner() {
  const [paycheck, setPaycheck] = useState(3000);
  const [bucketAmounts, setBucketAmounts] = useState<Record<BucketId, number>>(
    () =>
      buckets.reduce(
        (current, bucket) => ({ ...current, [bucket.id]: bucket.amount }),
        {} as Record<BucketId, number>,
      ),
  );
  const [merchant, setMerchant] = useState(merchants[1]);
  const [cardAmount, setCardAmount] = useState(80);
  const [unlockBucket, setUnlockBucket] = useState<BucketId>("rent");
  const [unlockAmount, setUnlockAmount] = useState(200);
  const [unlockMode, setUnlockMode] = useState<UnlockMode>("slow");

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

  function updateBucketAmount(id: BucketId, nextAmount: number) {
    setBucketAmounts((current) => ({
      ...current,
      [id]: clamp(nextAmount, 0, 2000),
    }));
  }

  return (
    <section
      id="product"
      className="min-h-screen border-b border-stone-200 bg-[#f7f5ef] text-stone-950"
    >
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3 py-2">
          <a className="flex items-center gap-3" href="#product">
            <span className="grid size-10 place-items-center rounded-[8px] bg-stone-950 text-white">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-base font-semibold leading-5">
                PayShield
              </span>
              <span className="block text-xs font-medium uppercase leading-4 tracking-[0.18em] text-stone-500">
                Protected paycheck OS
              </span>
            </span>
          </a>
          <nav
            aria-label="Primary"
            className="flex flex-wrap items-center gap-2 text-sm font-medium text-stone-700"
          >
            <a className="rounded-[8px] px-3 py-2 hover:bg-white" href="#rails">
              Rails
            </a>
            <a
              className="rounded-[8px] px-3 py-2 hover:bg-white"
              href="#pricing"
            >
              Pricing
            </a>
            <a
              className="rounded-[8px] px-3 py-2 hover:bg-white"
              href="#launch"
            >
              Launch
            </a>
            <a
              className="inline-flex items-center gap-2 rounded-[8px] bg-stone-950 px-4 py-2 text-white hover:bg-stone-800"
              href="#pilot"
            >
              Pilot
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </nav>
        </header>

        <div className="grid flex-1 items-center gap-6 py-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="min-w-0">
            <div className="mb-5 max-w-3xl">
              <p className="mb-3 inline-flex items-center gap-2 rounded-[8px] border border-teal-900/15 bg-white px-3 py-2 text-sm font-semibold text-teal-900">
                <Lock className="size-4" aria-hidden="true" />
                Your paycheck, protected before you can spend it
              </p>
              <h1 className="text-4xl font-semibold leading-[1.03] text-stone-950 sm:text-5xl lg:text-6xl">
                PayShield
              </h1>
              <p className="mt-3 max-w-2xl text-lg leading-8 text-stone-700">
                A neobank-style protected ledger concept designed to turn
                paychecks into bill buckets, goal reserves, and one honest
                safe-to-spend balance.
              </p>
            </div>

            <div className="overflow-hidden rounded-[8px] border border-stone-300 bg-white shadow-[0_24px_80px_rgba(28,25,23,0.10)]">
              <div className="grid lg:grid-cols-[320px_minmax(0,1fr)]">
                <aside className="border-b border-stone-200 bg-stone-50 p-4 lg:border-b-0 lg:border-r">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-stone-950">
                        Paycheck plan
                      </p>
                      <p className="text-sm text-stone-600">
                        Biweekly deposit rules
                      </p>
                    </div>
                    <Landmark
                      className="size-5 text-teal-700"
                      aria-hidden="true"
                    />
                  </div>

                  <label className="block text-sm font-medium text-stone-700">
                    Deposit amount
                  </label>
                  <div className="mt-2 flex items-center rounded-[8px] border border-stone-300 bg-white px-3">
                    <span className="text-stone-500">$</span>
                    <input
                      aria-label="Paycheck deposit amount"
                      className="h-12 min-w-0 flex-1 bg-transparent px-2 text-xl font-semibold outline-none"
                      inputMode="numeric"
                      max={8000}
                      min={500}
                      step={50}
                      type="number"
                      value={paycheck}
                      onInput={(event) =>
                        setPaycheck(
                          clamp(
                            toNumber(event.currentTarget.value, paycheck),
                            500,
                            8000,
                          ),
                        )
                      }
                      onChange={(event) =>
                        setPaycheck(
                          clamp(
                            toNumber(event.target.value, paycheck),
                            500,
                            8000,
                          ),
                        )
                      }
                    />
                  </div>
                  <input
                    aria-label="Adjust paycheck deposit amount"
                    className="mt-4 w-full accent-teal-700"
                    max={8000}
                    min={500}
                    step={50}
                    type="range"
                    value={paycheck}
                    onChange={(event) => setPaycheck(Number(event.target.value))}
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

                  <div className="mt-5 rounded-[8px] border border-stone-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-stone-900">
                        Safe-spend share
                      </p>
                      <p className="text-sm font-semibold text-teal-800">
                        {Math.round(safeSpendShare)}%
                      </p>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-200">
                      <div
                        className="h-full rounded-full bg-teal-700"
                        style={{ width: `${clamp(safeSpendShare, 0, 100)}%` }}
                      />
                    </div>
                  </div>
                </aside>

                <div className="min-w-0 p-4">
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-stone-950">
                        Protected buckets
                      </p>
                      <p className="text-sm text-stone-600">
                        Priority funding runs before card availability.
                      </p>
                    </div>
                    <span className="rounded-[8px] bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
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
                </div>
              </div>
            </div>
          </div>

          <aside className="grid gap-4">
            <div className="overflow-hidden rounded-[8px] border border-stone-300 bg-white">
              <Image
                alt="PayShield mobile dashboard and debit card concept"
                className="aspect-[3/2] w-full object-cover"
                height={1024}
                priority
                src="/images/payshield-product-mockup.avif"
                width={1536}
              />
              <div className="border-t border-stone-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-stone-950">
                    Card authorization
                  </p>
                  <WalletCards
                    className="size-5 text-stone-500"
                    aria-hidden="true"
                  />
                </div>

                <div className="mt-4 grid gap-3">
                  <label className="text-sm font-medium text-stone-700">
                    Merchant
                    <select
                      className="mt-2 h-11 w-full rounded-[8px] border border-stone-300 bg-white px-3 text-stone-950 outline-none focus:border-teal-700"
                      value={merchant}
                      onChange={(event) => setMerchant(event.target.value)}
                    >
                      {merchants.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm font-medium text-stone-700">
                    Card amount
                    <div className="mt-2 flex h-11 items-center rounded-[8px] border border-stone-300 px-3">
                      <span className="text-stone-500">$</span>
                      <input
                        aria-label="Card transaction amount"
                        className="min-w-0 flex-1 bg-transparent px-2 text-stone-950 outline-none"
                        inputMode="numeric"
                        max={5000}
                        min={1}
                        step={5}
                        type="number"
                        value={cardAmount}
                        onInput={(event) =>
                          setCardAmount(
                            clamp(
                              toNumber(event.currentTarget.value, cardAmount),
                              1,
                              5000,
                            ),
                          )
                        }
                        onChange={(event) =>
                          setCardAmount(
                            clamp(
                              toNumber(event.target.value, cardAmount),
                              1,
                              5000,
                            ),
                          )
                        }
                      />
                    </div>
                  </label>
                </div>

                <div
                  className={`mt-4 rounded-[8px] border p-3 ${
                    cardApproved
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-red-200 bg-red-50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {cardApproved ? (
                      <CheckCircle2
                        className="mt-0.5 size-5 text-emerald-700"
                        aria-hidden="true"
                      />
                    ) : (
                      <XCircle
                        className="mt-0.5 size-5 text-red-700"
                        aria-hidden="true"
                      />
                    )}
                    <div>
                      <p className="font-semibold text-stone-950">
                        {cardApproved ? "Approved" : "Declined"} at {merchant}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-stone-700">
                        The debit card can only see{" "}
                        {formatMoney(plan.safeSpend)} safe-spending funds.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[8px] border border-stone-300 bg-white p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-stone-950">
                    Emergency unlock
                  </p>
                  <p className="text-sm text-stone-600">
                    Friction, audit trail, refill plan.
                  </p>
                </div>
                <KeyRound className="size-5 text-amber-700" aria-hidden="true" />
              </div>

              <div className="grid gap-3">
                <label className="text-sm font-medium text-stone-700">
                  Protected bucket
                  <select
                    className="mt-2 h-11 w-full rounded-[8px] border border-stone-300 bg-white px-3 text-stone-950 outline-none focus:border-teal-700"
                    value={unlockBucket}
                    onChange={(event) =>
                      setUnlockBucket(event.target.value as BucketId)
                    }
                  >
                    {plan.allocations.map((bucket) => (
                      <option key={bucket.id} value={bucket.id}>
                        {bucket.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm font-medium text-stone-700">
                  Unlock amount
                  <input
                    aria-label="Emergency unlock amount"
                    className="mt-2 h-11 w-full rounded-[8px] border border-stone-300 bg-white px-3 text-stone-950 outline-none focus:border-teal-700"
                    inputMode="numeric"
                    max={2000}
                    min={25}
                    step={25}
                    type="number"
                    value={unlockAmount}
                    onInput={(event) =>
                      setUnlockAmount(
                        clamp(
                          toNumber(event.currentTarget.value, unlockAmount),
                          25,
                          2000,
                        ),
                      )
                    }
                    onChange={(event) =>
                      setUnlockAmount(
                        clamp(
                          toNumber(event.target.value, unlockAmount),
                          25,
                          2000,
                        ),
                      )
                    }
                  />
                </label>

                <div
                  aria-label="Unlock speed"
                  className="grid grid-cols-2 gap-2 rounded-[8px] bg-stone-100 p-1"
                  role="group"
                >
                  <button
                    className={`rounded-[8px] px-3 py-2 text-sm font-semibold ${
                      unlockMode === "slow"
                        ? "bg-white text-stone-950 shadow-sm"
                        : "text-stone-600"
                    }`}
                    type="button"
                    onClick={() => setUnlockMode("slow")}
                  >
                    Free, 24h
                  </button>
                  <button
                    className={`inline-flex items-center justify-center gap-2 rounded-[8px] px-3 py-2 text-sm font-semibold ${
                      unlockMode === "instant"
                        ? "bg-white text-stone-950 shadow-sm"
                        : "text-stone-600"
                    }`}
                    type="button"
                    onClick={() => setUnlockMode("instant")}
                  >
                    <Zap className="size-4" aria-hidden="true" />
                    Instant
                  </button>
                </div>
              </div>

              <div className="mt-4 rounded-[8px] border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle
                    className="mt-0.5 size-5 text-amber-700"
                    aria-hidden="true"
                  />
                  <p className="text-sm leading-6 text-stone-800">
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
    <div className="rounded-[8px] border border-stone-200 bg-stone-50 p-2">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-stone-500">
        {label}
      </p>
      <p
        className={`mt-1 text-sm font-semibold ${
          warning ? "text-amber-800" : "text-stone-950"
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
    <div className="rounded-[8px] border border-stone-200 bg-stone-50 p-3">
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
              <p className="font-semibold text-stone-950">{bucket.name}</p>
              <span className="rounded-[8px] bg-white px-2 py-1 text-xs font-semibold text-stone-600">
                {bucket.protection}
              </span>
            </div>
            <p className="mt-1 text-sm leading-6 text-stone-600">
              {bucket.rail} - Due {bucket.due}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            aria-label={`Decrease ${bucket.name} target`}
            className="grid size-9 place-items-center rounded-[8px] border border-stone-300 bg-white text-lg font-semibold hover:border-stone-500"
            type="button"
            onClick={() => onChange(bucket.target - 25)}
          >
            -
          </button>
          <label className="sr-only" htmlFor={`${bucket.id}-amount`}>
            {bucket.name} target amount
          </label>
          <input
            className="h-9 w-24 rounded-[8px] border border-stone-300 bg-white px-2 text-right text-sm font-semibold outline-none focus:border-teal-700"
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
            className="grid size-9 place-items-center rounded-[8px] border border-stone-300 bg-white text-lg font-semibold hover:border-stone-500"
            type="button"
            onClick={() => onChange(bucket.target + 25)}
          >
            +
          </button>
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-2 flex items-center justify-between gap-3 text-sm">
          <span className="font-medium text-stone-600">
            Funded {formatMoney(bucket.funded)} of {formatMoney(bucket.target)}
          </span>
          {bucket.short > 0 ? (
            <span className="font-semibold text-red-700">
              Short {formatMoney(bucket.short)}
            </span>
          ) : (
            <span className="font-semibold text-emerald-700">Covered</span>
          )}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white">
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
