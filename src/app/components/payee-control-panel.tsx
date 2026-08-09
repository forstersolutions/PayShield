"use client";

import {
  Check,
  Clock3,
  Edit3,
  Loader2,
  Plus,
  Save,
  Trash2,
  UserRoundCheck,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  completeActionAttempt,
  idempotencyKeyForAction,
} from "@/app/lib/client-action-idempotency";
import type { ActionAttemptRef } from "@/app/lib/client-action-idempotency";
import type { BucketBalance, BucketId, Payee } from "@/app/lib/neobank/types.ts";

type EditorMode = "add" | "edit";
type RequestState = {
  message: string;
  status: "idle" | "saving" | "saved" | "error";
};
type PayeeResponse = {
  enrollmentUrl?: string | null;
  error?: string;
  message?: string;
  payee?: Payee;
  persisted?: boolean;
  verificationStatus?: string;
};

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}

function dollarsToCents(value: string) {
  const amount = Number(value);

  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0;
}

function mergePayees(primary: Payee[], overlay: Payee[]) {
  const payees = new Map(primary.map((payee) => [payee.id, payee]));

  for (const payee of overlay) {
    payees.set(payee.id, payee);
  }

  return [...payees.values()].filter((payee) => payee.status !== "archived");
}

function statusLabel(status: Payee["status"]) {
  if (status === "approved") {
    return "Ready";
  }

  if (status === "rejected") {
    return "Needs attention";
  }

  return "Verification pending";
}

