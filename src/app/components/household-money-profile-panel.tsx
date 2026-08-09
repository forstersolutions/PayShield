"use client";

import {
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Landmark,
  Loader2,
  Save,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BucketBalance, BucketId, Payee } from "@/app/lib/neobank/types.ts";

type ProfileState = {
  employerName: string;
  expectedFrequency: "weekly" | "biweekly" | "semimonthly" | "monthly" | "unknown";
  nextPayday: string;
  paycheckAmount: string;
  requestedTransfer: string;
};

type ActionState =
  | { status: "idle"; message: string }
  | { status: "loading"; message: string }
  | { status: "ready"; message: string }
  | { status: "error"; message: string };

type FundingScheduleItem = {
  amountCents: number;
  bucketId?: string | null;
  due: string;
  key: string;
  label: string;
  protection: string;
  sequence: number;
  shortCents: number;
  status: string;
  targetCents: number;
  type: "protected_bucket" | "safe_to_spend";
};

type ControlPlanResponse = {
  allocation?: {
    buckets?: Array<{
      bucketId: string;
      due: string;
      name: string;
      projectedFundingCents: number;
      shortCents: number;
      targetCents: number;
    }>;
    projectedProtectedCents?: number;
    projectedSafeToSpendCents?: number;
    shortfallCents?: number;
  };
  errors?: string[];
  fundingSchedule?: FundingScheduleItem[];
  monetization?: {
    paymentCollectionReady?: boolean;
    priceLabel?: string;
    status?: string;
  };
  nextAction?: {
    key?: string;
    title?: string;
    userAction?: string;
  };
  summary?: {
    approvedPayeeCount?: number;
    paycheckAmountCents?: number;
    projectedProtectedCents?: number;
    projectedSafeToSpendCents?: number;
    protectedTargetCents?: number;
    readyStepCount?: number;
    shortfallCents?: number;
    totalStepCount?: number;
  };
  transferPlan?: {
    allowedNow?: boolean;
    destinationPayeeName?: string | null;
    maxTransferCents?: number;
    requestedTransferCents?: number;
    sourceBucketName?: string | null;
  };
};

type MoneyProfileResponse = {
  controlPlan?: ControlPlanResponse;
  error?: string;
  errors?: string[];
  persisted?: boolean;
  profile?: {
    employerName?: string;
    expectedFrequency?: string;
    nextPayday?: string | null;
    paycheckAmountCents?: number;
    requestedTransferCents?: number;
  };
};

type CachedControlPlan = {
  key: string;
  response: ControlPlanResponse;
};

const frequencyLabels: Record<ProfileState["expectedFrequency"], string> = {
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
  semimonthly: "Twice a month",
  unknown: "Not sure",
  weekly: "Weekly",
};

function centsFromDollars(value: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.round(parsed * 100));
}

function dollarsFromCents(cents: number | undefined, fallback: string) {
  return Number.isInteger(cents) ? String(Math.round(Number(cents) / 100)) : fallback;
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}

function profileRequestPayload(
  profile: ProfileState,
  paycheckAmountCents: number,
  requestedTransferCents: number,
  releaseBucketId: string | null,
  releasePayeeId: string | null,
) {
  const keyParts = [
    profile.employerName,
    profile.expectedFrequency,
    profile.nextPayday,
    paycheckAmountCents,
    requestedTransferCents,
    releaseBucketId,
    releasePayeeId,
  ]
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);

  return {
    employerName: profile.employerName,
    expectedFrequency: profile.expectedFrequency,
    idempotencyKey: `ui-money-profile-${keyParts || "household"}`,
    nextPayday: profile.nextPayday,
    paycheckAmountCents,
    preferredPayeeId: releasePayeeId,
    preferredTransferBucketId: releaseBucketId,
    requestedTransferCents,
  };
}

function defaultNextPayday() {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return date.toISOString().slice(0, 10);
}

function readProfileDraft(): ProfileState {
  return {
    employerName: "",
    expectedFrequency: "biweekly",
    nextPayday: defaultNextPayday(),
    paycheckAmount: "",
    requestedTransfer: "",
  };
}

function firstApprovedPayeeForBucket(payees: Payee[], bucketId: BucketId | null) {
  return payees.find(
    (payee) =>
      payee.status === "approved" && bucketId && payee.allowedBucketId === bucketId,
  );
}

