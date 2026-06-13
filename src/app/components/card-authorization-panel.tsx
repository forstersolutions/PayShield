"use client";

import {
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  Send,
  ShieldAlert,
} from "lucide-react";
import { useState } from "react";

type CardDecisionResponse = {
  decision?: {
    approved?: boolean;
    approvedAmountCents?: number;
    bucketId?: string;
    code?: string;
    reason?: string;
  };
  error?: string;
  mode?: string;
  service?: string;
};

type SaveState =
  | { status: "idle"; message: string }
  | { status: "checking"; message: string }
  | { status: "approved"; message: string }
  | { status: "declined"; message: string }
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

export function CardAuthorizationPanel({
  safeSpendCents,
}: {
  safeSpendCents: number;
}) {
  const [amount, setAmount] = useState("84");
  const [merchantCategoryCode, setMerchantCategoryCode] = useState("5411");
  const [merchantName, setMerchantName] = useState("Grocery market");
  const [result, setResult] = useState<CardDecisionResponse | null>(null);
  const [state, setState] = useState<SaveState>({
    message: "",
    status: "idle",
  });
  const amountCents = dollarsToCents(amount);
  const likelyFitsSafeSpend =
    amountCents > 0 && amountCents <= safeSpendCents;

  async function authorizePurchase() {
    setState({
      message: "Checking safe-spend authorization...",
      status: "checking",
    });
    setResult(null);

    try {
      const response = await fetch("/api/card/authorize", {
        body: JSON.stringify({
          amountCents,
          idempotencyKey: `ui-card-${crypto.randomUUID()}`,
          merchantCategoryCode,
          merchantName,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as
        CardDecisionResponse;
      const decision = payload.decision;

      setResult(payload);

      if (!response.ok || !decision) {
        setState({
          message: payload.error ?? "Authorization could not be evaluated.",
          status: "error",
        });
        return;
      }

      setState({
        message:
          decision.reason ??
          (decision.approved
            ? "Purchase fits Safe to Spend."
            : "Purchase would exceed Safe to Spend."),
        status: decision.approved ? "approved" : "declined",
      });
    } catch {
      setState({
        message: "Network error. Authorization was not evaluated.",
        status: "error",
      });
    }
  }

  return (
    <section
      className="relative z-10 border-y border-white/10 bg-[#050607]"
      id="card-authorization"
    >
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.82fr_1.18fr] lg:px-8">
        <div className="accent-rule pt-5">
          <p className="inline-flex items-center gap-2 rounded-[8px] border border-[#39e8ff]/25 bg-[#39e8ff]/10 px-3 py-2 text-sm font-black text-[#dffaff]">
            <CreditCard className="size-4" aria-hidden="true" />
            Card authorization
          </p>
          <h2 className="mt-4 text-3xl font-black leading-tight text-white sm:text-4xl">
            Test the decision before a dollar leaves the household.
          </h2>
          <p className="mt-4 text-lg leading-8 text-[#c9d0da]">
            The card decision surface answers one question: does this purchase
            fit Safe to Spend without reaching protected obligations?
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="brand-panel-soft rounded-[8px] p-4">
              <p className="brand-kicker">Safe to Spend</p>
              <p className="mt-2 text-3xl font-black text-white">
                {formatMoney(safeSpendCents)}
              </p>
            </div>
            <div
              className={`rounded-[8px] border p-4 ${
                likelyFitsSafeSpend
                  ? "border-[#39e8ff]/25 bg-[#39e8ff]/10"
                  : "border-[#ffb237]/35 bg-[#ffb237]/10"
              }`}
            >
              <p className="brand-kicker">Pre-check</p>
              <p className="mt-2 text-lg font-black text-white">
                {likelyFitsSafeSpend ? "Likely approval" : "Likely decline"}
              </p>
              <p className="mt-2 text-sm leading-6 text-[#aab3c2]">
                {formatMoney(amountCents)} against the current safe-spend
                balance.
              </p>
            </div>
          </div>
        </div>

        <div className="brand-panel rounded-[8px] p-4">
          <div className="grid gap-4 md:grid-cols-[1fr_0.82fr]">
            <div className="grid gap-3">
              <label className="grid gap-2 text-sm font-black text-white">
                Merchant
                <input
                  className="h-11 rounded-[8px] border border-white/10 bg-black/45 px-3 text-sm font-bold text-white outline-none transition focus:border-[#39e8ff]"
                  maxLength={80}
                  onChange={(event) => setMerchantName(event.target.value)}
                  value={merchantName}
                />
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
                  MCC
                  <input
                    className="h-11 rounded-[8px] border border-white/10 bg-black/45 px-3 text-sm font-bold text-white outline-none transition focus:border-[#39e8ff]"
                    inputMode="numeric"
                    maxLength={8}
                    onChange={(event) =>
                      setMerchantCategoryCode(event.target.value)
                    }
                    value={merchantCategoryCode}
                  />
                </label>
              </div>

              <button
                className="brand-button-primary inline-flex h-11 items-center justify-center gap-2 rounded-[8px] px-4 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50"
                disabled={
                  amountCents <= 0 ||
                  !merchantName.trim() ||
                  state.status === "checking"
                }
                onClick={authorizePurchase}
                type="button"
              >
                <Send className="size-4" aria-hidden="true" />
                Run authorization
              </button>
            </div>

            <div className="grid content-start gap-3">
              <div
                className={`rounded-[8px] border p-4 ${
                  state.status === "approved"
                    ? "border-[#39e8ff]/25 bg-[#39e8ff]/10"
                    : state.status === "declined" || state.status === "error"
                      ? "border-[#ff8a7a]/35 bg-[#ff8a7a]/10"
                      : "border-white/10 bg-black/40"
                }`}
              >
                <div className="flex items-start gap-3">
                  {state.status === "approved" ? (
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
                      {state.status === "approved"
                        ? "Approved"
                        : state.status === "declined"
                          ? "Declined"
                          : "Decision ready"}
                    </p>
                    <p
                      aria-live={
                        state.status === "error" ? "assertive" : "polite"
                      }
                      className="mt-1 text-sm leading-6 text-[#c9d0da]"
                      role={state.status === "error" ? "alert" : "status"}
                    >
                      {state.message ||
                        "Run a purchase through the safe-spend model."}
                    </p>
                  </div>
                </div>
              </div>

              {result?.decision ? (
                <div className="rounded-[8px] border border-white/10 bg-black/40 p-4">
                  <p className="brand-kicker">Ledger decision</p>
                  <p className="mt-2 text-sm font-black text-white">
                    {result.decision.code} /{" "}
                    {result.decision.bucketId ?? "no bucket"}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#aab3c2]">
                    Approved amount:{" "}
                    {formatMoney(result.decision.approvedAmountCents ?? 0)}
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
