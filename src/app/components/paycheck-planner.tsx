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
  const heroSignals = [
    {
      body: "Bills and goals funded first",
      icon: ShieldCheck,
      label: "Protected this check",
      value: formatMoney(plan.protectedFunded),
    },
    {
      body: "The only card-visible balance",
      icon: WalletCards,
      label: "Card can access",
      value: formatMoney(plan.safeSpend),
    },
    {
      body: `${recoveryChecks} paycheck${recoveryChecks === 1 ? "" : "s"} to refill`,
      icon: KeyRound,
      label: "Recovery rule",
      value: `${formatMoney(recoveryAmount)}/check`,
    },
  ];
  const decisionSteps = [
    {
      body: `${formatMoney(plan.protectedFunded)} is reserved before spending opens.`,
      icon: Lock,
      title: "1. Bucket rules run",
    },
    {
      body: `${formatMoney(plan.safeSpend)} is visible to the spending-control simulation.`,
      icon: WalletCards,
      title: "2. Safe-spend check",
    },
    {
      body: `${merchant} ${cardApproved ? "stays inside" : "exceeds"} the spendable balance.`,
      icon: cardApproved ? CheckCircle2 : XCircle,
      title: cardApproved ? "3. Transaction approved" : "3. Transaction declined",
    },
  ];

  function updateBucketAmount(id: BucketId, nextAmount: number) {
    setBucketAmounts((current) => ({
      ...current,
      [id]: clamp(nextAmount, 0, 2000),
    }));
  }

  return (
    <section
      id="product"
      className="pay-hero-shell relative min-h-screen overflow-x-hidden border-b border-white/10 text-[#f7f2e7]"
    >
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#050706]/70 py-3 backdrop-blur">
          <a className="flex items-center gap-3" href="#product">
            <span className="grid size-10 place-items-center rounded-[8px] border border-emerald-200/40 bg-emerald-300 text-[#07110f] shadow-[0_0_34px_rgba(110,231,183,0.2)]">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-base font-semibold leading-5 text-[#f7f2e7]">
                PayShield
              </span>
              <span className="block text-xs font-medium uppercase leading-4 tracking-[0.18em] text-[#9c9588]">
                Protected paycheck OS
              </span>
            </span>
          </a>
          <nav
            aria-label="Primary"
            className="flex flex-wrap items-center gap-1 rounded-[8px] border border-white/10 bg-white/[0.035] p-1 text-sm font-medium text-[#d6cfbf]"
          >
            <a className="rounded-[8px] px-3 py-2 hover:bg-white/10" href="#rails">
              Rails
            </a>
            <a
              className="rounded-[8px] px-3 py-2 hover:bg-white/10"
              href="#pricing"
            >
              Pricing
            </a>
            <a
              className="rounded-[8px] px-3 py-2 hover:bg-white/10"
              href="#launch"
            >
              Launch
            </a>
            <a
              className="inline-flex items-center gap-2 rounded-[8px] bg-emerald-300 px-4 py-2 font-semibold text-[#07110f] hover:bg-emerald-200"
              href="#pilot"
            >
              Pilot
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </nav>
        </header>

        <div className="grid flex-1 items-center gap-6 py-8 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_430px]">
          <div className="min-w-0">
            <div className="mb-5 max-w-3xl">
              <p className="mb-3 inline-flex items-center gap-2 rounded-[8px] border border-emerald-300/25 bg-emerald-300/10 px-3 py-2 text-sm font-semibold text-emerald-100 shadow-[0_0_36px_rgba(16,185,129,0.12)]">
                <Lock className="size-4" aria-hidden="true" />
                Prototype-only controls - no live funds movement
              </p>
              <h1 className="text-4xl font-semibold leading-[1.03] text-[#f7f2e7] sm:text-5xl lg:text-6xl">
                PayShield
              </h1>
              <p className="mt-3 max-w-2xl text-lg leading-8 text-[#b9b2a3]">
                A protected-paycheck app concept designed to turn paychecks
                into bill buckets, goal reserves, and one honest safe-to-spend
                balance.
              </p>
            </div>

            <div className="mb-4 grid max-w-4xl gap-3 sm:grid-cols-3">
              {heroSignals.map((signal) => {
                const Icon = signal.icon;

                return (
                  <div
                    className="rounded-[8px] border border-white/10 bg-[#0b100d]/80 p-3 shadow-[0_18px_55px_rgba(0,0,0,0.24)]"
                    key={signal.label}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9c9588]">
                        {signal.label}
                      </p>
                      <Icon className="size-4 text-emerald-300" aria-hidden="true" />
                    </div>
                    <p className="mt-3 text-xl font-semibold text-[#f7f2e7]">
                      {signal.value}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[#b9b2a3]">
                      {signal.body}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="overflow-hidden rounded-[8px] border border-white/10 bg-[#0c120f]/95 shadow-[0_28px_110px_rgba(0,0,0,0.5)] ring-1 ring-emerald-300/10">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-white/[0.035] px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="size-2 rounded-full bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,0.7)]" />
                  <div>
                    <p className="text-sm font-semibold text-[#f7f2e7]">
                      Live paycheck model
                    </p>
                    <p className="text-xs leading-5 text-[#9c9588]">
                      Demo rules, real launch positioning
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#c8c0af]">
                  <span className="rounded-[8px] border border-white/10 bg-[#050706] px-2.5 py-1.5">
                    Demo funds
                  </span>
                  <span className="rounded-[8px] border border-emerald-300/25 bg-emerald-300/10 px-2.5 py-1.5 text-emerald-100">
                    Bill-first
                  </span>
                </div>
              </div>
              <div className="grid lg:grid-cols-[320px_minmax(0,1fr)]">
                <aside className="border-b border-white/10 bg-[#080b09] p-4 lg:border-b-0 lg:border-r">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#f7f2e7]">
                        Paycheck plan
                      </p>
                      <p className="text-sm text-[#9c9588]">
                        Biweekly deposit rules
                      </p>
                    </div>
                    <Landmark
                      className="size-5 text-emerald-300"
                      aria-hidden="true"
                    />
                  </div>

                  <label className="block text-sm font-medium text-[#d6cfbf]">
                    Deposit amount
                  </label>
                  <div className="mt-2 flex items-center rounded-[8px] border border-white/10 bg-[#070807] px-3">
                    <span className="text-[#9c9588]">$</span>
                    <input
                      aria-label="Paycheck deposit amount"
                      className="h-12 min-w-0 flex-1 bg-transparent px-2 text-xl font-semibold text-[#f4f1e8] outline-none"
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
                    className="mt-4 w-full accent-emerald-300"
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

                  <div className="mt-5 rounded-[8px] border border-white/10 bg-white/[0.03] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[#f4f1e8]">
                        Safe-spend share
                      </p>
                      <p className="text-sm font-semibold text-emerald-300">
                        {Math.round(safeSpendShare)}%
                      </p>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-emerald-300"
                        style={{ width: `${clamp(safeSpendShare, 0, 100)}%` }}
                      />
                    </div>
                  </div>
                </aside>

                <div className="min-w-0 p-4">
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#f7f2e7]">
                        Protected buckets
                      </p>
                      <p className="text-sm text-[#9c9588]">
                        Priority funding runs before card availability.
                      </p>
                    </div>
                    <span className="rounded-[8px] border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-sm font-semibold text-emerald-200">
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
            <div className="overflow-hidden rounded-[8px] border border-white/10 bg-[#0c120f]/95 shadow-[0_24px_90px_rgba(0,0,0,0.42)] ring-1 ring-white/5">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 p-4">
                <div>
                  <p className="text-sm font-semibold text-[#f7f2e7]">
                    Mobile product preview
                  </p>
                  <p className="text-sm text-[#9c9588]">
                    Safe-spend dashboard and card concept
                  </p>
                </div>
                <span className="rounded-[8px] border border-amber-300/25 bg-amber-300/10 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-100">
                  Prototype
                </span>
              </div>
              <Image
                alt="PayShield mobile dashboard and spending-control card concept"
                className="aspect-[16/11] w-full object-cover"
                height={1024}
                priority
                src="/images/payshield-product-mockup.avif"
                width={1536}
              />
              <div className="border-t border-white/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-[#f4f1e8]">
                    Spending authorization
                  </p>
                  <WalletCards
                    className="size-5 text-[#9c9588]"
                    aria-hidden="true"
                  />
                </div>

                <div className="mt-4 grid gap-3">
                  <label className="text-sm font-medium text-[#d6cfbf]">
                    Merchant
                    <select
                      className="mt-2 h-11 w-full rounded-[8px] border border-white/10 bg-[#070807] px-3 text-[#f4f1e8] outline-none focus:border-emerald-300"
                      value={merchant}
                      onChange={(event) => setMerchant(event.target.value)}
                    >
                      {merchants.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm font-medium text-[#d6cfbf]">
                    Purchase amount
                    <div className="mt-2 flex h-11 items-center rounded-[8px] border border-white/10 bg-[#070807] px-3">
                      <span className="text-[#9c9588]">$</span>
                      <input
                        aria-label="Card transaction amount"
                        className="min-w-0 flex-1 bg-transparent px-2 text-[#f4f1e8] outline-none"
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

                <div className="mt-4 grid gap-2">
                  {decisionSteps.map((step) => {
                    const Icon = step.icon;

                    return (
                      <div
                        className="flex items-start gap-3 rounded-[8px] border border-white/10 bg-[#070807] p-3"
                        key={step.title}
                      >
                        <Icon
                          className={`mt-0.5 size-4 shrink-0 ${
                            step.title.includes("declined")
                              ? "text-red-300"
                              : "text-emerald-300"
                          }`}
                          aria-hidden="true"
                        />
                        <div>
                          <p className="text-sm font-semibold text-[#f7f2e7]">
                            {step.title}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-[#b9b2a3]">
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
                      ? "border-emerald-300/30 bg-emerald-300/10"
                      : "border-red-300/30 bg-red-400/10"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {cardApproved ? (
                      <CheckCircle2
                        className="mt-0.5 size-5 text-emerald-300"
                        aria-hidden="true"
                      />
                    ) : (
                      <XCircle
                        className="mt-0.5 size-5 text-red-300"
                        aria-hidden="true"
                      />
                    )}
                    <div>
                      <p className="font-semibold text-[#f7f2e7]">
                        {cardApproved ? "Approved" : "Declined"} at {merchant}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-[#b9b2a3]">
                        The spending-control simulation can only see{" "}
                        {formatMoney(plan.safeSpend)} safe-spending funds.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[8px] border border-white/10 bg-[#0c120f]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)] ring-1 ring-amber-300/10">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#f7f2e7]">
                    Emergency unlock
                  </p>
                  <p className="text-sm text-[#9c9588]">
                    Friction, audit trail, refill plan.
                  </p>
                </div>
                <KeyRound className="size-5 text-amber-300" aria-hidden="true" />
              </div>

              <div className="grid gap-3">
                <label className="text-sm font-medium text-[#d6cfbf]">
                  Protected bucket
                  <select
                    className="mt-2 h-11 w-full rounded-[8px] border border-white/10 bg-[#070807] px-3 text-[#f4f1e8] outline-none focus:border-emerald-300"
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

                <label className="text-sm font-medium text-[#d6cfbf]">
                  Unlock amount
                  <input
                    aria-label="Emergency unlock amount"
                    className="mt-2 h-11 w-full rounded-[8px] border border-white/10 bg-[#070807] px-3 text-[#f4f1e8] outline-none focus:border-emerald-300"
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
                  className="grid grid-cols-2 gap-2 rounded-[8px] bg-[#070807] p-1"
                  role="group"
                >
                  <button
                    className={`rounded-[8px] px-3 py-2 text-sm font-semibold ${
                      unlockMode === "slow"
                        ? "bg-[#eaf8ee] text-[#07110f] shadow-sm"
                        : "text-[#b9b2a3]"
                    }`}
                    type="button"
                    onClick={() => setUnlockMode("slow")}
                  >
                    Free, 24h
                  </button>
                  <button
                    className={`inline-flex items-center justify-center gap-2 rounded-[8px] px-3 py-2 text-sm font-semibold ${
                      unlockMode === "instant"
                        ? "bg-[#eaf8ee] text-[#07110f] shadow-sm"
                        : "text-[#b9b2a3]"
                    }`}
                    type="button"
                    onClick={() => setUnlockMode("instant")}
                  >
                    <Zap className="size-4" aria-hidden="true" />
                    Instant
                  </button>
                </div>
              </div>

              <div className="mt-4 rounded-[8px] border border-amber-300/30 bg-amber-300/10 p-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle
                    className="mt-0.5 size-5 text-amber-300"
                    aria-hidden="true"
                  />
                  <p className="text-sm leading-6 text-[#e8e1d3]">
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
    <div className="rounded-[8px] border border-white/10 bg-white/[0.03] p-2">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#8d8679]">
        {label}
      </p>
      <p
        className={`mt-1 text-sm font-semibold ${
          warning ? "text-amber-300" : "text-[#f4f1e8]"
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
    <div className="rounded-[8px] border border-white/10 bg-white/[0.035] p-3">
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
              <p className="font-semibold text-[#f4f1e8]">{bucket.name}</p>
              <span className="rounded-[8px] border border-white/10 bg-[#070807] px-2 py-1 text-xs font-semibold text-[#b9b2a3]">
                {bucket.protection}
              </span>
            </div>
            <p className="mt-1 text-sm leading-6 text-[#9c9588]">
              {bucket.rail} - Due {bucket.due}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            aria-label={`Decrease ${bucket.name} target`}
            className="grid size-9 place-items-center rounded-[8px] border border-white/10 bg-[#070807] text-lg font-semibold text-[#f4f1e8] hover:border-emerald-300/60"
            type="button"
            onClick={() => onChange(bucket.target - 25)}
          >
            -
          </button>
          <label className="sr-only" htmlFor={`${bucket.id}-amount`}>
            {bucket.name} target amount
          </label>
          <input
            className="h-9 w-24 rounded-[8px] border border-white/10 bg-[#070807] px-2 text-right text-sm font-semibold text-[#f4f1e8] outline-none focus:border-emerald-300"
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
            className="grid size-9 place-items-center rounded-[8px] border border-white/10 bg-[#070807] text-lg font-semibold text-[#f4f1e8] hover:border-emerald-300/60"
            type="button"
            onClick={() => onChange(bucket.target + 25)}
          >
            +
          </button>
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-2 flex items-center justify-between gap-3 text-sm">
          <span className="font-medium text-[#b9b2a3]">
            Funded {formatMoney(bucket.funded)} of {formatMoney(bucket.target)}
          </span>
          {bucket.short > 0 ? (
            <span className="font-semibold text-red-300">
              Short {formatMoney(bucket.short)}
            </span>
          ) : (
            <span className="font-semibold text-emerald-300">Covered</span>
          )}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[#070807]">
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
