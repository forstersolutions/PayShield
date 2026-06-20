"use client";

import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { friendlyGateLabel } from "@/app/lib/readiness-gates.ts";

type EvidenceState = {
  message: string;
  status: "idle" | "loading" | "ready" | "error";
};

const evidenceScopes = [
  "provider",
  "sponsor_disclosure",
  "counsel",
  "operations",
  "ledger",
  "auth",
  "core",
  "commercial",
  "money_rail",
  "live_money",
];

const evidenceStatuses = ["approved", "pending", "rejected", "revoked"];

const defaultEvidenceGates = [
  "provider_contract",
  "provider_credentials",
  "provider_adapter",
  "sponsor_disclosures",
  "counsel_signoff",
  "operations_runbooks",
  "postgres_ledger",
  "dedicated_backend",
  "core_service_auth",
  "clerk_auth",
  "live_money",
];

function uniqueGates(gates: string[]) {
  return [...new Set(gates)].filter(Boolean);
}

function formatStatus(value: string) {
  return value.replace(/_/g, " ");
}

function evidenceScopeForGate(gate: string) {
  const normalized = gate.toLowerCase();

  if (normalized.includes("stripe") || normalized.includes("checkout")) {
    return "commercial";
  }

  if (normalized.includes("clerk") || normalized.includes("auth")) {
    return "auth";
  }

  if (normalized.includes("postgres") || normalized.includes("ledger")) {
    return "ledger";
  }

  if (normalized.includes("core")) {
    return "core";
  }

  if (
    normalized.includes("baas") ||
    normalized.includes("provider") ||
    normalized.includes("plaid") ||
    normalized.includes("transfer")
  ) {
    return "provider";
  }

  if (normalized.includes("sponsor")) {
    return "sponsor_disclosure";
  }

  if (normalized.includes("counsel")) {
    return "counsel";
  }

  if (normalized.includes("runbook") || normalized.includes("operations")) {
    return "operations";
  }

  if (normalized.includes("live")) {
    return "live_money";
  }

  return "core";
}

function evidenceResponseMessage(
  payload: { error?: unknown; message?: unknown },
  fallback: string,
) {
  if (typeof payload.error === "string" && payload.error.trim()) {
    return payload.error;
  }

  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message;
  }

  return fallback;
}