function selectedReleaseBucket(buckets: BucketBalance[], payees: Payee[]) {
  const protectedBuckets = buckets
    .filter((bucket) => bucket.id !== "safe_spending")
    .sort((left, right) => left.priority - right.priority);

  return (
    protectedBuckets.find(
      (bucket) =>
        bucket.availableCents > 0 &&
        firstApprovedPayeeForBucket(payees, bucket.id),
    ) ??
    protectedBuckets[0] ??
    null
  );
}

function localAllocation(buckets: BucketBalance[], paycheckAmountCents: number) {
  let remaining = paycheckAmountCents;
  const rows = buckets
    .filter((bucket) => bucket.id !== "safe_spending")
    .sort((left, right) => left.priority - right.priority)
    .map((bucket) => {
      const projectedFundingCents = Math.min(
        Math.max(0, remaining),
        Math.max(0, bucket.targetCents),
      );

      remaining -= projectedFundingCents;

      return {
        bucket,
        projectedFundingCents,
        shortCents: Math.max(0, bucket.targetCents - projectedFundingCents),
      };
    });

  return {
    projectedProtectedCents: rows.reduce(
      (sum, row) => sum + row.projectedFundingCents,
      0,
    ),
    projectedSafeToSpendCents: Math.max(0, remaining),
    rows,
    shortfallCents: rows.reduce((sum, row) => sum + row.shortCents, 0),
  };
}

function localFundingSchedule(allocation: ReturnType<typeof localAllocation>) {
  const protectedSchedule = allocation.rows.map((row, index): FundingScheduleItem => {
    const status =
      row.projectedFundingCents >= row.bucket.targetCents
        ? "funded"
        : row.projectedFundingCents > 0
          ? "partial"
          : "waiting";

    return {
      amountCents: row.projectedFundingCents,
      bucketId: row.bucket.id,
      due: row.bucket.due,
      key: `bucket:${row.bucket.id}`,
      label: row.bucket.name,
      protection: row.bucket.protection,
      sequence: index + 1,
      shortCents: row.shortCents,
      status,
      targetCents: row.bucket.targetCents,
      type: "protected_bucket",
    };
  });

  return [
    ...protectedSchedule,
    {
      amountCents: allocation.projectedSafeToSpendCents,
      bucketId: "safe_spending",
      due: "Remainder",
      key: "safe_to_spend",
      label: "Safe to Spend",
      protection: "spendable",
      sequence: protectedSchedule.length + 1,
      shortCents: 0,
      status: "safe_to_spend",
      targetCents: 0,
      type: "safe_to_spend",
    } satisfies FundingScheduleItem,
  ];
}

function moneyPlanFingerprint(
  profile: ProfileState,
  buckets: BucketBalance[],
  payees: Payee[],
) {
  return JSON.stringify({
    buckets: buckets.map((bucket) => ({
      availableCents: bucket.availableCents,
      due: bucket.due,
      fundedCents: bucket.fundedCents,
      id: bucket.id,
      name: bucket.name,
      payeeId: bucket.payeeId ?? null,
      priority: bucket.priority,
      protection: bucket.protection,
      shortCents: bucket.shortCents,
      targetCents: bucket.targetCents,
    })),
    payees: payees.map((payee) => ({
      allowedBucketId: payee.allowedBucketId,
      id: payee.id,
      maxCents: payee.maxCents,
      name: payee.name,
      status: payee.status,
    })),
    profile,
  });
}

