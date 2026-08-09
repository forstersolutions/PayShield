"use client";

import {
  CalendarDays,
  Check,
  Clock3,
  Loader2,
  ReceiptText,
  Send,
  ShieldAlert,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  completeActionAttempt,
  idempotencyKeyForAction,
} from "@/app/lib/client-action-idempotency";
import type { ActionAttemptRef } from "@/app/lib/client-action-idempotency";
import type { BucketBalance, Payee } from "@/app/lib/neobank/types.ts";

export type BillPaymentRecord = {
  amountCents?: number;
  bucketId?: string | null;
  canceledAt?: string | null;
  id?: string;
  memo?: string | null;
  payeeId?: string;
  scheduledFor?: string;
  status?: string;
};

type RequestState = {
  message: string;
  status: "idle" | "loading" | "ready" | "error";
};
type BillPaymentResponse = {
  decision?: { reason?: string };
  error?: string;
  message?: string;
};

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}

function formatDate(value?: string) {
  if (!value) {
    return "Date unavailable";
  }

  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);

  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(date);
}

function defaultScheduleDate() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

function dollarsToCents(value: string) {
  const amount = Number(value);

  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0;
}

export function BillPaymentPanel({
  billPayments = [],
  buckets,
  onRefresh,
  payees,
}: {
  billPayments?: BillPaymentRecord[];
  buckets: BucketBalance[];
  onRefresh?: () => Promise<void> | void;
  payees: Payee[];
}) {
  const approvedPayees = useMemo(
    () => payees.filter((payee) => payee.status === "approved"),
    [payees],
  );
  const upcomingPayments = useMemo(
    () =>
      billPayments
        .filter((payment) =>
          ["scheduled", "submitted", "blocked"].includes(payment.status ?? ""),
        )
        .sort((left, right) =>
          String(left.scheduledFor).localeCompare(String(right.scheduledFor)),
        ),
    [billPayments],
  );
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [payeeId, setPayeeId] = useState(approvedPayees[0]?.id ?? "");
  const [scheduledFor, setScheduledFor] = useState(defaultScheduleDate);
  const [requestState, setRequestState] = useState<RequestState>({
    message: "",
    status: "idle",
  });
  const [cancelState, setCancelState] = useState<RequestState>({
    message: "",
    status: "idle",
  });
  const [confirmCancelId, setConfirmCancelId] = useState("");
  const scheduleAttempt = useRef<ActionAttemptRef["current"]>(null);
  const cancelAttempt = useRef<ActionAttemptRef["current"]>(null);
  const selectedPayee =
    approvedPayees.find((payee) => payee.id === payeeId) ?? approvedPayees[0];
  const selectedBucket = buckets.find(
    (bucket) => bucket.id === selectedPayee?.allowedBucketId,
  );
  const amountCents = dollarsToCents(amount);
  const fitsLimit = Boolean(
    selectedPayee && amountCents > 0 && amountCents <= selectedPayee.maxCents,
  );
  const fitsBalance = Boolean(
    selectedBucket && amountCents > 0 && amountCents <= selectedBucket.availableCents,
  );
  const canSchedule = Boolean(
    selectedPayee && scheduledFor && fitsLimit && fitsBalance,
  );

  async function schedulePayment() {
    if (!canSchedule || !selectedPayee) {
      return;
    }

    setRequestState({ message: "Scheduling payment...", status: "loading" });
    const intent = {
      amountCents,
      memo: memo.trim() || undefined,
      payeeId: selectedPayee.id,
      scheduledFor,
    };
    const idempotencyKey = idempotencyKeyForAction(
      scheduleAttempt,
      "bill",
      intent,
    );

    try {
      const response = await fetch("/api/app/bill-payments", {
        body: JSON.stringify({
          ...intent,
          idempotencyKey,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as BillPaymentResponse;

      if (!response.ok) {
        setRequestState({
          message:
            payload.error ?? payload.decision?.reason ?? "Payment could not be scheduled.",
          status: "error",
        });
        return;
      }

      setRequestState({
        message: payload.message ?? "Payment scheduled.",
        status: "ready",
      });
      completeActionAttempt(scheduleAttempt, idempotencyKey);
      setMemo("");
      setAmount("");
      await onRefresh?.();
    } catch {
      setRequestState({
        message: "Payment could not be scheduled. Nothing was changed.",
        status: "error",
      });
    }
  }

  async function cancelPayment(payment: BillPaymentRecord) {
    if (!payment.id) {
      return;
    }

    setCancelState({ message: "Canceling payment...", status: "loading" });
    const intent = {
      reason: "Canceled from PayShield",
      scheduleId: payment.id,
    };
    const idempotencyKey = idempotencyKeyForAction(
      cancelAttempt,
      "bill-cancel",
      intent,
    );

    try {
      const response = await fetch("/api/app/bill-payments/cancel", {
        body: JSON.stringify({
          ...intent,
          idempotencyKey,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as BillPaymentResponse;

      if (!response.ok) {
        setCancelState({
          message: payload.error ?? "Payment could not be canceled.",
          status: "error",
        });
        return;
      }

      setConfirmCancelId("");
      completeActionAttempt(cancelAttempt, idempotencyKey);
      setCancelState({
        message: payload.message ?? "Payment canceled.",
        status: "ready",
      });
      await onRefresh?.();
    } catch {
      setCancelState({
        message: "Payment could not be canceled. Nothing was changed.",
        status: "error",
      });
    }
  }

  return (
    <section className="pay-bill-tool" id="bill-routing">
      <div className="pay-bill-form-pane">
        <div className="pay-tool-heading">
          <div>
            <p className="pay-eyebrow">Schedule a bill</p>
            <h2>Pay from the right bucket</h2>
          </div>
          <ReceiptText className="size-5" aria-hidden="true" />
        </div>

        {approvedPayees.length ? (
          <div className="pay-compact-form">
            <label>
              Destination
              <select onChange={(event) => setPayeeId(event.target.value)} value={selectedPayee?.id ?? ""}>
                {approvedPayees.map((payee) => (
                  <option key={payee.id} value={payee.id}>{payee.name}</option>
                ))}
              </select>
            </label>
            <div className="pay-form-pair">
              <label>
                Amount
                <span className="pay-money-input"><span>$</span><input inputMode="decimal" min="1" onChange={(event) => setAmount(event.target.value)} type="number" value={amount} /></span>
              </label>
              <label>
                Pay on
                <span className="pay-date-input"><CalendarDays className="size-4" /><input min={new Date().toISOString().slice(0, 10)} onChange={(event) => setScheduledFor(event.target.value)} type="date" value={scheduledFor} /></span>
              </label>
            </div>
            <label>
              Note <span className="pay-optional">optional</span>
              <input maxLength={120} onChange={(event) => setMemo(event.target.value)} placeholder="June rent" value={memo} />
            </label>
          </div>
        ) : (
          <div className="pay-empty-inline">
            <ShieldAlert className="size-5" />
            <span><strong>No ready destinations</strong><small>Add a destination above and complete verification before scheduling.</small></span>
          </div>
        )}

        <div className="pay-payment-check">
          <span data-ready={fitsBalance && fitsLimit}>
            {fitsBalance && fitsLimit ? <Check className="size-4" /> : <ShieldAlert className="size-4" />}
          </span>
          <div>
            <strong>{selectedBucket?.name ?? "Choose a destination"}</strong>
            <small>
              {selectedBucket
                ? `${formatMoney(selectedBucket.availableCents)} available · ${formatMoney(selectedPayee?.maxCents ?? 0)} payment limit`
                : "The bill must fit its bucket balance and destination limit."}
            </small>
          </div>
        </div>

        <button className="pay-primary-button" disabled={!canSchedule || requestState.status === "loading"} onClick={() => void schedulePayment()} type="button">
          {requestState.status === "loading" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Schedule {amountCents > 0 ? formatMoney(amountCents) : "payment"}
        </button>
        {requestState.message ? <p className="pay-inline-state" data-error={requestState.status === "error"} role={requestState.status === "error" ? "alert" : "status"}>{requestState.message}</p> : null}
      </div>

      <div className="pay-upcoming-pane">
        <div className="pay-tool-heading">
          <div>
            <p className="pay-eyebrow">Upcoming</p>
            <h2>{upcomingPayments.length} scheduled</h2>
          </div>
          <Clock3 className="size-5" />
        </div>

        <div className="pay-upcoming-list">
          {upcomingPayments.length ? (
            upcomingPayments.map((payment) => {
              const payee = payees.find((item) => item.id === payment.payeeId);
              const confirming = confirmCancelId === payment.id;

              return (
                <div className="pay-upcoming-row" key={payment.id ?? `${payment.payeeId}-${payment.scheduledFor}`}>
                  <span className="pay-upcoming-date"><small>{formatDate(payment.scheduledFor)}</small><strong>{formatMoney(payment.amountCents ?? 0)}</strong></span>
                  <span className="pay-upcoming-copy"><strong>{payee?.name ?? "Scheduled bill"}</strong><small>{payment.memo || buckets.find((bucket) => bucket.id === payment.bucketId)?.name || "Protected bucket"}</small></span>
                  {confirming ? (
                    <span className="pay-cancel-actions">
                      <button disabled={cancelState.status === "loading"} onClick={() => void cancelPayment(payment)} type="button">Confirm</button>
                      <button onClick={() => setConfirmCancelId("")} type="button">Keep</button>
                    </span>
                  ) : (
                    <button className="pay-icon-command danger" onClick={() => setConfirmCancelId(payment.id ?? "")} title="Cancel payment" type="button"><X className="size-4" /><span className="sr-only">Cancel payment</span></button>
                  )}
                </div>
              );
            })
          ) : (
            <div className="pay-empty-inline">
              <CalendarDays className="size-5" />
              <span><strong>No upcoming payments</strong><small>Scheduled bills will appear here.</small></span>
            </div>
          )}
        </div>
        {cancelState.message ? <p className="pay-inline-state" data-error={cancelState.status === "error"} role={cancelState.status === "error" ? "alert" : "status"}>{cancelState.message}</p> : null}
      </div>
    </section>
  );
}
