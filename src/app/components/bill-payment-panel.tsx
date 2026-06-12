"use client";

import {
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Landmark,
  Send,
  ShieldAlert,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { BucketBalance, Payee } from "@/app/lib/neobank/types.ts";

type SaveState =
  | { status: "idle"; message: string }
  | { status: "submitting"; message: string }
  | { status: "scheduled"; message: string }
  | { status: "error"; message: string };

type BillPaymentResponse = {
  decision?: {
    accepted?: boolean;
    amountCents?: number;
    bucketId?: string;
    code?: string;
    providerStatus?: string;
    reason?: string;
    scheduledFor?: string;
  };
  error?: string;
  message?: string;
  providerBillPayment?: {
    status?: string;
  };
};

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}

function defaultScheduleDate() {
  const date = new Date();
  date.setDate(date.getDate() + 14);

  return date.toISOString().slice(0, 10);
}

function dollarsToCents(value: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.round(parsed * 100));
}

export function BillPaymentPanel({
  buckets,
  payees,
}: {
  buckets: BucketBalance[];
  payees: Payee[];
}) {
  const approvedPayees = useMemo(
    () => payees.filter((payee) => payee.status === "approved"),
    [payees],
  );
  const [amount, setAmount] = useState("500");
  const [memo, setMemo] = useState("July rent");
  const [payeeId, setPayeeId] = useState(approvedPayees[0]?.id ?? "");
  const [result, setResult] = useState<BillPaymentResponse | null>(null);
  const [scheduledFor, setScheduledFor] = useState(defaultScheduleDate);
  const [saveState, setSaveState] = useState<SaveState>({
    message: "",
    status: "idle",
  });
  const selectedPayee = approvedPayees.find((payee) => payee.id === payeeId);
  const selectedBucket = buckets.find(
    (bucket) => bucket.id === selectedPayee?.allowedBucketId,
  );
  const amountCents = dollarsToCents(amount);
  const fitsBucket = Boolean(
    selectedBucket && amountCents > 0 && amountCents <= selectedBucket.availableCents,
  );
  const fitsPayee = Boolean(
    selectedPayee && amountCents > 0 && amountCents <= selectedPayee.maxCents,
  );

  async function schedulePayment() {
    setSaveState({
      message: "Scheduling bill payment...",
      status: "submitting",
    });

    try {
      const response = await fetch("/api/app/bill-payments", {
        body: JSON.stringify({
          amountCents,
          idempotencyKey: `ui-bill-${payeeId}-${amountCents}-${scheduledFor}`,
          memo,
          payeeId,
          scheduledFor,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as BillPaymentResponse;
      setResult(payload);

      if (!response.ok) {
        setSaveState({
          message: payload.error ?? payload.decision?.reason ?? "Bill not scheduled.",
          status: "error",
        });
        return;
      }

      setSaveState({
        message: payload.message ?? "Bill payment scheduled.",
        status: "scheduled",
      });
    } catch {
      setSaveState({
        message: "Network error. Bill payment was not scheduled.",
        status: "error",
      });
    }
  }

  return (
    <section
      className="relative z-10 border-b border-white/10 bg-[#090b0d]"
      id="bill-routing"
    >
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
        <div className="accent-rule pt-5">
          <p className="inline-flex items-center gap-2 rounded-[8px] border border-[#ffb237]/30 bg-[#ffb237]/10 px-3 py-2 text-sm font-black uppercase tracking-[0.14em] text-[#ffe4ad]">
            <Landmark className="size-4" aria-hidden="true" />
            Bill routing
          </p>
          <h2 className="mt-4 text-3xl font-black leading-tight text-white sm:text-4xl">
            Approved bills draw from their protected bucket.
          </h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="brand-panel-soft rounded-[8px] p-4">
              <p className="brand-kicker">Selected bucket</p>
              <p className="mt-2 text-2xl font-black text-white">
                {selectedBucket?.name ?? "No payee"}
              </p>
              <p className="mt-2 text-sm leading-6 text-[#aab3c2]">
                {selectedBucket ? formatMoney(selectedBucket.availableCents) : "$0"} available
              </p>
            </div>
            <div className="brand-panel-soft rounded-[8px] p-4">
              <p className="brand-kicker">Payee limit</p>
              <p className="mt-2 text-2xl font-black text-white">
                {selectedPayee ? formatMoney(selectedPayee.maxCents) : "$0"}
              </p>
              <p className="mt-2 text-sm leading-6 text-[#aab3c2]">
                {selectedPayee?.name ?? "No approved payee"}
              </p>
            </div>
          </div>
        </div>

        <div className="brand-panel rounded-[8px] p-4">
          <div className="grid gap-4 md:grid-cols-[1fr_0.85fr]">
            <div className="grid gap-3">
              <label className="grid gap-2 text-sm font-black text-white">
                Payee
                <select
                  className="h-11 rounded-[8px] border border-white/10 bg-black/45 px-3 text-sm font-bold text-white outline-none transition focus:border-[#39e8ff]"
                  onChange={(event) => setPayeeId(event.target.value)}
                  value={payeeId}
                >
                  {approvedPayees.map((payee) => (
                    <option key={payee.id} value={payee.id}>
                      {payee.name}
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
                  Date
                  <span className="relative">
                    <CalendarDays
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#39e8ff]"
                      aria-hidden="true"
                    />
                    <input
                      className="h-11 w-full rounded-[8px] border border-white/10 bg-black/45 pl-10 pr-3 text-sm font-bold text-white outline-none transition focus:border-[#39e8ff]"
                      onChange={(event) => setScheduledFor(event.target.value)}
                      type="date"
                      value={scheduledFor}
                    />
                  </span>
                </label>
              </div>

              <label className="grid gap-2 text-sm font-black text-white">
                Memo
                <input
                  className="h-11 rounded-[8px] border border-white/10 bg-black/45 px-3 text-sm font-bold text-white outline-none transition focus:border-[#39e8ff]"
                  maxLength={120}
                  onChange={(event) => setMemo(event.target.value)}
                  value={memo}
                />
              </label>

              <button
                className="brand-button-primary inline-flex h-11 items-center justify-center gap-2 rounded-[8px] px-4 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50"
                disabled={
                  !payeeId ||
                  !scheduledFor ||
                  amountCents <= 0 ||
                  saveState.status === "submitting"
                }
                onClick={schedulePayment}
                type="button"
              >
                <Send className="size-4" aria-hidden="true" />
                Schedule bill
              </button>
            </div>

            <div className="grid content-start gap-3">
              <div
                className={`rounded-[8px] border p-4 ${
                  fitsBucket && fitsPayee
                    ? "border-[#39e8ff]/25 bg-[#39e8ff]/10"
                    : "border-[#ffb237]/35 bg-[#ffb237]/10"
                }`}
              >
                <div className="flex items-start gap-3">
                  {fitsBucket && fitsPayee ? (
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
                      {fitsBucket && fitsPayee ? "Ready to schedule" : "Needs adjustment"}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[#c9d0da]">
                      {fitsBucket && fitsPayee
                        ? `${formatMoney(amountCents)} fits ${selectedBucket?.name}.`
                        : "Amount must fit the payee limit and bucket balance."}
                    </p>
                  </div>
                </div>
              </div>

              {saveState.message ? (
                <div
                  className={`rounded-[8px] border p-4 ${
                    saveState.status === "error"
                      ? "border-[#ff6b35]/35 bg-[#ff6b35]/10 text-[#ffd2c2]"
                      : "border-[#39e8ff]/25 bg-[#39e8ff]/10 text-[#dffaff]"
                  }`}
                >
                  <p className="text-sm font-black">{saveState.message}</p>
                  {result?.decision ? (
                    <p className="mt-2 text-xs leading-5 text-[#c9d0da]">
                      {result.decision.code} / {result.decision.providerStatus}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
