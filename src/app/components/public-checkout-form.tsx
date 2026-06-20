"use client";

import { ArrowRight, BadgeDollarSign, Loader2, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { friendlyGateLabel } from "@/app/lib/readiness-gates.ts";

type CheckoutState =
  | { detail?: string; message: string; status: "idle" }
  | { detail?: string; message: string; status: "loading" }
  | { detail?: string; message: string; status: "ready" }
  | { detail?: string; message: string; status: "error" };

type PublicCheckoutResponse = {
  error?: string;
  readiness?: {
    missing?: string[];
    mode?: string;
    priceLabel?: string;
  };
  url?: string;
};

function blockerDetail(payload: PublicCheckoutResponse) {
  const missing = payload.readiness?.missing ?? [];

  if (missing.length) {
    return `Needs ${missing.map(friendlyGateLabel).join(", ")}.`;
  }

  return payload.error;
}

export function PublicCheckoutForm() {
  const [state, setState] = useState<CheckoutState>({
    message: "Enter a household email to start protected access.",
    status: "idle",
  });

  async function startCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    setState({
      message: "Preparing secure checkout...",
      status: "loading",
    });

    try {
      const response = await fetch("/api/public/billing/checkout", {
        body: JSON.stringify({
          email: formData.get("email"),
          name: formData.get("name"),
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as PublicCheckoutResponse;

      if (!response.ok || !payload.url) {
        setState({
          detail: blockerDetail(payload),
          message: payload.error ?? "Checkout is not ready yet.",
          status: "error",
        });
        return;
      }

      setState({
        detail: payload.readiness?.priceLabel,
        message: "Checkout ready. Redirecting to Stripe.",
        status: "ready",
      });
      window.location.assign(payload.url);
    } catch {
      setState({
        message: "Checkout could not be started. Try again shortly.",
        status: "error",
      });
    }
  }

  return (
    <form
      className="brand-panel rounded-[8px] p-4 text-white"
      onSubmit={startCheckout}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="brand-kicker">Paid household access</p>
          <h3 className="mt-1 text-2xl font-black text-white">
            Start with checkout.
          </h3>
        </div>
        <span className="grid size-11 place-items-center rounded-[8px] border border-[#68f0c2]/25 bg-[#68f0c2]/10 text-[#68f0c2]">
          <BadgeDollarSign className="size-5" aria-hidden="true" />
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-[#c9d0da]">
        PayShield uses the household email to bind Stripe checkout, later app
        sign-in, and the protected ledger to the same account.
      </p>

      <div className="mt-4 grid gap-3">
        <label className="text-sm font-medium text-[#d9dde5]">
          Household email
          <input
            autoComplete="email"
            className="mt-2 h-11 w-full rounded-[8px] border border-white/10 bg-black/40 px-3 text-white outline-none placeholder:text-[#687384] focus:border-[#68f0c2]"
            name="email"
            placeholder="you@example.com"
            required
            type="email"
          />
        </label>

        <label className="text-sm font-medium text-[#d9dde5]">
          Name
          <input
            autoComplete="name"
            className="mt-2 h-11 w-full rounded-[8px] border border-white/10 bg-black/40 px-3 text-white outline-none placeholder:text-[#687384] focus:border-[#68f0c2]"
            name="name"
            placeholder="Optional"
            type="text"
          />
        </label>

        <button
          className="brand-button-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] px-4 text-sm font-black disabled:cursor-not-allowed disabled:opacity-60"
          disabled={state.status === "loading"}
          type="submit"
        >
          {state.status === "loading" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <ShieldCheck className="size-4" aria-hidden="true" />
          )}
          Start protected access
          <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      </div>

      {state.message ? (
        <div
          className={`mt-4 rounded-[8px] border p-3 text-sm leading-6 ${
            state.status === "error"
              ? "border-[#ffb237]/30 bg-[#ffb237]/10 text-[#ffe4ad]"
              : state.status === "ready"
                ? "border-[#68f0c2]/25 bg-[#68f0c2]/10 text-[#cffff0]"
                : "border-white/10 bg-black/35 text-[#aab3c2]"
          }`}
          role={state.status === "error" ? "alert" : "status"}
        >
          <p className="font-black text-white">{state.message}</p>
          {state.detail ? <p className="mt-1">{state.detail}</p> : null}
        </div>
      ) : null}
    </form>
  );
}