export function HouseholdMoneyProfilePanel({
  buckets,
  payees,
}: {
  buckets: BucketBalance[];
  payees: Payee[];
}) {
  const [profile, setProfile] = useState<ProfileState>(() => readProfileDraft());
  const [plan, setPlan] = useState<CachedControlPlan | null>(null);
  const [actionState, setActionState] = useState<ActionState>({
    message: "",
    status: "idle",
  });
  const latestPlanInputs = useRef({ buckets, payees });
  const paycheckAmountCents = centsFromDollars(profile.paycheckAmount);
  const requestedTransferCents = centsFromDollars(profile.requestedTransfer);
  const releaseBucket = useMemo(
    () => selectedReleaseBucket(buckets, payees),
    [buckets, payees],
  );
  const releasePayee = firstApprovedPayeeForBucket(payees, releaseBucket?.id ?? null);
  const allocation = useMemo(
    () => localAllocation(buckets, paycheckAmountCents),
    [buckets, paycheckAmountCents],
  );
  const planKey = useMemo(
    () => moneyPlanFingerprint(profile, buckets, payees),
    [buckets, payees, profile],
  );
  const activePlan = plan?.key === planKey ? plan.response : null;
  const fundingSchedule = useMemo(() => {
    return activePlan?.fundingSchedule?.length
      ? activePlan.fundingSchedule
      : localFundingSchedule(allocation);
  }, [activePlan, allocation]);
  const protectedTargetCents = buckets
    .filter((bucket) => bucket.id !== "safe_spending")
    .reduce((sum, bucket) => sum + bucket.targetCents, 0);
  const coveragePercent = paycheckAmountCents
    ? Math.min(
        100,
        Math.round((allocation.projectedProtectedCents / paycheckAmountCents) * 100),
      )
    : 0;
  const planSafeCents =
    activePlan?.summary?.projectedSafeToSpendCents ??
    activePlan?.allocation?.projectedSafeToSpendCents ??
    allocation.projectedSafeToSpendCents;
  const planProtectedCents =
    activePlan?.summary?.projectedProtectedCents ??
    activePlan?.allocation?.projectedProtectedCents ??
    allocation.projectedProtectedCents;

  useEffect(() => {
    latestPlanInputs.current = { buckets, payees };
  }, [buckets, payees]);

  useEffect(() => {
    let cancelled = false;

    async function loadSavedProfile() {
      try {
        const response = await fetch("/api/app/money-profile", {
          cache: "no-store",
          headers: { accept: "application/json" },
          method: "GET",
        });
        const payload = (await response.json().catch(() => ({}))) as
          MoneyProfileResponse;
        const saved = payload.profile;

        if (!response.ok || !saved || cancelled) {
          return;
        }

        let loadedProfile: ProfileState | null = null;

        setProfile((current) => {
          const frequency = String(
            saved.expectedFrequency ?? current.expectedFrequency,
          );

          loadedProfile = {
            employerName: saved.employerName || current.employerName,
            expectedFrequency:
              frequency in frequencyLabels
                ? (frequency as ProfileState["expectedFrequency"])
                : current.expectedFrequency,
            nextPayday: saved.nextPayday || current.nextPayday,
            paycheckAmount: dollarsFromCents(
              saved.paycheckAmountCents,
              current.paycheckAmount,
            ),
            requestedTransfer: dollarsFromCents(
              saved.requestedTransferCents,
              current.requestedTransfer,
            ),
          };

          return loadedProfile;
        });

        if (payload.controlPlan && loadedProfile) {
          const latest = latestPlanInputs.current;

          setPlan({
            key: moneyPlanFingerprint(
              loadedProfile,
              latest.buckets,
              latest.payees,
            ),
            response: payload.controlPlan,
          });
        }
      } catch {
        // The local profile remains usable when the network request fails.
      }
    }

    void loadSavedProfile();

    return () => {
      cancelled = true;
    };
  }, []);

  function patchProfile(patch: Partial<ProfileState>) {
    setProfile((current) => ({ ...current, ...patch }));
    setActionState({ message: "", status: "idle" });
  }

  async function generatePlan() {
    setActionState({
      message: "Saving your paycheck plan...",
      status: "loading",
    });

    try {
      const saveResponse = await fetch("/api/app/money-profile", {
        body: JSON.stringify(
          profileRequestPayload(
            profile,
            paycheckAmountCents,
            requestedTransferCents,
            releaseBucket?.id ?? null,
            releasePayee?.id ?? null,
          ),
        ),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const savePayload = (await saveResponse.json().catch(() => ({}))) as
        MoneyProfileResponse;
      if (!saveResponse.ok) {
        setActionState({
          message:
            savePayload.error ??
            savePayload.errors?.[0] ??
            "Your paycheck plan could not be saved. Review the details and try again.",
          status: "error",
        });
        return;
      }

      const profileSaved = savePayload.persisted === true;
      const response = await fetch("/api/app/control-plan", {
        body: JSON.stringify({
          buckets,
          employerName: profile.employerName,
          expectedFrequency: profile.expectedFrequency,
          nextPayday: profile.nextPayday,
          paycheckAmountCents,
          payees,
          preferredPayeeId: releasePayee?.id ?? null,
          preferredTransferBucketId: releaseBucket?.id ?? null,
          requestedTransferCents,
          ruleName: `${profile.employerName || "Primary"} paycheck`,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as
        ControlPlanResponse;

      if (!response.ok || payload.errors?.length) {
        setActionState({
          message:
            "Your paycheck plan could not be saved. Review the amounts and try again.",
          status: "error",
        });
        return;
      }

      setPlan({
        key: planKey,
        response: payload,
      });
      setActionState({
        message:
          profileSaved
            ? "Your paycheck plan is saved."
            : "Your paycheck preview is ready for this session.",
        status: "ready",
      });
    } catch {
      setActionState({
        message: "Your paycheck plan could not be saved. Nothing was changed.",
        status: "error",
      });
    }
  }

  return (
    <section className="paycheck-plan-panel" id="money-profile">
      <div className="paycheck-plan-heading">
        <div>
          <p className="pay-eyebrow">Your paycheck details</p>
          <h2>Preview where the next check will go.</h2>
          <p>Update the amount or timing whenever your pay changes.</p>
        </div>
        <div className="paycheck-safe-preview">
          <WalletCards className="size-5" aria-hidden="true" />
          <span><small>Projected Safe to Spend</small><strong>{formatMoney(planSafeCents)}</strong></span>
        </div>
      </div>

      <div className="paycheck-plan-grid">
        <div className="paycheck-detail-form">
          <label>
            Take-home amount
            <span><CircleDollarSign className="size-4" /><input inputMode="decimal" min="100" onChange={(event) => patchProfile({ paycheckAmount: event.target.value })} type="number" value={profile.paycheckAmount} /></span>
          </label>
          <label>
            Pay frequency
            <select onChange={(event) => patchProfile({ expectedFrequency: event.target.value as ProfileState["expectedFrequency"] })} value={profile.expectedFrequency}>
              {Object.entries(frequencyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            Employer or statement label
            <span><Landmark className="size-4" /><input maxLength={80} onChange={(event) => patchProfile({ employerName: event.target.value })} value={profile.employerName} /></span>
          </label>
          <label>
            Next payday
            <span><CalendarDays className="size-4" /><input onChange={(event) => patchProfile({ nextPayday: event.target.value })} type="date" value={profile.nextPayday} /></span>
          </label>

          <div className="paycheck-plan-summary">
            <div><ShieldCheck className="size-4" /><span><small>Protected</small><strong>{formatMoney(planProtectedCents)}</strong></span></div>
            <div><WalletCards className="size-4" /><span><small>Safe to Spend</small><strong>{formatMoney(planSafeCents)}</strong></span></div>
          </div>
          <div className="paycheck-coverage"><span style={{ width: `${coveragePercent}%` }} /></div>

          {allocation.shortfallCents > 0 ? (
            <p className="paycheck-plan-alert" data-tone="warning">
              This paycheck is {formatMoney(allocation.shortfallCents)} short of every target. Lower priorities will wait.
            </p>
          ) : (
            <p className="paycheck-plan-alert" data-tone="ready">
              <CheckCircle2 className="size-4" /> Every protected target fits this paycheck.
            </p>
          )}

          <button className="paycheck-save-button" disabled={actionState.status === "loading" || paycheckAmountCents < 10_000} onClick={() => void generatePlan()} type="button">
            {actionState.status === "loading" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save paycheck plan
          </button>
          {actionState.message ? <p className="paycheck-action-message" data-state={actionState.status}>{actionState.message}</p> : null}
        </div>

        <div className="paycheck-order-panel">
          <div className="money-panel-heading">
            <div>
              <p className="pay-eyebrow">Next paycheck order</p>
              <h2>Protected first. Safe to Spend last.</h2>
            </div>
            <span className="paycheck-target-total">{formatMoney(protectedTargetCents)} planned</span>
          </div>
          <div className="paycheck-order-list">
            {fundingSchedule.map((item) => (
              <div data-safe={item.type === "safe_to_spend"} key={item.key}>
                <span>{item.type === "safe_to_spend" ? <WalletCards className="size-4" /> : item.sequence}</span>
                <p><strong>{item.label}</strong><small>{item.shortCents > 0 ? `Short ${formatMoney(item.shortCents)}` : item.due}</small></p>
                <strong>{formatMoney(item.amountCents)}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
