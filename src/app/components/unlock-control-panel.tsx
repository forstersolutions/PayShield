"use client";

import {
  CheckCircle2,
  CircleDollarSign,
  LockOpen,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { useMemo, useState } from "react";
import type {
  BucketBalance,
  BucketId,
  UnlockMode,
} from "@/app/lib/neobank/types.ts";

type UnlockResponse = {
  error?: string;
  message?: string;
  mode?: string;
  result?: {
    recoveryChecks?: number;
    recoveryPerCheckCents?: number;
    unlockedCents?: number;
  };
};

type SaveState =
  | { status: "idle"; message: string }
  | { status: "creating"; message: string }
  | { status: "created"; message: string }
  | { status: "error"; message: string };

function dollarsToCents(value: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.round(parsed * 100));
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}

export function UnlockControlPanel({
  buckets,
}: {
  buckets: BucketBalance[];
}) {
  const protectedBuckets = useMemo(
    () => buckets.filter((bucket) => bucket.id !== "safe_spending"),
    [buckets],
  );
  const [amount, setAmount] = useState("200");
  const [bucketId, setBucketId] = useState<BucketId | "">(
    protectedBuckets[0]?.id ?? "",
  );
  const [mode, setMode] = useState<UnlockMode>("slow_free");
  const [reason, setReason] = useState("Emergency repair");
  const [result, setResult] = useState<UnlockResponse | null>(null);
  const [state, setState] = useState<SaveState>({
    message: "",
    status: "idle",
  });
  const selectedBucket = protectedBuckets.find((bucket) => bucket.id === bucketId);
  const amountCents = dollarsToCents(amount);
  const canUnlock = Boolean(
    selectedBucket && amountCents > 0 && amountCents <= selectedBucket.availableCents,
  );

  async function createUnlockPlan() {
    setState({
      message: "Creating recovery plan...",
      status: "creating",
    });
    setResult(null);

    try {
      const response = await fetch("/api/app/unlocks", {
        body: JSON.stringify({
          amountCents,
          bucketId,
          idempotencyKey: `ui-unlock-${crypto.randomUUID()}`,
          mode,
          reason,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as
        UnlockResponse;

      setResult(payload);

      if (!response.ok || !payload.result) {
        setState({
          message: payload.error ?? "Unlock plan could not be created.",
          status: "error",
        });
        return;
      }

      setState({
        message:
          payload.message ??
          `Recovery plan created for ${formatMoney(payload.result.unlockedCents ?? 0)}.`,
        status: "created",
      });
    } catch {
      setState({
        message: "Network error. Recovery plan was not created.",
        status: "error",
      });
    }
  }

  return (
    <section
      className="relative z-10 border-b border-white/10 bg-[#090b0d]"
      id="unlock-controls"
    >
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.86fr_1.14fr] lg:px-8">
        <div className="accent-rule pt-5">
          <p className="inline-flex items-center gap-2 rounded-[8px] border border-[#ffb237]/30 bg-[#ffb237]/10 px-3 py-2 text-sm font-black text-[#ffe4ad]">
            <LockOpen className="size-4" aria-hidden="true" />
            Recovery unlock
          </p>
          <h2 className="mt-4 text-3xl font-black leading-tight text-white sm:text-4xl">
            Emergency access needs a recovery path.
          </h2>
          <p className="mt-4 text-lg leading-8 text-[#c9d0da]">
            Protected money can be modeled for a controlled unlock with an
            automatic per-check recovery plan, so shortfalls are visible before
            the household commits.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="brand-panel-soft rounded-[8px] p-4">
              <p className="brand-kicker">Selected bucket</p>
              <p className="mt-2 text-2xl font-black text-white">
                {selectedBucket?.name ?? "No bucket"}
              </p>
              <p className="mt-2 text-sm leading-6 text-[#aab3c2]">
                {selectedBucket
                  ? `${formatMoney(selectedBucket.availableCents)} available`
                  : "$0 available"}
              </p>
            </div>
            <div
              className={`rounded-[8px] border p-4 ${
                canUnlock
                  ? "border-[#39e8ff]/25 bg-[#39e8ff]/10"
                  : "border-[#ff8a7a]/35 bg-[#ff8a7a]/10"
              }`}
            >
              <p className="brand-kicker">Shortfall warning</p>
              <p className="mt-2 text-lg font-black text-white">
                {canUnlock ? "Plan can be created" : "Adjust amount"}
              </p>
              <p className="mt-2 text-sm leading-6 text-[#aab3c2]">
                Unlocks cannot exceed the selected protected bucket balance.
              </p>
            </div>
          </div>
        </div>

        <div className="brand-panel rounded-[8px] p-4">
          <div className="grid gap-4 md:grid-cols-[1fr_0.82fr]">
            <div className="grid gap-3">
              <label className="grid gap-2 text-sm font-black text-white">
                Bucket
                <select
                  className="h-11 rounded-[8px] border border-white/10 bg-black/45 px-3 text-sm font-bold text-white outline-none transition focus:border-[#39e8ff]"
                  onChange={(event) =>
                    setBucketId(event.target.value as BucketId)
                  }
                  value={bucketId}
                >
                  {protectedBuckets.map((bucket) => (
                    <option key={bucket.id} value={bucket.id}>
                      {bucket.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-black text-white">
                  Amount
                  <span className="relative">
                    <CircleDollarSign
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#39e8ff]"
                      aria-hidden="true"
                    />
                    <input
                      className="h-11 w-full rounded-[8px] border border-white/10 bg-black/45 pl-10 pr-3 text-sm font-bold text-white outline-none transition focus:border-[#39e8ff]"
                      inputMode="decimal"
                      min="0"
                      onChange={(event) => setAmount(event.target.value)}
                      type="number"
                      value={amount}
                    />
                  </span>
                </label>
                <label className="grid gap-2 text-sm font-black text-white">
                  Mode
                  <select
                    className="h-11 rounded-[8px] border border-white/10 bg-black/45 px-3 text-sm font-bold text-white outline-none transition focus:border-[#39e8ff]"
                    onChange={(event) => setMode(event.target.value as UnlockMode)}
                    value={mode}
                  >
                    <option value="slow_free">Slow/free</option>
                    <option value="instant_fixed_fee">Instant review</option>
                  </select>
                </label>
              </div>

              <label className="grid gap-2 text-sm font-black text-white">
                Reason
                <input
                  className="h-11 rounded-[8px] border border-white/10 bg-black/45 px-3 text-sm font-bold text-white outline-none transition focus:border-[#39e8ff]"
                  maxLength={120}
                  onChange={(event) => setReason(event.target.value)}
                  value={reason}
                />
              </label>

              <button
                className="brand-button-blue inline-flex h-11 items-center justify-center gap-2 rounded-[8px] px-4 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50"
                disabled={
                  !canUnlock ||
                  !reason.trim() ||
                  state.status === "creating"
                }
                onClick={createUnlockPlan}
                type="button"
              >
                <RotateCcw className="size-4" aria-hidden="true" />
                Create recovery plan
              </button>
            </div>

            <div className="grid content-start gap-3">
              <div
                className={`rounded-[8px] border p-4 ${
                  state.status === "created"
                    ? "border-[#39e8ff]/25 bg-[#39e8ff]/10"
                    : state.status === "error"
                      ? "border-[#ff8a7a]/35 bg-[#ff8a7a]/10"
                      : "border-white/10 bg-black/40"
                }`}
              >
                <div className="flex items-start gap-3">
                  {state.status === "created" ? (
                    <CheckCircle2
                      className="mt-0.5 size-5 shrink-0 text-[#39e8ff]"
                      aria-hidden="true"
                    />
                  ) : (
                    <ShieldAlert
                      className="mt-0.5 size-5 shrink-0 text-[#ffcf72]"
                      aria-hidden="true"
                    />
                  )}
                  <div>
                    <p className="text-sm font-black text-white">
                      {state.status === "created"
                        ? "Recovery plan ready"
                        : "Unlock guardrail"}
                    </p>
                    <p
                      aria-live={
                        state.status === "error" ? "assertive" : "polite"
                      }
                      className="mt-1 text-sm leading-6 text-[#c9d0da]"
                      role={state.status === "error" ? "alert" : "status"}
                    >
                      {state.message ||
                        "Create a plan before protected money is released."}
                    </p>
                  </div>
                </div>
              </div>

              {result?.result ? (
                <div className="rounded-[8px] border border-white/10 bg-black/40 p-4">
                  <p className="brand-kicker">Recovery schedule</p>
                  <p className="mt-2 text-sm font-black text-white">
                    {formatMoney(result.result.recoveryPerCheckCents ?? 0)} per
                    check for {result.result.recoveryChecks ?? 0} checks
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#aab3c2]">
                    Unlocked: {formatMoney(result.result.unlockedCents ?? 0)}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
