"use client";

import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

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

type MembershipStatusResponse = {
  available?: boolean;
  membership?: { priceLabel?: string };
};

function blockerDetail(payload: PublicCheckoutResponse) {
  const missing = payload.readiness?.missing ?? [];

  if (missing.length) {
    return "Please try again shortly. You have not been charged.";
  }

  if (
    payload.error &&
    /STRIPE|PAYSHIELD_|CORE_|not configured/i.test(payload.error)
  ) {
    return "Please try again shortly. You have not been charged.";
  }

  return payload.error;
}

function checkoutErrorMessage(payload: PublicCheckoutResponse) {
  return blockerDetail(payload)
    ? "Membership signup is temporarily unavailable."
    : "Membership signup could not be started.";
}

export function PublicCheckoutForm({
  priceLabel = "$19/month",
}: {
  priceLabel?: string;
}) {
  const [state, setState] = useState<CheckoutState>({
    message: "Secure monthly membership. Cancel anytime.",
    status: "idle",
  });
  const [availability, setAvailability] = useState<
    "checking" | "available" | "unavailable"
  >("checking");
  const checkoutAttempt = useRef<{ email: string; idempotencyKey: string } | null>(
    null,
  );

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/public/billing/status", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as MembershipStatusResponse;
        setAvailability(response.ok && payload.available ? "available" : "unavailable");
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setAvailability("unavailable");
        }
      });

    return () => controller.abort();
  }, []);

  async function startCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (availability !== "available") {
      setState({
        message: "Membership signup is temporarily unavailable.",
        status: "error",
      });
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get("email") ?? "").trim().toLowerCase();

    if (!checkoutAttempt.current || checkoutAttempt.current.email !== email) {
      checkoutAttempt.current = {
        email,
        idempotencyKey: `public-checkout-${crypto.randomUUID()}`,
      };
    }

    setState({
      message: "Preparing secure checkout...",
      status: "loading",
    });

    try {
      const response = await fetch("/api/public/billing/checkout", {
        body: JSON.stringify({
          email,
          idempotencyKey: checkoutAttempt.current.idempotencyKey,
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
          message: checkoutErrorMessage(payload),
          status: "error",
        });
        return;
      }

      setState({
        detail: payload.readiness?.priceLabel,
        message: "Opening secure checkout...",
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
      className="public-checkout-card"
      onSubmit={startCheckout}
    >
      <div className="public-checkout-head">
        <span><ShieldCheck className="size-5" aria-hidden="true" /></span>
        <p>{priceLabel}</p>
      </div>
      <h3>Start your PayShield membership.</h3>
      <p className="public-checkout-copy">
        Use the same email when you sign in to keep billing and your household
        protected under one account.
      </p>

      <div className="public-checkout-fields">
        <label>
          Household email
          <input
            autoComplete="email"
            name="email"
            placeholder="you@example.com"
            required
            type="email"
          />
        </label>

        <label>
          Name
          <input
            autoComplete="name"
            name="name"
            placeholder="Optional"
            type="text"
          />
        </label>

        <button
          disabled={state.status === "loading" || availability !== "available"}
          type="submit"
        >
          {state.status === "loading" || availability === "checking" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <ShieldCheck className="size-4" aria-hidden="true" />
          )}
          {availability === "checking"
            ? "Checking availability"
            : availability === "unavailable"
              ? "Membership unavailable"
              : "Start membership"}
          <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      </div>

      {state.message || availability !== "available" ? (
        <div
          className="public-checkout-status"
          data-state={availability === "unavailable" ? "error" : state.status}
          role={state.status === "error" ? "alert" : "status"}
        >
          <p>
            {availability === "checking"
              ? "Checking membership availability..."
              : availability === "unavailable" && state.status === "idle"
                ? "Membership signup is temporarily unavailable."
                : state.message}
          </p>
          {state.detail ? <small>{state.detail}</small> : null}
        </div>
      ) : null}
    </form>
  );
}
