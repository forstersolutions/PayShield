"use client";

import {
  ArrowRightLeft,
  BadgeDollarSign,
  CheckCircle2,
  CreditCard,
  Database,
  Landmark,
  Link2,
  Loader2,
  LockKeyhole,
  Radar,
  ShieldAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { BucketBalance, Payee } from "@/app/lib/neobank/types.ts";

type ActionState =
  | { status: "idle"; message: string }
  | { status: "loading"; message: string }
  | { status: "ready"; message: string }
  | { status: "error"; message: string };

type PlaidMetadata = {
  account?: { id?: string; mask?: string; name?: string };
  institution?: { name?: string };
};

type PlaidHandler = {
  exit(): void;
  open(): void;
};

type PlaidCreateInput = {
  onExit?: () => void;
  onSuccess: (publicToken: string, metadata: PlaidMetadata) => void;
  token: string;
};

type OperationsReadiness = {
  commercial?: {
    checkoutConfigured?: boolean;
    mode?: string;
    paidAccessReady?: boolean;
    priceLabel?: string;
    remainingGates?: string[];
    webhookEndpointPath?: string;
  };
  moneyRails?: {
    bankLinkReady?: boolean;
    detectionMode?: string;
    paycheckDetectionReady?: boolean;
    plaidConfigured?: boolean;
    plaidEnv?: string;
    remainingGates?: string[];
    tokenVaultConfigured?: boolean;
    transferConfigured?: boolean;
    transferReady?: boolean;
  };
  neobank?: {
    backendConfigured?: boolean;
    liveMoneyReady?: boolean;
    mode?: string;
    postgresSchemaVerified?: boolean;
    providerConfigured?: boolean;
    remainingGates?: string[];
  };
};

declare global {
  interface Window {
    Plaid?: {
      create(input: PlaidCreateInput): PlaidHandler;
    };
  }
}

let plaidScriptPromise: Promise<void> | null = null;

function loadPlaidScript() {
  if (window.Plaid) {
    return Promise.resolve();
  }

  if (plaidScriptPromise) {
    return plaidScriptPromise;
  }

  plaidScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"]',
    );

    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Plaid Link failed to load.")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Plaid Link failed to load."));
    document.head.append(script);
  });

  return plaidScriptPromise;
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}

function friendlyGateLabel(gate: string) {
  if (gate.includes("STRIPE_SECRET_KEY")) {
    return "Stripe API key";
  }

  if (gate.includes("PAYSHIELD_COMMERCIAL_PRICE_ID")) {
    return "Checkout price";
  }

  if (gate.includes("STRIPE_WEBHOOK_SECRET")) {
    return "Stripe webhook";
  }

  if (gate.includes("PLAID_CLIENT_ID") || gate.includes("PLAID_SECRET")) {
    return "Plaid credentials";
  }

  if (gate.includes("TOKEN_VAULT") || gate.includes("token vault")) {
    return "Token vault";
  }

  if (gate.includes("TRANSFER") || gate.includes("transfer")) {
    return "Transfer rail";
  }

  return gate.replace(/^PAYSHIELD_/, "").replace(/_/g, " ").toLowerCase();
}

function compactGateList(gates: string[] | undefined, fallback: string) {
  if (!gates?.length) {
    return fallback;
  }

  const labels = [...new Set(gates.map(friendlyGateLabel))];

  return labels.slice(0, 2).join(", ") + (labels.length > 2 ? " +" : "");
}

function dollarsToCents(value: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.round(parsed * 100));
}

function StateMessage({ state }: { state: ActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <div
      className={`rounded-[8px] border p-3 text-sm font-bold leading-6 ${
        state.status === "error"
          ? "border-[#ff6b35]/35 bg-[#ff6b35]/10 text-[#ffd2c2]"
          : "border-[#39e8ff]/25 bg-[#39e8ff]/10 text-[#dffaff]"
      }`}
    >
      {state.message}
    </div>
  );
}