export function ProductionGateEvidenceRecorder({
  remainingGates,
}: {
  remainingGates: string[];
}) {
  const initialGate = remainingGates[0] ?? defaultEvidenceGates[0];
  const [evidenceGateId, setEvidenceGateId] = useState(initialGate);
  const [evidenceScope, setEvidenceScope] = useState(
    evidenceScopeForGate(initialGate),
  );
  const [evidenceStatus, setEvidenceStatus] = useState("approved");
  const [evidenceRef, setEvidenceRef] = useState("");
  const [evidenceSummary, setEvidenceSummary] = useState("");
  const [approvedBy, setApprovedBy] = useState("Grayston Operations");
  const [evidenceState, setEvidenceState] = useState<EvidenceState>({
    message: "",
    status: "idle",
  });
  const evidenceGateOptions = useMemo(
    () => uniqueGates([...remainingGates, ...defaultEvidenceGates]),
    [remainingGates],
  );

  async function recordGateEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEvidenceState({
      message: "Recording production gate evidence...",
      status: "loading",
    });

    try {
      const response = await fetch("/api/launch/gate-evidence", {
        body: JSON.stringify({
          approvedAt:
            evidenceStatus === "approved" ? new Date().toISOString() : null,
          approvedBy,
          evidenceRef,
          evidenceSummary,
          gateId: evidenceGateId,
          metadata: {
            source: "launch_console",
          },
          scope: evidenceScope,
          status: evidenceStatus,
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        setEvidenceState({
          message: evidenceResponseMessage(
            payload,
            "Production gate evidence was not recorded.",
          ),
          status: "error",
        });
        return;
      }

      setEvidenceState({
        message: "Production gate evidence recorded in durable core.",
        status: "ready",
      });
      setEvidenceRef("");
      setEvidenceSummary("");
    } catch {
      setEvidenceState({
        message: "Production gate evidence request failed.",
        status: "error",
      });
    }
  }

  return (
    <form
      className="rounded-[8px] border border-[#68f0c2]/25 bg-[#68f0c2]/10 p-3"
      onSubmit={recordGateEvidence}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="brand-kicker">Gate evidence</p>
          <p className="mt-1 text-sm font-bold leading-6 text-[#dffaff]">
            Durable approval records for productionReceiverEvidence,
            counselSignoff, liveAnalyticsEvidence, and live-money gates.
          </p>
        </div>
        <span className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-[#68f0c2]/25 bg-black/35 px-3 text-xs font-black uppercase text-[#9af7d5]">
          <ShieldCheck className="size-4" aria-hidden="true" />
          POST /api/launch/gate-evidence
        </span>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <label className="grid gap-1 text-xs font-black uppercase text-[#8f99aa]">
          Gate
          <select
            className="h-11 rounded-[8px] border border-white/10 bg-black/45 px-3 text-sm font-black normal-case text-white outline-none transition focus:border-[#68f0c2]/45"
            onChange={(event) => {
              setEvidenceGateId(event.target.value);
              setEvidenceScope(evidenceScopeForGate(event.target.value));
            }}
            value={evidenceGateId}
          >
            {evidenceGateOptions.map((gate) => (
              <option key={gate} value={gate}>
                {friendlyGateLabel(gate)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-black uppercase text-[#8f99aa]">
          Scope
          <select
            className="h-11 rounded-[8px] border border-white/10 bg-black/45 px-3 text-sm font-black normal-case text-white outline-none transition focus:border-[#68f0c2]/45"
            onChange={(event) => setEvidenceScope(event.target.value)}
            value={evidenceScope}
          >
            {evidenceScopes.map((scope) => (
              <option key={scope} value={scope}>
                {formatStatus(scope)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-black uppercase text-[#8f99aa]">
          Status
          <select
            className="h-11 rounded-[8px] border border-white/10 bg-black/45 px-3 text-sm font-black normal-case text-white outline-none transition focus:border-[#68f0c2]/45"
            onChange={(event) => setEvidenceStatus(event.target.value)}
            value={evidenceStatus}
          >
            {evidenceStatuses.map((status) => (
              <option key={status} value={status}>
                {formatStatus(status)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
        <label className="grid gap-1 text-xs font-black uppercase text-[#8f99aa]">
          Evidence ref
          <input
            className="h-11 rounded-[8px] border border-white/10 bg-black/45 px-3 text-sm font-bold normal-case text-white outline-none transition placeholder:text-[#5f6877] focus:border-[#68f0c2]/45"
            onChange={(event) => setEvidenceRef(event.target.value)}
            placeholder="notion-counsel-signoff-2026-06"
            required
            value={evidenceRef}
          />
        </label>
        <label className="grid gap-1 text-xs font-black uppercase text-[#8f99aa]">
          Approved by
          <input
            className="h-11 rounded-[8px] border border-white/10 bg-black/45 px-3 text-sm font-bold normal-case text-white outline-none transition placeholder:text-[#5f6877] focus:border-[#68f0c2]/45"
            onChange={(event) => setApprovedBy(event.target.value)}
            required={evidenceStatus === "approved"}
            value={approvedBy}
          />
        </label>
      </div>
      <label className="mt-3 grid gap-1 text-xs font-black uppercase text-[#8f99aa]">
        Evidence summary
        <textarea
          className="min-h-24 rounded-[8px] border border-white/10 bg-black/45 px-3 py-2 text-sm font-bold normal-case leading-6 text-white outline-none transition placeholder:text-[#5f6877] focus:border-[#68f0c2]/45"
          onChange={(event) => setEvidenceSummary(event.target.value)}
          placeholder="Redacted approval summary with no secrets or raw customer data."
          required
          value={evidenceSummary}
        />
      </label>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p
          className={`text-sm font-bold leading-6 ${
            evidenceState.status === "error"
              ? "text-[#ffd2c2]"
              : evidenceState.status === "ready"
                ? "text-[#9af7d5]"
                : "text-[#aab3c2]"
          }`}
        >
          {evidenceState.message ||
            "Core service and Postgres schema 0013 are required before records persist."}
        </p>
        <button
          className="brand-button-primary inline-flex h-10 items-center justify-center gap-2 rounded-[8px] px-3 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50"
          disabled={evidenceState.status === "loading"}
          type="submit"
        >
          {evidenceState.status === "loading" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="size-4" aria-hidden="true" />
          )}
          Record evidence
        </button>
      </div>
    </form>
  );
}