export function PayeeControlPanel({
  buckets,
  onPayeesChanged,
  onPayeeSaved,
  payees,
}: {
  buckets: BucketBalance[];
  onPayeesChanged?: (payees: Payee[]) => void;
  onPayeeSaved?: (payee: Payee) => void;
  payees: Payee[];
}) {
  const protectedBuckets = useMemo(
    () => buckets.filter((bucket) => bucket.id !== "safe_spending"),
    [buckets],
  );
  const visiblePayees = useMemo(
    () => payees.filter((payee) => payee.status !== "archived"),
    [payees],
  );
  const [mode, setMode] = useState<EditorMode>(payees.length ? "edit" : "add");
  const [payeeId, setPayeeId] = useState(payees[0]?.id ?? "");
  const [name, setName] = useState(payees[0]?.name ?? "");
  const [bucketId, setBucketId] = useState<BucketId>(
    payees[0]?.allowedBucketId ?? protectedBuckets[0]?.id ?? "rent",
  );
  const [maximum, setMaximum] = useState(
    payees[0]?.maxCents ? String(payees[0].maxCents / 100) : "",
  );
  const [archiveConfirmId, setArchiveConfirmId] = useState("");
  const [requestState, setRequestState] = useState<RequestState>({
    message: "",
    status: "idle",
  });
  const saveAttempt = useRef<ActionAttemptRef["current"]>(null);
  const archiveAttempt = useRef<ActionAttemptRef["current"]>(null);
  const maxCents = dollarsToCents(maximum);
  const formReady = Boolean(name.trim() && bucketId && maxCents > 0);
  const selectedPayee = visiblePayees.find((payee) => payee.id === payeeId);

  function beginAdd() {
    setMode("add");
    setPayeeId("");
    setName("");
    setBucketId(protectedBuckets[0]?.id ?? "rent");
    setMaximum("");
    setArchiveConfirmId("");
    setRequestState({ message: "", status: "idle" });
  }

  function beginEdit(payee: Payee) {
    setMode("edit");
    setPayeeId(payee.id);
    setName(payee.name);
    setBucketId(payee.allowedBucketId);
    setMaximum(String(payee.maxCents / 100));
    setArchiveConfirmId("");
    setRequestState({ message: "", status: "idle" });
  }

  async function savePayee() {
    if (!formReady) {
      return;
    }

    setRequestState({ message: "Saving destination...", status: "saving" });
    const editing = mode === "edit" && Boolean(payeeId);
    const updatingServerRecord = editing;
    const intent = {
      allowedBucketId: bucketId,
      maxCents,
      name: name.trim(),
      ...(updatingServerRecord ? { payeeId } : {}),
    };
    const idempotencyKey = idempotencyKeyForAction(
      saveAttempt,
      updatingServerRecord ? "payee-update" : "payee-create",
      intent,
    );

    try {
      const response = await fetch("/api/app/payees", {
        body: JSON.stringify({
          ...intent,
          idempotencyKey,
        }),
        headers: { "content-type": "application/json" },
        method: updatingServerRecord ? "PATCH" : "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as PayeeResponse;

      if (!response.ok || !payload.payee) {
        setRequestState({
          message:
            payload.error ?? "Destination could not be saved. Nothing was changed.",
          status: "error",
        });
        return;
      }

      const savedPayee = payload.payee;
      completeActionAttempt(saveAttempt, idempotencyKey);
      onPayeesChanged?.(
        mergePayees(payees.filter((payee) => payee.id !== savedPayee.id), [savedPayee]),
      );
      onPayeeSaved?.(savedPayee);
      beginEdit(savedPayee);
      setRequestState({
        message: payload.message ?? "Destination saved.",
        status: "saved",
      });

      if (payload.enrollmentUrl) {
        window.location.assign(payload.enrollmentUrl);
      }
    } catch {
      setRequestState({
        message: "Destination could not be saved. Nothing was changed.",
        status: "error",
      });
    }
  }

  async function verifyPayee(payee: Payee) {
    setRequestState({
      message: "Opening secure verification...",
      status: "saving",
    });

    try {
      const response = await fetch("/api/app/payees/verify", {
        body: JSON.stringify({
          idempotencyKey: `payee-verify-${payee.id}-${payee.allowedBucketId}-${payee.maxCents}`,
          payeeId: payee.id,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as PayeeResponse;

      if (!response.ok || !payload.payee) {
        setRequestState({
          message: payload.error ?? "Verification could not be opened.",
          status: "error",
        });
        return;
      }

      const verifiedPayee = payload.payee;
      onPayeesChanged?.(
        mergePayees(payees.filter((item) => item.id !== verifiedPayee.id), [verifiedPayee]),
      );
      onPayeeSaved?.(verifiedPayee);
      beginEdit(verifiedPayee);
      setRequestState({
        message: payload.message ?? "Verification opened.",
        status: "saved",
      });

      if (payload.enrollmentUrl) {
        window.location.assign(payload.enrollmentUrl);
      }
    } catch {
      setRequestState({
        message: "Verification could not be opened.",
        status: "error",
      });
    }
  }

  async function archivePayee(payee: Payee) {
    setRequestState({ message: "Removing destination...", status: "saving" });
    const intent = { payeeId: payee.id };
    const idempotencyKey = idempotencyKeyForAction(
      archiveAttempt,
      "payee-archive",
      intent,
    );

    try {
      const response = await fetch("/api/app/payees", {
        body: JSON.stringify({
          ...intent,
          idempotencyKey,
        }),
        headers: { "content-type": "application/json" },
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => ({}))) as PayeeResponse;

      if (!response.ok) {
        setRequestState({
          message: payload.error ?? "Destination could not be removed.",
          status: "error",
        });
        return;
      }

      onPayeesChanged?.(visiblePayees.filter((item) => item.id !== payee.id));
      completeActionAttempt(archiveAttempt, idempotencyKey);
      beginAdd();
      setRequestState({
        message: payload.message ?? "Destination removed.",
        status: "saved",
      });
    } catch {
      setRequestState({
        message: "Destination could not be removed. Nothing was changed.",
        status: "error",
      });
    }
  }

  return (
    <section className="pay-biller-tool" id="payee-controls">
      <div className="pay-biller-list-pane">
        <div className="pay-tool-heading">
          <div>
            <p className="pay-eyebrow">Payment destinations</p>
            <h2>Who protected money can pay</h2>
          </div>
          <button
            className="pay-icon-command"
            onClick={beginAdd}
            title="Add destination"
            type="button"
          >
            <Plus className="size-4" aria-hidden="true" />
            <span className="sr-only">Add destination</span>
          </button>
        </div>

        <div className="pay-biller-list">
          {visiblePayees.length ? (
            visiblePayees.map((payee) => {
              const bucket = buckets.find(
                (item) => item.id === payee.allowedBucketId,
              );
              const selected = mode === "edit" && payeeId === payee.id;

              return (
                <div className="pay-biller-row" data-selected={selected} key={payee.id}>
                  <button onClick={() => beginEdit(payee)} type="button">
                    <span className="pay-biller-icon" data-ready={payee.status === "approved"}>
                      {payee.status === "approved" ? (
                        <Check className="size-4" />
                      ) : (
                        <Clock3 className="size-4" />
                      )}
                    </span>
                    <span className="pay-biller-copy">
                      <strong>{payee.name}</strong>
                      <small>{bucket?.name ?? payee.allowedBucketId} · {formatMoney(payee.maxCents)} limit</small>
                    </span>
                    <span className="pay-biller-status">{statusLabel(payee.status)}</span>
                    <Edit3 className="size-4" aria-hidden="true" />
                  </button>

                  {archiveConfirmId === payee.id ? (
                    <div className="pay-biller-confirm">
                      <span>Remove {payee.name}?</span>
                      <button onClick={() => void archivePayee(payee)} type="button">
                        Remove
                      </button>
                      <button onClick={() => setArchiveConfirmId("")} type="button">
                        Keep
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })
          ) : (
            <button className="pay-empty-command" onClick={beginAdd} type="button">
              <UserRoundCheck className="size-5" />
              <span><strong>Add your first biller</strong><small>Choose its bucket and payment limit.</small></span>
            </button>
          )}
        </div>
      </div>

      <div className="pay-biller-editor">
        <div className="pay-tool-heading">
          <div>
            <p className="pay-eyebrow">{mode === "add" ? "New destination" : "Destination settings"}</p>
            <h2>{mode === "add" ? "Add a biller" : name || "Edit biller"}</h2>
          </div>
          {mode === "edit" ? (
            <button
              className="pay-icon-command danger"
              onClick={() => setArchiveConfirmId(payeeId)}
              title="Remove destination"
              type="button"
            >
              <Trash2 className="size-4" />
              <span className="sr-only">Remove destination</span>
            </button>
          ) : (
            <button className="pay-icon-command" onClick={beginAdd} title="Clear form" type="button">
              <X className="size-4" />
              <span className="sr-only">Clear form</span>
            </button>
          )}
        </div>

        <div className="pay-compact-form">
          <label>
            Name
            <input maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="Mortgage, landlord, daycare..." value={name} />
          </label>
          <label>
            Protected bucket
            <select onChange={(event) => setBucketId(event.target.value as BucketId)} value={bucketId}>
              {protectedBuckets.map((bucket) => (
                <option key={bucket.id} value={bucket.id}>{bucket.name}</option>
              ))}
            </select>
          </label>
          <label>
            Payment limit
            <span className="pay-money-input"><span>$</span><input inputMode="decimal" min="1" onChange={(event) => setMaximum(event.target.value)} type="number" value={maximum} /></span>
          </label>
        </div>

        <div className="pay-editor-note">
          <Check className="size-4" />
          <span>This destination can use only <strong>{buckets.find((bucket) => bucket.id === bucketId)?.name ?? "the selected bucket"}</strong>, up to {formatMoney(maxCents)} per payment.</span>
        </div>

        <button className="pay-primary-button" disabled={!formReady || requestState.status === "saving"} onClick={() => void savePayee()} type="button">
          {requestState.status === "saving" ? <Loader2 className="size-4 animate-spin" /> : mode === "add" ? <Plus className="size-4" /> : <Save className="size-4" />}
          {mode === "add" ? "Add destination" : "Save changes"}
        </button>

        {mode === "edit" && selectedPayee?.status !== "approved" ? (
          <button
            className="pay-secondary-button"
            disabled={
              requestState.status === "saving" || payeeId.startsWith("local_")
            }
            onClick={() => {
              if (selectedPayee) {
                void verifyPayee(selectedPayee);
              }
            }}
            type="button"
          >
            <UserRoundCheck className="size-4" />
            Verify destination
          </button>
        ) : null}

        {requestState.message ? (
          <p className="pay-inline-state" data-error={requestState.status === "error"} role={requestState.status === "error" ? "alert" : "status"}>
            {requestState.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