function RuntimeLane({
  actionLabel,
  body,
  icon: Icon,
  onAction,
  status,
  title,
  tone,
}: {
  actionLabel: string;
  body: string;
  icon: LucideIcon;
  onAction: () => void | Promise<void>;
  status: string;
  title: string;
  tone: "attention" | "ready";
}) {
  return (
    <div className="rounded-[8px] border border-white/10 bg-black/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-[8px] border ${
            tone === "ready"
              ? "border-[#39e8ff]/25 bg-[#39e8ff]/10 text-[#39e8ff]"
              : "border-[#ffb237]/30 bg-[#ffb237]/10 text-[#ffcf72]"
          }`}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <span
          className={`rounded-[8px] px-2.5 py-1 text-xs font-black ${
            tone === "ready"
              ? "bg-[#39e8ff]/10 text-[#dffaff]"
              : "bg-[#ffb237]/10 text-[#ffe4ad]"
          }`}
        >
          {status}
        </span>
      </div>
      <h4 className="mt-4 text-base font-black text-white">{title}</h4>
      <p className="mt-2 min-h-[4.5rem] text-sm leading-6 text-[#aab3c2]">{body}</p>
      <button
        className={`mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-[8px] px-3 text-sm font-black ${
          tone === "ready" ? "brand-button-blue" : "brand-button-primary"
        }`}
        onClick={() => {
          void onAction();
        }}
        type="button"
      >
        {actionLabel}
      </button>
    </div>
  );
}

function OperatorStage({
  action,
  icon: Icon,
  outcome,
  step,
  status,
  title,
  tone,
}: {
  action: string;
  icon: LucideIcon;
  outcome: string;
  step: string;
  status: string;
  title: string;
  tone: "attention" | "ready";
}) {
  return (
    <article className="rounded-[8px] border border-white/10 bg-black/35 p-4">
      <div className="flex items-start justify-between gap-3">
        <span
          className={`grid size-10 place-items-center rounded-[8px] border ${
            tone === "ready"
              ? "border-[#48e6b2]/30 bg-[#48e6b2]/10 text-[#68f0c2]"
              : "border-[#ffb237]/30 bg-[#ffb237]/10 text-[#ffcf72]"
          }`}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <span className="rounded-[8px] border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-xs font-black text-[#d9dde5]">
          {step}
        </span>
      </div>
      <h4 className="mt-4 text-base font-black text-white">{title}</h4>
      <p className="mt-2 text-sm leading-6 text-[#aab3c2]">{action}</p>
      <div className="mt-4 grid gap-2 rounded-[8px] border border-white/10 bg-black/35 p-3">
        <div className="grid grid-cols-[5.4rem_1fr] gap-3 text-xs">
          <span className="font-black uppercase text-[#8f99aa]">Result</span>
          <span className="font-bold text-[#d9dde5]">{outcome}</span>
        </div>
        <div className="grid grid-cols-[5.4rem_1fr] gap-3 text-xs">
          <span className="font-black uppercase text-[#8f99aa]">Status</span>
          <span
            className={`font-black ${
              tone === "ready" ? "text-[#68f0c2]" : "text-[#ffe4ad]"
            }`}
          >
            {status}
          </span>
        </div>
      </div>
    </article>
  );
}

export function MoneyOperationsPanel({
  buckets,
  payees,
}: {
  buckets: BucketBalance[];
  payees: Payee[];
}) {
  const [billingState, setBillingState] = useState<ActionState>({
    message: "",
    status: "idle",
  });
  const [bankState, setBankState] = useState<ActionState>({
    message: "",
    status: "idle",
  });
  const [depositState, setDepositState] = useState<ActionState>({
    message: "",
    status: "idle",
  });
  const [transferState, setTransferState] = useState<ActionState>({
    message: "",
    status: "idle",
  });
  const [readiness, setReadiness] = useState<OperationsReadiness | null>(null);
  const [paycheckAmount, setPaycheckAmount] = useState("3000");
  const [employerName, setEmployerName] = useState("Payroll deposit");
  const [transferAmount, setTransferAmount] = useState("250");
  const [sourceBucketId, setSourceBucketId] = useState("rent");
  const [destinationPayeeId, setDestinationPayeeId] = useState(
    payees[0]?.id ?? "linked_household_account",
  );
  const [depositResult, setDepositResult] = useState<{
    protectedCents?: number;
    safeToSpendCents?: number;
  } | null>(null);
  const selectedBucket = buckets.find((bucket) => bucket.id === sourceBucketId);
  const connectedPayees = useMemo(
    () => [
      ...payees.map((payee) => ({ id: payee.id, name: payee.name })),
      { id: "linked_household_account", name: "Linked household account" },
    ],
    [payees],
  );
  const operationStages = [
    {
      action: "POST /api/app/billing/checkout",
      icon: BadgeDollarSign,
      outcome: "Subscription checkout URL and paid-access webhook record",
      status: readiness?.commercial?.paidAccessReady
        ? "Paid access ready"
        : readiness?.commercial?.checkoutConfigured
          ? "Checkout ready"
          : compactGateList(
              readiness?.commercial?.remainingGates,
              "Add Stripe keys",
            ),
      step: "01",
      title: "Charge the household",
      tone: readiness?.commercial?.checkoutConfigured ? "ready" : "attention",
    },
    {
      action: "Clerk subject -> PayShield household profile",
      icon: LockKeyhole,
      outcome: "User-scoped buckets, payees, detections, and transfers",
      status: readiness?.neobank?.backendConfigured
        ? readiness?.neobank?.postgresSchemaVerified
          ? "Durable profile"
          : "Core online"
        : "Connect core",
      step: "02",
      title: "Scope the account",
      tone: readiness?.neobank?.backendConfigured ? "ready" : "attention",
    },
    {
      action: "POST /api/app/bank-link/token -> Plaid Link",
      icon: Link2,
      outcome: "Bank connection record with vault reference for detection",
      status: readiness?.moneyRails?.bankLinkReady
        ? "Bank link ready"
        : readiness?.moneyRails?.plaidConfigured
          ? "Vault next"
          : compactGateList(
              readiness?.moneyRails?.remainingGates,
              "Add Plaid keys",
            ),
      step: "03",
      title: "Connect the bank source",
      tone: readiness?.moneyRails?.bankLinkReady ? "ready" : "attention",
    },
    {
      action: "POST /api/app/paychecks/detect",
      icon: Radar,
      outcome: "Paycheck journal entry, protected split, Safe to Spend",
      status: readiness?.moneyRails?.paycheckDetectionReady
        ? "Auto detection"
        : "Provider/manual event",
      step: "04",
      title: "Detect income",
      tone: "ready",
    },
    {
      action: "POST /api/app/buckets and /api/app/payees",
      icon: Database,
      outcome: "Custom bucket rules and approved biller controls",
      status: readiness?.neobank?.postgresSchemaVerified
        ? "Postgres ledger"
        : "Rule engine active",
      step: "05",
      title: "Protect the ledger",
      tone: "ready",
    },
    {
      action: "POST /api/app/transfers and /api/card/authorize",
      icon: CreditCard,
      outcome: "Transfer intent or card decision against protected funds",
      status: readiness?.moneyRails?.transferReady
        ? "Money movement ready"
        : readiness?.moneyRails?.transferConfigured
          ? "Approvals next"
          : "Decision engine active",
      step: "06",
      title: "Move or decline",
      tone: readiness?.moneyRails?.transferReady ? "ready" : "attention",
    },
  ] satisfies Array<Parameters<typeof OperatorStage>[0]>;

  useEffect(() => {
    let cancelled = false;

    async function loadReadiness() {
      try {
        const response = await fetch("/api/health", {
          headers: { accept: "application/json" },
        });
        const payload = (await response.json().catch(() => ({}))) as
          OperationsReadiness;

        if (!cancelled) {
          setReadiness(payload);
        }
      } catch {
        if (!cancelled) {
          setReadiness(null);
        }
      }
    }

    void loadReadiness();

    return () => {
      cancelled = true;
    };
  }, []);

  async function startPaidAccess() {
    setBillingState({
      message: "Creating secure checkout...",
      status: "loading",
    });

    try {
      const response = await fetch("/api/app/billing/checkout", {
        body: JSON.stringify({
          cancelPath: "/app?billing=cancelled",
          successPath: "/app?billing=active",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        readiness?: { missing?: string[] };
        url?: string;
      };

      if (!response.ok || !payload.url) {
        setBillingState({
          message:
            payload.error ||
            `Checkout is missing ${payload.readiness?.missing?.join(", ") || "Stripe configuration"}.`,
          status: "error",
        });
        return;
      }

      setBillingState({
        message: "Redirecting to checkout.",
        status: "ready",
      });
      window.location.href = payload.url;
    } catch {
      setBillingState({
        message: "Checkout could not be started.",
        status: "error",
      });
    }
  }

  async function startBankLink() {
    setBankState({
      message: "Preparing secure bank connection...",
      status: "loading",
    });

    try {
      const response = await fetch("/api/app/bank-link/token", {
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        linkToken?: string;
        readiness?: { missing?: string[] };
      };

      if (!response.ok || !payload.linkToken) {
        setBankState({
          message:
            payload.error ||
            `Bank connection is missing ${payload.readiness?.missing?.join(", ") || "Plaid configuration"}.`,
          status: "error",
        });
        return;
      }

      await loadPlaidScript();

      if (!window.Plaid) {
        throw new Error("Plaid Link was not available after loading.");
      }

      const handler = window.Plaid.create({
        onExit: () => {
          setBankState({
            message: "Bank connection was closed before completion.",
            status: "idle",
          });
        },
        onSuccess: async (publicToken, metadata) => {
          const exchange = await fetch("/api/app/bank-link/exchange", {
            body: JSON.stringify({
              accountId: metadata.account?.id,
              accountMask: metadata.account?.mask,
              accountName: metadata.account?.name,
              institutionName: metadata.institution?.name,
              publicToken,
            }),
            headers: { "content-type": "application/json" },
            method: "POST",
          });
          const exchangePayload = (await exchange.json().catch(() => ({}))) as {
            bankConnection?: { institutionName?: string };
            error?: string;
            message?: string;
          };

          if (!exchange.ok) {
            setBankState({
              message: exchangePayload.error || "Bank link exchange failed.",
              status: "error",
            });
            return;
          }

          setBankState({
            message:
              exchangePayload.message ||
              `${exchangePayload.bankConnection?.institutionName || "Bank"} connected.`,
            status: "ready",
          });
        },
        token: payload.linkToken,
      });

      handler.open();
    } catch (error) {
      setBankState({
        message:
          error instanceof Error
            ? error.message
            : "Bank connection could not be started.",
        status: "error",
      });
    }
  }

  async function detectPaycheck() {
    const amountCents = dollarsToCents(paycheckAmount);

    setDepositState({
      message: "Running paycheck detection and bucket split...",
      status: "loading",
    });

    try {
      const response = await fetch("/api/app/paychecks/detect", {
        body: JSON.stringify({
          amountCents,
          employerName,
          idempotencyKey: `ui-paycheck-${crypto.randomUUID()}`,
          receivedAt: new Date().toISOString(),
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        protectedCents?: number;
        safeToSpendCents?: number;
      };

      if (!response.ok) {
        setDepositState({
          message: payload.error || "Paycheck was not detected.",
          status: "error",
        });
        return;
      }

      setDepositResult(payload);
      setDepositState({
        message: payload.message || "Paycheck detected.",
        status: "ready",
      });
    } catch {
      setDepositState({
        message: "Paycheck detection failed.",
        status: "error",
      });
    }
  }

  async function createTransfer() {
    const amountCents = dollarsToCents(transferAmount);

    setTransferState({
      message: "Validating protected transfer intent...",
      status: "loading",
    });

    try {
      const response = await fetch("/api/app/transfers", {
        body: JSON.stringify({
          amountCents,
          destinationPayeeId,
          idempotencyKey: `ui-transfer-${crypto.randomUUID()}`,
          sourceBucketId,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        providerTransfer?: { status?: string };
      };

      if (!response.ok) {
        setTransferState({
          message: payload.error || "Transfer intent was rejected.",
          status: "error",
        });
        return;
      }

      setTransferState({
        message: `${payload.message || "Transfer intent created."} Provider status: ${
          payload.providerTransfer?.status || "blocked"
        }.`,
        status: "ready",
      });
    } catch {
      setTransferState({
        message: "Transfer intent failed.",
        status: "error",
      });
    }
  }

  return (
    <section
      className="relative z-10 border-b border-white/10 bg-[#07090b]"
      id="money-operations"
    >
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-5 lg:grid-cols-[0.82fr_1.18fr]">
          <div className="accent-rule pt-5">
            <p className="inline-flex items-center gap-2 rounded-[8px] border border-[#39e8ff]/30 bg-[#39e8ff]/10 px-3 py-2 text-sm font-black uppercase tracking-[0.14em] text-[#dffaff]">
              <Landmark className="size-4" aria-hidden="true" />
              Money operations
            </p>
            <h2 className="mt-4 text-3xl font-black leading-tight text-white sm:text-4xl">
              The revenue and money-control operating lane.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#c9d0da]">
              This is how PayShield makes money and controls the paycheck:
              charge the household, bind that customer to an account, connect
              the bank source, detect income, split the ledger, and validate
              every transfer or card decision against protected funds.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="brand-panel rounded-[8px] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="brand-kicker">Commercial access</p>
                  <h3 className="mt-1 text-xl font-black text-white">
                    Activate household billing.
                  </h3>
                </div>
                <BadgeDollarSign className="size-6 text-[#ffb237]" aria-hidden="true" />
              </div>
              <p className="mt-3 text-sm leading-6 text-[#aab3c2]">
                Stripe Checkout runs paid access without storing card data in
                PayShield.
              </p>
              <button
                className="brand-button-primary mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] px-4 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50"
                disabled={billingState.status === "loading"}
                onClick={startPaidAccess}
                type="button"
              >
                {billingState.status === "loading" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <BadgeDollarSign className="size-4" aria-hidden="true" />
                )}
                Activate paid access
              </button>
              <div className="mt-3">
                <StateMessage state={billingState} />
              </div>
            </div>

            <div className="brand-panel rounded-[8px] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="brand-kicker">Bank connection</p>
                  <h3 className="mt-1 text-xl font-black text-white">
                    Connect the household source.
                  </h3>
                </div>
                <Link2 className="size-6 text-[#39e8ff]" aria-hidden="true" />
              </div>
              <p className="mt-3 text-sm leading-6 text-[#aab3c2]">
                Plaid Link creates the user-approved connection for income
                detection and transfer handoff.
              </p>
              <button
                className="brand-button-blue mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] px-4 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50"
                disabled={bankState.status === "loading"}
                onClick={startBankLink}
                type="button"
              >
                {bankState.status === "loading" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Link2 className="size-4" aria-hidden="true" />
                )}
                Connect bank
              </button>
              <div className="mt-3">
                <StateMessage state={bankState} />
              </div>
            </div>
          </div>
        </div>

        <div className="brand-panel rounded-[8px] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="brand-kicker">Commercial operating sequence</p>
              <h3 className="mt-1 text-2xl font-black text-white">
                Charge first. Connect once. Protect every paycheck after that.
              </h3>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#aab3c2]">
                Each stage creates a business artifact: checkout session,
                bank-link token, paycheck split record, transfer intent, or
                ledger decision. Provider credentials and approvals determine
                whether the stage executes with the provider or records a
                controlled operations intent.
              </p>
            </div>
            <div className="grid min-w-[12rem] gap-2 rounded-[8px] border border-[#48e6b2]/25 bg-[#48e6b2]/10 p-3">
              <p className="brand-kicker">Revenue model</p>
              <p className="text-2xl font-black text-white">
                {readiness?.commercial?.priceLabel ?? "$19/month"}
              </p>
              <p className="text-xs font-bold text-[#c9d0da]">
                {readiness?.commercial?.mode === "payment_link"
                  ? "Stripe payment link"
                  : "Stripe Checkout"}{" "}
                {"->"}{" "}
                {readiness?.commercial?.webhookEndpointPath ??
                  "/api/app/billing/webhook"}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {operationStages.map((stage) => (
              <OperatorStage key={stage.step} {...stage} />
            ))}
          </div>
        </div>

        <div className="brand-panel rounded-[8px] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="brand-kicker">Money engine</p>
              <h3 className="mt-1 text-2xl font-black text-white">
                Charge, connect, detect, protect, move.
              </h3>
            </div>
            <div className="rounded-[8px] border border-[#39e8ff]/25 bg-[#39e8ff]/10 px-3 py-2 text-sm font-black text-[#dffaff]">
              {readiness?.neobank?.mode ?? "loading"} mode
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <RuntimeLane
              actionLabel="Start checkout"
              body={`Customer billing runs through ${
                readiness?.commercial?.mode === "payment_link"
                  ? "a Stripe payment link"
                  : "Stripe Checkout"
              } at ${readiness?.commercial?.priceLabel ?? "$19/month"}.`}
              icon={BadgeDollarSign}
              onAction={startPaidAccess}
              status={
                readiness?.commercial?.paidAccessReady
                  ? "Revenue ready"
                  : readiness?.commercial?.checkoutConfigured
                    ? "Webhook pending"
                    : compactGateList(
                        readiness?.commercial?.remainingGates,
                        "Stripe setup needed",
                      )
              }
              tone={readiness?.commercial?.checkoutConfigured ? "ready" : "attention"}
              title="Make money"
            />
            <RuntimeLane
              actionLabel="Connect bank"
              body={`Plaid Link is the user-approved connection for income detection in ${
                readiness?.moneyRails?.plaidEnv ?? "sandbox"
              } mode.`}
              icon={Link2}
              onAction={startBankLink}
              status={
                readiness?.moneyRails?.bankLinkReady
                  ? "Bank link ready"
                  : readiness?.moneyRails?.plaidConfigured
                    ? "Token vault needed"
                    : compactGateList(
                        readiness?.moneyRails?.remainingGates,
                        "Plaid setup needed",
                      )
              }
              tone={readiness?.moneyRails?.bankLinkReady ? "ready" : "attention"}
              title="Connect banks"
            />
            <RuntimeLane
              actionLabel="Run detection"
              body="Income events split into protected buckets before Safe to Spend is recalculated."
              icon={Radar}
              onAction={detectPaycheck}
              status={
                readiness?.moneyRails?.paycheckDetectionReady
                  ? "Auto detection ready"
                  : readiness?.moneyRails?.detectionMode === "plaid_transactions_sync"
                    ? "Vault needed"
                    : "Manual/provider events"
              }
              tone="ready"
              title="Detect paychecks"
            />
            <RuntimeLane
              actionLabel="Create intent"
              body="Transfers validate source bucket funds and produce a provider handoff record before execution."
              icon={ArrowRightLeft}
              onAction={createTransfer}
              status={
                readiness?.moneyRails?.transferReady
                  ? "Transfers ready"
                  : readiness?.moneyRails?.transferConfigured
                    ? "Live gates pending"
                    : "Intent validation active"
              }
              tone={readiness?.moneyRails?.transferReady ? "ready" : "attention"}
              title="Move protected funds"
            />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="brand-panel rounded-[8px] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="brand-kicker">Paycheck detection</p>
                <h3 className="mt-1 text-xl font-black text-white">
                  Identify income and split it first.
                </h3>
              </div>
              <Radar className="size-6 text-[#39e8ff]" aria-hidden="true" />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_0.65fr]">
              <label className="grid gap-2 text-sm font-black text-white">
                Employer
                <input
                  className="h-11 rounded-[8px] border border-white/10 bg-black/45 px-3 text-sm font-bold text-white outline-none transition focus:border-[#39e8ff]"
                  maxLength={80}
                  onChange={(event) => setEmployerName(event.target.value)}
                  value={employerName}
                />
              </label>
              <label className="grid gap-2 text-sm font-black text-white">
                Amount
                <input
                  className="h-11 rounded-[8px] border border-white/10 bg-black/45 px-3 text-sm font-bold text-white outline-none transition focus:border-[#39e8ff]"
                  inputMode="decimal"
                  min="0"
                  onChange={(event) => setPaycheckAmount(event.target.value)}
                  type="number"
                  value={paycheckAmount}
                />
              </label>
            </div>
            <button
              className="brand-button-primary mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] px-4 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50"
              disabled={
                !employerName ||
                dollarsToCents(paycheckAmount) <= 0 ||
                depositState.status === "loading"
              }
              onClick={detectPaycheck}
              type="button"
            >
              {depositState.status === "loading" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Radar className="size-4" aria-hidden="true" />
              )}
              Run detection
            </button>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="brand-panel-soft rounded-[8px] p-3">
                <p className="brand-kicker">Protected</p>
                <p className="mt-2 text-2xl font-black text-white">
                  {formatMoney(depositResult?.protectedCents ?? 0)}
                </p>
              </div>
              <div className="brand-panel-soft rounded-[8px] p-3">
                <p className="brand-kicker">Safe to Spend</p>
                <p className="mt-2 text-2xl font-black text-white">
                  {formatMoney(depositResult?.safeToSpendCents ?? 0)}
                </p>
              </div>
            </div>
            <div className="mt-3">
              <StateMessage state={depositState} />
            </div>
          </div>

          <div className="brand-panel rounded-[8px] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="brand-kicker">Protected transfers</p>
                <h3 className="mt-1 text-xl font-black text-white">
                  Validate funds before release.
                </h3>
              </div>
              <ArrowRightLeft className="size-6 text-[#ffb237]" aria-hidden="true" />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-black text-white">
                Source bucket
                <select
                  className="h-11 rounded-[8px] border border-white/10 bg-black/45 px-3 text-sm font-bold text-white outline-none transition focus:border-[#39e8ff]"
                  onChange={(event) => setSourceBucketId(event.target.value)}
                  value={sourceBucketId}
                >
                  {buckets.map((bucket) => (
                    <option key={bucket.id} value={bucket.id}>
                      {bucket.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-black text-white">
                Destination
                <select
                  className="h-11 rounded-[8px] border border-white/10 bg-black/45 px-3 text-sm font-bold text-white outline-none transition focus:border-[#39e8ff]"
                  onChange={(event) => setDestinationPayeeId(event.target.value)}
                  value={destinationPayeeId}
                >
                  {connectedPayees.map((payee) => (
                    <option key={payee.id} value={payee.id}>
                      {payee.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-black text-white">
                Amount
                <input
                  className="h-11 rounded-[8px] border border-white/10 bg-black/45 px-3 text-sm font-bold text-white outline-none transition focus:border-[#39e8ff]"
                  inputMode="decimal"
                  min="0"
                  onChange={(event) => setTransferAmount(event.target.value)}
                  type="number"
                  value={transferAmount}
                />
              </label>
              <div className="rounded-[8px] border border-white/10 bg-black/35 p-3">
                <p className="brand-kicker">Available</p>
                <p className="mt-2 text-lg font-black text-white">
                  {formatMoney(selectedBucket?.availableCents ?? 0)}
                </p>
              </div>
            </div>

            <button
              className="brand-button-blue mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] px-4 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50"
              disabled={
                dollarsToCents(transferAmount) <= 0 ||
                transferState.status === "loading"
              }
              onClick={createTransfer}
              type="button"
            >
              {transferState.status === "loading" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="size-4" aria-hidden="true" />
              )}
              Create transfer intent
            </button>

            <div className="mt-3">
              <StateMessage state={transferState} />
            </div>
            <div className="mt-3 flex items-start gap-3 rounded-[8px] border border-[#ffb237]/25 bg-[#ffb237]/10 p-3">
              <ShieldAlert className="mt-0.5 size-5 shrink-0 text-[#ffcf72]" aria-hidden="true" />
              <p className="text-sm leading-6 text-[#ffe4ad]">
                Transfer execution requires active credentials, ledger
                persistence, support runbooks, and approvals.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
