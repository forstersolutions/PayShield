"use client";

import {
  ArrowRight,
  Check,
  CircleDollarSign,
  Loader2,
  LockOpen,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  completeActionAttempt,
  idempotencyKeyForAction,
} from "@/app/lib/client-action-idempotency";
import type { ActionAttemptRef } from "@/app/lib/client-action-idempotency";
import type {
  BucketBalance,
  BucketId,
  UnlockMode,
} from "@/app/lib/neobank/types.ts";

type UnlockResponse = {
  error?: string;
  message?: string;
  result?: {
    recoveryChecks?: number;
    recoveryPerCheckCents?: number;
    unlockedCents?: number;
  };
};
type RequestState = {
  message: string;
  status: "idle" | "loading" | "ready" | "error";
};

function dollarsToCents(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0;
}

function formatMoney(cents: number, digits = 0) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
    style: "currency",
  }).format(cents / 100);
}

export function UnlockControlPanel({ buckets }: { buckets: BucketBalance[] }) {
  const protectedBuckets = useMemo(
    () => buckets.filter((bucket) => bucket.id !== "safe_spending"),
    [buckets],
  );
  const [bucketId, setBucketId] = useState<BucketId | "">(
    protectedBuckets[0]?.id ?? "",
  );
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<UnlockMode>("slow_free");
  const [reason, setReason] = useState("");
  const [response, setResponse] = useState<UnlockResponse | null>(null);
  const [requestState, setRequestState] = useState<RequestState>({
    message: "",
    status: "idle",
  });
  const unlockAttempt = useRef<ActionAttemptRef["current"]>(null);
  const selectedBucket = protectedBuckets.find((bucket) => bucket.id === bucketId);
  const amountCents = dollarsToCents(amount);
  const remainingCents = Math.max(
    0,
    (selectedBucket?.availableCents ?? 0) - amountCents,
  );
  const recoveryChecks = mode === "instant_fixed_fee" ? 1 : 2;
  const recoveryPerCheckCents = Math.ceil(amountCents / recoveryChecks);
  const valid = Boolean(
    selectedBucket &&
      reason.trim() &&
      amountCents > 0 &&
      amountCents <= selectedBucket.availableCents,
  );

  async function unlockFunds() {
    if (!valid || !selectedBucket) {
      return;
    }

    setRequestState({ message: "Moving protected money...", status: "loading" });
    setResponse(null);
    const intent = {
      amountCents,
      bucketId: selectedBucket.id,
      mode,
      reason: reason.trim(),
    };
    const idempotencyKey = idempotencyKeyForAction(
      unlockAttempt,
      "unlock",
      intent,
    );

    try {
      const result = await fetch("/api/app/unlocks", {
        body: JSON.stringify({
          ...intent,
          idempotencyKey,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await result.json().catch(() => ({}))) as UnlockResponse;
      setResponse(payload);

      if (!result.ok || !payload.result) {
        setRequestState({
          message: payload.error ?? "Protected money could not be moved.",
          status: "error",
        });
        return;
      }

      setRequestState({
        message: payload.message ?? "Protected money moved to Safe to Spend.",
        status: "ready",
      });
      completeActionAttempt(unlockAttempt, idempotencyKey);
    } catch {
      setRequestState({
        message: "Protected money could not be moved. Nothing was changed.",
        status: "error",
      });
    }
  }

  return (
    <section className="pay-unlock-tool" id="unlock-controls">
      <div className="pay-unlock-form-pane">
        <div className="pay-tool-heading">
          <div>
            <p className="pay-eyebrow">Emergency access</p>
            <h2>Move protected money carefully</h2>
          </div>
          <LockOpen className="size-5" />
        </div>

        <div className="pay-compact-form">
          <label>
            From bucket
            <select onChange={(event) => setBucketId(event.target.value as BucketId)} value={bucketId}>
              {protectedBuckets.map((bucket) => (
                <option key={bucket.id} value={bucket.id}>{bucket.name} · {formatMoney(bucket.availableCents)} available</option>
              ))}
            </select>
          </label>
          <label>
            Amount
            <span className="pay-money-input"><CircleDollarSign className="size-4" /><input inputMode="decimal" min="1" onChange={(event) => setAmount(event.target.value)} type="number" value={amount} /></span>
          </label>
          <label>
            Why do you need it?
            <input maxLength={140} onChange={(event) => setReason(event.target.value)} placeholder="Emergency repair, medical expense..." value={reason} />
          </label>
        </div>

        <fieldset className="pay-recovery-choice">
          <legend>Put it back over</legend>
          <button data-selected={mode === "slow_free"} onClick={() => setMode("slow_free")} type="button">
            <strong>2 paychecks</strong><small>{formatMoney(Math.ceil(amountCents / 2))} each</small>
          </button>
          <button data-selected={mode === "instant_fixed_fee"} onClick={() => setMode("instant_fixed_fee")} type="button">
            <strong>Next paycheck</strong><small>{formatMoney(amountCents)} once</small>
          </button>
        </fieldset>
      </div>

      <div className="pay-unlock-review-pane">
        <div className="pay-tool-heading">
          <div>
            <p className="pay-eyebrow">Before you move it</p>
            <h2>Review the impact</h2>
          </div>
          <RotateCcw className="size-5" />
        </div>

        <div className="pay-unlock-amount">
          <small>Moving to Safe to Spend</small>
          <strong>{formatMoney(amountCents, 2)}</strong>
        </div>
        <dl className="pay-unlock-summary">
          <div><dt>From</dt><dd>{selectedBucket?.name ?? "Choose bucket"}</dd></div>
          <div><dt>Bucket left</dt><dd>{formatMoney(remainingCents, 2)}</dd></div>
          <div><dt>Recovery</dt><dd>{formatMoney(recoveryPerCheckCents, 2)} × {recoveryChecks}</dd></div>
        </dl>

        <div className="pay-editor-note" data-warning={!valid}>
          {valid ? <Check className="size-4" /> : <ShieldAlert className="size-4" />}
          <span>{valid ? "The full amount is available and the recovery plan is clear." : "Choose an available amount and add a reason before continuing."}</span>
        </div>

        <button className="pay-primary-button" disabled={!valid || requestState.status === "loading"} onClick={() => void unlockFunds()} type="button">
          {requestState.status === "loading" ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
          Move to Safe to Spend
        </button>

        {requestState.message ? <p className="pay-inline-state" data-error={requestState.status === "error"} role={requestState.status === "error" ? "alert" : "status"}>{requestState.message}</p> : null}
        {response?.result ? (
          <div className="pay-unlock-success">
            <Check className="size-4" />
            <span><strong>{formatMoney(response.result.unlockedCents ?? 0)} available now</strong><small>{formatMoney(response.result.recoveryPerCheckCents ?? 0)} from each of the next {response.result.recoveryChecks ?? 0} paycheck{response.result.recoveryChecks === 1 ? "" : "s"}</small></span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
