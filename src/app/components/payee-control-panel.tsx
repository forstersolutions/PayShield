"use client";

import {
  CheckCircle2,
  CircleDollarSign,
  Landmark,
  Plus,
  ShieldAlert,
  UserRoundCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { BucketBalance, BucketId, Payee } from "@/app/lib/neobank/types.ts";

type PayeeSaveState =
  | { status: "idle"; message: string }
  | { status: "saving"; message: string }
  | { status: "saved"; message: string }
  | { status: "drafted"; message: string }
  | { status: "error"; message: string };

type PayeeResponse = {
  error?: string;
  message?: string;
  payee?: Payee;
  persisted?: boolean;
};

const draftStorageKey = "payshield.payee-controls.draft.v1";

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}

function dollarsToCents(value: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.round(parsed * 100));
}

function payeeIdFor(name: string) {
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || "payee";

  return `payee_modeled_${slug}`;
}

function readDraftPayees() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(draftStorageKey);
    const parsed = stored ? JSON.parse(stored) : [];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (item): item is Payee =>
        item &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.allowedBucketId === "string" &&
        typeof item.maxCents === "number" &&
        ["approved", "modeled", "provider_pending"].includes(
          String(item.status),
        ),
    );
  } catch {
    return [];
  }
}

function mergePayees(basePayees: Payee[], draftPayees: Payee[]) {
  const byId = new Map<string, Payee>();

  for (const payee of basePayees) {
    byId.set(payee.id, payee);
  }

  for (const payee of draftPayees) {
    byId.set(payee.id, payee);
  }

  return [...byId.values()];
}

function statusLabel(status: Payee["status"]) {
  if (status === "approved") {
    return "Approved";
  }

  if (status === "provider_pending") {
    return "Provider pending";
  }

  return "Draft";
}

export function PayeeControlPanel({
  buckets,
  onPayeeSaved,
  payees,
}: {
  buckets: BucketBalance[];
  onPayeeSaved?: (payee: Payee) => void;
  payees: Payee[];
}) {
  const protectedBuckets = useMemo(
    () => buckets.filter((bucket) => bucket.id !== "safe_spending"),
    [buckets],
  );
  const [draftPayees, setDraftPayees] = useState<Payee[]>([]);
  const [name, setName] = useState("New landlord");
  const [allowedBucketId, setAllowedBucketId] = useState<BucketId>(
    protectedBuckets[0]?.id ?? "rent",
  );
  const [maxAmount, setMaxAmount] = useState("950");
  const [saveState, setSaveState] = useState<PayeeSaveState>({
    message: "",
    status: "idle",
  });
  const visiblePayees = useMemo(
    () => mergePayees(payees, draftPayees),
    [draftPayees, payees],
  );
  const approvedCount = visiblePayees.filter(
    (payee) => payee.status === "approved",
  ).length;
  const pendingCount = visiblePayees.filter(
    (payee) => payee.status !== "approved",
  ).length;
  const selectedBucket = protectedBuckets.find(
    (bucket) => bucket.id === allowedBucketId,
  );
  const maxCents = dollarsToCents(maxAmount);
  const formReady = Boolean(name.trim() && selectedBucket && maxCents > 0);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDraftPayees(readDraftPayees());
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  function persistDrafts(nextDrafts: Payee[]) {
    setDraftPayees(nextDrafts);

    if (nextDrafts.length) {
      window.localStorage.setItem(draftStorageKey, JSON.stringify(nextDrafts));
    } else {
      window.localStorage.removeItem(draftStorageKey);
    }
  }

  function rememberDraft(payee: Payee) {
    persistDrafts(mergePayees(draftPayees, [payee]));
    onPayeeSaved?.(payee);
  }

  async function savePayee() {
    if (!formReady) {
      return;
    }

    setSaveState({
      message: "Saving protected payee...",
      status: "saving",
    });

    const draftPayee: Payee = {
      allowedBucketId,
      id: payeeIdFor(name),
      maxCents,
      name: name.trim(),
      status: "provider_pending",
    };

    try {
      const response = await fetch("/api/app/payees", {
        body: JSON.stringify({
          allowedBucketId,
          maxCents,
          name,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as PayeeResponse;

      if (!response.ok || !payload.payee) {
        rememberDraft(draftPayee);
        setSaveState({
          message:
            payload.error ??
            "Payee preserved as a device draft until app access can sync.",
          status: response.status === 503 ? "drafted" : "error",
        });
        return;
      }

      const savedPayee = payload.payee;
      onPayeeSaved?.(savedPayee);

      if (payload.persisted === true || savedPayee.status === "approved") {
        persistDrafts(draftPayees.filter((payee) => payee.id !== savedPayee.id));
      } else {
        rememberDraft(savedPayee);
      }

      setSaveState({
        message:
          payload.message ??
          (savedPayee.status === "approved"
            ? "Payee approved for protected bill routing."
            : "Payee saved for provider approval."),
        status: savedPayee.status === "approved" ? "saved" : "drafted",
      });
    } catch {
      rememberDraft(draftPayee);
      setSaveState({
        message:
          "Network error. Payee preserved as a device draft until app access can sync.",
        status: "drafted",
      });
    }
  }

  return (
    <section
      className="relative z-10 border-b border-white/10 bg-[#07090b]"
      id="payee-controls"
    >
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.78fr_1.22fr] lg:px-8">
        <div className="accent-rule pt-5">
          <p className="inline-flex items-center gap-2 rounded-[8px] border border-[#39e8ff]/25 bg-[#39e8ff]/10 px-3 py-2 text-sm font-black uppercase text-[#dffaff]">
            <UserRoundCheck className="size-4" aria-hidden="true" />
            Payee controls
          </p>
          <h2 className="mt-4 text-3xl font-black leading-tight text-white sm:text-4xl">
            Approve exactly who protected buckets can pay.
          </h2>
          <p className="mt-4 text-lg leading-8 text-[#c9d0da]">
            Buckets protect the money. Payee controls decide where that money
            can go: landlord, lender, insurance carrier, utilities, childcare,
            or any household obligation with a clear limit.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="brand-panel-soft rounded-[8px] p-4">
              <p className="brand-kicker">Destinations</p>
              <p className="mt-2 text-2xl font-black text-white">
                {visiblePayees.length}
              </p>
            </div>
            <div className="brand-panel-soft rounded-[8px] p-4">
              <p className="brand-kicker">Approved</p>
              <p className="mt-2 text-2xl font-black text-white">
                {approvedCount}
              </p>
            </div>
            <div className="brand-panel-soft rounded-[8px] p-4">
              <p className="brand-kicker">Pending</p>
              <p className="mt-2 text-2xl font-black text-white">
                {pendingCount}
              </p>
            </div>
          </div>
        </div>

        <div className="brand-panel rounded-[8px] p-4">
          <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="rounded-[8px] border border-white/10 bg-black/35 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="brand-kicker">Add destination</p>
                  <h3 className="mt-1 text-xl font-black text-white">
                    Bucket-bound payee.
                  </h3>
                </div>
                <Landmark className="size-6 text-[#39e8ff]" aria-hidden="true" />
              </div>

              <div className="mt-4 grid gap-3">
                <label className="grid gap-2 text-sm font-black text-white">
                  Payee name
                  <input
                    className="h-11 rounded-[8px] border border-white/10 bg-black/45 px-3 text-sm font-bold text-white outline-none transition focus:border-[#39e8ff]"
                    maxLength={80}
                    onChange={(event) => setName(event.target.value)}
                    value={name}
                  />
                </label>
                <label className="grid gap-2 text-sm font-black text-white">
                  Allowed bucket
                  <select
                    className="h-11 rounded-[8px] border border-white/10 bg-black/45 px-3 text-sm font-bold text-white outline-none transition focus:border-[#39e8ff]"
                    onChange={(event) =>
                      setAllowedBucketId(event.target.value as BucketId)
                    }
                    value={allowedBucketId}
                  >
                    {protectedBuckets.map((bucket) => (
                      <option key={bucket.id} value={bucket.id}>
                        {bucket.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-black text-white">
                  Maximum allowed
                  <span className="relative">
                    <CircleDollarSign
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#39e8ff]"
                      aria-hidden="true"
                    />
                    <input
                      className="h-11 w-full rounded-[8px] border border-white/10 bg-black/45 pl-10 pr-3 text-sm font-bold text-white outline-none transition focus:border-[#39e8ff]"
                      inputMode="decimal"
                      min="0"
                      onChange={(event) => setMaxAmount(event.target.value)}
                      type="number"
                      value={maxAmount}
                    />
                  </span>
                </label>
              </div>

              <button
                className="brand-button-primary mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] px-4 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!formReady || saveState.status === "saving"}
                onClick={savePayee}
                type="button"
              >
                <Plus className="size-4" aria-hidden="true" />
                Save payee control
              </button>

              {saveState.message ? (
                <p
                  className={`mt-3 rounded-[8px] border p-3 text-sm font-bold leading-6 ${
                    saveState.status === "error"
                      ? "border-[#ff6b35]/35 bg-[#ff6b35]/10 text-[#ffd2c2]"
                      : "border-[#39e8ff]/25 bg-[#39e8ff]/10 text-[#dffaff]"
                  }`}
                >
                  {saveState.message}
                </p>
              ) : null}
            </div>

            <div className="grid gap-3">
              {visiblePayees.map((payee) => {
                const bucket = buckets.find(
                  (candidate) => candidate.id === payee.allowedBucketId,
                );
                const approved = payee.status === "approved";

                return (
                  <article
                    className={`rounded-[8px] border p-4 ${
                      approved
                        ? "border-[#68f0c2]/25 bg-[#68f0c2]/10"
                        : "border-[#ffb237]/25 bg-[#ffb237]/10"
                    }`}
                    key={payee.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-black text-white">
                          {payee.name}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-[#c9d0da]">
                          {bucket?.name ?? payee.allowedBucketId} only -{" "}
                          {formatMoney(payee.maxCents)} max
                        </p>
                      </div>
                      {approved ? (
                        <CheckCircle2
                          className="size-5 shrink-0 text-[#68f0c2]"
                          aria-hidden="true"
                        />
                      ) : (
                        <ShieldAlert
                          className="size-5 shrink-0 text-[#ffcf72]"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <p
                      className={`mt-3 inline-flex rounded-[8px] px-2.5 py-1 text-xs font-black ${
                        approved
                          ? "bg-[#68f0c2]/10 text-[#9af7d5]"
                          : "bg-[#ffb237]/10 text-[#ffe4ad]"
                      }`}
                    >
                      {statusLabel(payee.status)}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
