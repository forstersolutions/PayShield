"use client";

import {
  ArrowRightLeft,
  BadgeDollarSign,
  CheckCircle2,
  CreditCard,
  FileDown,
  Landmark,
  Link2,
  Loader2,
  Radar,
  ReceiptText,
  RefreshCw,
  ShieldAlert,
  Split,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { BucketBalance, BucketId, Payee } from "@/app/lib/neobank/types.ts";
import { friendlyGateLabel } from "@/app/lib/readiness-gates.ts";

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
    activationCoreReady?: boolean;
    activationCoreServiceAuthConfigured?: boolean;
    checkoutConfigured?: boolean;
    checkoutOperationalReady?: boolean;
    mode?: string;
    paidAccessReady?: boolean;
    paymentLinkMode?: string;
    priceLabel?: string;
    productionLiveStripeReady?: boolean;
    remainingGates?: string[];
    webhookEndpointPath?: string;
  };
  moneyRails?: {
    bankLinkReady?: boolean;
    detectionMode?: string;
    paycheckDetectionReady?: boolean;
    plaidConfigured?: boolean;
    plaidEnv?: string;
    providerAdapterConfigured?: boolean;
    providerAdapterMissing?: string[];
    providerWebhookSigningConfigured?: boolean;
    remainingGates?: string[];
    tokenVaultEncryptionConfigured?: boolean;
    tokenVaultEncryptionReady?: boolean;
    tokenVaultConfigured?: boolean;
    tokenVaultHandoffReady?: boolean;
    tokenVaultWebhookSource?: string;
    tokenVaultStoreReady?: boolean;
    transactionSyncReady?: boolean;
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

type OperationTimelineItem = {
  amountCents?: number | null;
  at?: string | null;
  detail?: string | null;
  id: string;
  label: string;
  rail: string;
  status: string;
};

type PaycheckDetectionRule = {
  amountRangeCents?: {
    max?: number | null;
    min?: number | null;
  };
  expectedFrequency?: string;
  id?: string;
  match?: {
    employerNamePattern?: string | null;
    transactionNamePattern?: string | null;
  };
  priority?: number;
  providerName?: string;
  ruleName?: string;
  status?: string;
};

type DirectDepositSetup = {
  accountLast4?: string;
  accountName?: string;
  idempotencyKey?: string;
  providerStatus?: string;
  routingLast4?: string;
  status?: string;
};

type ReconciliationException = {
  id?: string;
  reasonCode?: string | null;
  severity?: string;
  status?: string;
  summary?: string;
};

type CheckoutIntent = {
  checkoutMode?: string;
  idempotencyKey?: string;
  priceLabel?: string | null;
  providerCheckoutId?: string | null;
  status?: string;
};

type RevenueRail = {
  blockers?: string[];
  canRunNow?: boolean;
  endpoint: string;
  key: string;
  label: string;
  ownerAction: string;
  provider: string;
  state: string;
  userAction: string;
  unlocks: string;
};

type RevenueAndRails = {
  operatingSequence?: string[];
  rails?: RevenueRail[];
  summary?: {
    bankLinkReady?: boolean;
    detectionMode?: string;
    liveMoneyReady?: boolean;
    priceLabel?: string;
    protectedCents?: number;
    revenueReady?: boolean;
    safeToSpendCents?: number;
    transferReady?: boolean;
  };
};

type OperationsPacket = {
  balances?: {
    protectedCents?: number;
    safeToSpendCents?: number;
    totalCents?: number;
  };
  commercialAccess?: {
    checkoutIntentId?: string | null;
    checkoutIntentStatus?: string | null;
    currentPeriodEnd?: string | null;
    mode?: string;
    priceLabel?: string;
    providerCustomerId?: string | null;
    readyForCheckout?: boolean;
    state?: string;
    subscriptionStatus?: string | null;
  };
  directDeposit?: {
    accountLast4?: string;
    accountName?: string;
    providerStatus?: string;
    routingLast4?: string;
  };
  operationalAudit?: {
    auditFound?: boolean;
    persistence?: string;
  };
  operations?: Record<string, unknown[]>;
  revenueAndRails?: RevenueAndRails;
  statusCards?: Array<{
    key: string;
    label: string;
    state: string;
  }>;
  timeline?: OperationTimelineItem[];
};

declare global {
  interface Window {
    Plaid?: {
      create(input: PlaidCreateInput): PlaidHandler;
    };
  }
}

let plaidScriptPromise: Promise<void> | null = null;
const localOperationKey = "payshield.money-operations.timeline.v1";

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

function readLocalTimeline() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(localOperationKey);
    const parsed = stored ? JSON.parse(stored) : [];

    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is OperationTimelineItem =>
            item &&
            typeof item === "object" &&
            typeof item.id === "string" &&
            typeof item.label === "string" &&
            typeof item.rail === "string" &&
            typeof item.status === "string",
        )
      : [];
  } catch {
    return [];
  }
}

function recordCount(packet: OperationsPacket | null) {
  if (!packet?.operations) {
    return 0;
  }

  return Object.values(packet.operations).reduce(
    (total, records) => total + (Array.isArray(records) ? records.length : 0),
    0,
  );
}

function timelineAmount(item: OperationTimelineItem) {
  return typeof item.amountCents === "number" && item.amountCents > 0
    ? ` · ${formatMoney(item.amountCents)}`
    : "";
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

function ActivationRail({
  actionLabel,
  blockers,
  body,
  endpoint,
  icon: Icon,
  metric,
  onAction,
  state,
  status,
  title,
  tone,
}: {
  actionLabel: string;
  blockers: string[];
  body: string;
  endpoint: string;
  icon: LucideIcon;
  metric: string;
  onAction: () => void | Promise<void>;
  state: ActionState;
  status: string;
  title: string;
  tone: "attention" | "ready";
}) {
  return (
    <div
      className={`grid gap-3 rounded-[8px] border p-4 transition sm:grid-cols-[2.75rem_minmax(0,1fr)_auto] ${
        tone === "ready"
          ? "border-[#68f0c2]/25 bg-[#68f0c2]/[0.07]"
          : "border-[#ffb237]/25 bg-[#ffb237]/[0.075]"
      }`}
    >
      <span
        className={`grid size-11 place-items-center rounded-[8px] border ${
          tone === "ready"
            ? "border-[#68f0c2]/25 bg-black/30 text-[#68f0c2]"
            : "border-[#ffb237]/25 bg-black/30 text-[#ffcf72]"
        }`}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="text-xs font-black uppercase text-[#8f99aa]">
          {metric}
        </span>
        <span className="mt-1 block text-base font-black text-white">
          {title}
        </span>
        <span className="mt-1 block text-sm leading-6 text-[#c9d0da]">
          {body}
        </span>
        <span className="mt-2 block overflow-x-auto font-mono text-[0.68rem] font-black uppercase text-[#39e8ff]">
          {endpoint}
        </span>
      </span>
      <span className="grid gap-2 sm:min-w-[11rem]">
        <span
          className={`inline-flex min-h-8 items-center justify-center rounded-[8px] px-3 text-center text-xs font-black capitalize ${
            tone === "ready"
              ? "bg-[#68f0c2]/10 text-[#9af7d5]"
              : "bg-[#ffb237]/10 text-[#ffe4ad]"
          }`}
        >
          {status.replace(/_/g, " ")}
        </span>
        <button
          className={`inline-flex h-10 items-center justify-center gap-2 rounded-[8px] px-3 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50 ${
            tone === "ready" ? "brand-button-blue" : "brand-button-primary"
          }`}
          disabled={state.status === "loading"}
          onClick={() => {
            void onAction();
          }}
          type="button"
        >
          {state.status === "loading" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Icon className="size-4" aria-hidden="true" />
          )}
          {actionLabel}
        </button>
      </span>
      <div className="grid gap-2 sm:col-span-3 sm:pl-[3.55rem]">
        {blockers.length > 0 ? (
          <p className="text-xs font-bold leading-5 text-[#ffe4ad]">
            Needs {blockers.slice(0, 3).join(", ")}
            {blockers.length > 3 ? " +" : ""}.
          </p>
        ) : (
          <p className="text-xs font-bold leading-5 text-[#9af7d5]">
            Ready to run from this screen.
          </p>
        )}
        <StateMessage state={state} />
      </div>
    </div>
  );
}

export function MoneyOperationsPanel({
  buckets,
  initialOperations,
  initialReadiness,
  payees,
}: {
  buckets: BucketBalance[];
  initialOperations?: OperationsPacket;
  initialReadiness?: OperationsReadiness;
  payees: Payee[];
}) {
  const [billingState, setBillingState] = useState<ActionState>({
    message: "",
    status: "idle",
  });
  const [portalState, setPortalState] = useState<ActionState>({
    message: "",
    status: "idle",
  });
  const [bankState, setBankState] = useState<ActionState>({
    message: "",
    status: "idle",
  });
  const [directDepositState, setDirectDepositState] = useState<ActionState>({
    message: "",
    status: "idle",
  });
  const [syncState, setSyncState] = useState<ActionState>({
    message: "",
    status: "idle",
  });
  const [bucketState, setBucketState] = useState<ActionState>({
    message: "",
    status: "idle",
  });
  const [depositState, setDepositState] = useState<ActionState>({
    message: "",
    status: "idle",
  });
  const [detectionRuleState, setDetectionRuleState] = useState<ActionState>({
    message: "",
    status: "idle",
  });
  const [transferState, setTransferState] = useState<ActionState>({
    message: "",
    status: "idle",
  });
  const [cardState, setCardState] = useState<ActionState>({
    message: "",
    status: "idle",
  });
  const [readiness, setReadiness] = useState<OperationsReadiness | null>(
    initialReadiness ?? null,
  );
  const [operations, setOperations] = useState<OperationsPacket | null>(
    initialOperations ?? null,
  );
  const [localTimeline, setLocalTimeline] = useState<OperationTimelineItem[]>([]);
  const [paycheckAmount, setPaycheckAmount] = useState("3000");
  const [employerName, setEmployerName] = useState("Payroll deposit");
  const [ruleName, setRuleName] = useState("Primary payroll");
  const [ruleEmployerPattern, setRuleEmployerPattern] = useState("Payroll");
  const [ruleMinimumAmount, setRuleMinimumAmount] = useState("500");
  const [ruleMaximumAmount, setRuleMaximumAmount] = useState("");
  const [ruleFrequency, setRuleFrequency] = useState("biweekly");
  const [transferAmount, setTransferAmount] = useState("250");
  const protectedTransferBuckets = useMemo(
    () => buckets.filter((bucket) => bucket.id !== "safe_spending"),
    [buckets],
  );
  const [sourceBucketId, setSourceBucketId] = useState<BucketId>(
    protectedTransferBuckets[0]?.id ?? "rent",
  );
  const [destinationPayeeId, setDestinationPayeeId] = useState(
    payees.find(
      (payee) =>
        payee.status === "approved" &&
        payee.allowedBucketId === (protectedTransferBuckets[0]?.id ?? "rent"),
    )?.id ?? "",
  );
  const [depositResult, setDepositResult] = useState<{
    protectedCents?: number;
    safeToSpendCents?: number;
  } | null>(null);
  const selectedBucket =
    protectedTransferBuckets.find((bucket) => bucket.id === sourceBucketId) ??
    protectedTransferBuckets[0];
  const approvedPayees = useMemo(
    () => payees.filter((payee) => payee.status === "approved"),
    [payees],
  );
  const bucketPayees = useMemo(
    () =>
      selectedBucket
        ? approvedPayees.filter(
            (payee) => payee.allowedBucketId === selectedBucket.id,
          )
        : [],
    [approvedPayees, selectedBucket],
  );
  const validDestinationPayee =
    bucketPayees.find((payee) => payee.id === destinationPayeeId) ??
    bucketPayees[0];
  const transferAmountCents = dollarsToCents(transferAmount);
  const transferLimitCents = Math.min(
    selectedBucket?.availableCents ?? 0,
    validDestinationPayee?.maxCents ?? 0,
  );
  const transferReady =
    transferAmountCents > 0 &&
    transferAmountCents <= transferLimitCents &&
    Boolean(selectedBucket && validDestinationPayee) &&
    transferState.status !== "loading";
  const ruleMinimumCents = dollarsToCents(ruleMinimumAmount);
  const ruleMaximumCents = ruleMaximumAmount
    ? dollarsToCents(ruleMaximumAmount)
    : null;
  const detectionRules =
    (operations?.operations?.paycheckDetectionRules as
      | PaycheckDetectionRule[]
      | undefined) ?? [];
  const directDepositSetups =
    (operations?.operations?.directDepositSetups as
      | DirectDepositSetup[]
      | undefined) ?? [];
  const reconciliationExceptions =
    (operations?.operations?.reconciliationExceptions as
      | ReconciliationException[]
      | undefined) ?? [];
  const openExceptionCount = reconciliationExceptions.filter(
    (exception) => exception.status === "open",
  ).length;

  function changeTransferSource(nextBucketId: BucketId) {
    setSourceBucketId(nextBucketId);
    setDestinationPayeeId(
      approvedPayees.find((payee) => payee.allowedBucketId === nextBucketId)
        ?.id ?? "",
    );
  }

  function focusProductSection(sectionId: string, setState: (state: ActionState) => void) {
    const element = document.getElementById(sectionId);

    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      setState({
        message: "Opened the control surface for this money workflow.",
        status: "ready",
      });
      return;
    }

    setState({
      message: "The control surface could not be found on this page.",
      status: "error",
    });
  }

  useEffect(() => {
    let cancelled = false;

    async function loadReadiness() {
      try {
        const [healthResponse, operationsResponse] = await Promise.all([
          fetch("/api/health", {
            headers: { accept: "application/json" },
          }),
          fetch("/api/app/operations", {
            headers: { accept: "application/json" },
          }),
        ]);
        const payload = (await healthResponse.json().catch(() => ({}))) as
          OperationsReadiness;
        const operationsPayload = (await operationsResponse
          .json()
          .catch(() => ({}))) as OperationsPacket;

        if (!cancelled) {
          setReadiness(payload);
          if (operationsResponse.ok) {
            setOperations(operationsPayload);
          }
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

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setLocalTimeline(readLocalTimeline());
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

  function appendOperation(item: Omit<OperationTimelineItem, "at" | "id">) {
    const nextItem = {
      ...item,
      at: new Date().toISOString(),
      id: `ui-${item.rail}-${crypto.randomUUID()}`,
    };

    setLocalTimeline((current) => {
      const next = [nextItem, ...current].slice(0, 12);

      window.localStorage.setItem(localOperationKey, JSON.stringify(next));
      return next;
    });
  }

  async function startPaidAccess() {
    setBillingState({
      message: "Creating secure checkout...",
      status: "loading",
    });

    try {
      const response = await fetch("/api/app/billing/checkout", {
        body: JSON.stringify({
          cancelPath: "/app?billing=cancelled",
          idempotencyKey: `ui-checkout-${crypto.randomUUID()}`,
          successPath: "/app?billing=active",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        checkoutIntent?: CheckoutIntent;
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
        appendOperation({
          detail: payload.error || "Stripe configuration required",
          label: "Checkout intent",
          rail: "billing",
          status: payload.checkoutIntent?.status || "needs_setup",
        });
        return;
      }

      setBillingState({
        message: "Checkout intent recorded. Redirecting to checkout.",
        status: "ready",
      });
      appendOperation({
        detail: payload.checkoutIntent?.priceLabel || "Paid access",
        label: "Checkout intent",
        rail: "billing",
        status: payload.checkoutIntent?.status || "checkout_ready",
      });
      window.location.assign(payload.url);
    } catch {
      setBillingState({
        message: "Checkout could not be started.",
        status: "error",
      });
      appendOperation({
        detail: "Checkout request failed",
        label: "Paid access",
        rail: "billing",
        status: "error",
      });
    }
  }

  async function openBillingPortal() {
    setPortalState({
      message: "Opening billing management...",
      status: "loading",
    });

    try {
      const response = await fetch("/api/app/billing/portal", {
        body: JSON.stringify({
          returnPath: "/app?billing=manage",
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
        setPortalState({
          message:
            payload.error ||
            `Billing management is missing ${payload.readiness?.missing?.join(", ") || "Stripe customer state"}.`,
          status: "error",
        });
        appendOperation({
          detail: payload.error || "Billing portal unavailable",
          label: "Billing portal",
          rail: "billing",
          status: "blocked",
        });
        return;
      }

      setPortalState({
        message: "Billing portal ready. Redirecting.",
        status: "ready",
      });
      appendOperation({
        detail: "Stripe customer portal",
        label: "Billing portal",
        rail: "billing",
        status: "created",
      });
      window.location.assign(payload.url);
    } catch {
      setPortalState({
        message: "Billing management could not be opened.",
        status: "error",
      });
      appendOperation({
        detail: "Billing portal request failed",
        label: "Billing portal",
        rail: "billing",
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
        appendOperation({
          detail: payload.error || "Plaid configuration required",
          label: "Bank connection",
          rail: "bank_link",
          status: "needs_setup",
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
          appendOperation({
            detail:
              exchangePayload.bankConnection?.institutionName ||
              "Linked institution",
            label: "Bank connection",
            rail: "bank_link",
            status: "connected",
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
      appendOperation({
        detail:
          error instanceof Error
            ? error.message
            : "Bank connection request failed",
        label: "Bank connection",
        rail: "bank_link",
        status: "error",
      });
    }
  }

  async function startDirectDepositSetup() {
    setDirectDepositState({
      message: "Preparing paycheck routing setup...",
      status: "loading",
    });

    try {
      const response = await fetch("/api/app/direct-deposit", {
        body: JSON.stringify({
          idempotencyKey: "ui-direct-deposit-primary",
          providerName: "payshield",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        directDeposit?: DirectDepositSetup;
        error?: string;
        message?: string;
        setup?: DirectDepositSetup;
      };

      if (!response.ok && response.status !== 423) {
        setDirectDepositState({
          message: payload.error || "Paycheck routing setup failed.",
          status: "error",
        });
        appendOperation({
          detail: payload.error || "Direct deposit setup",
          label: "Paycheck routing",
          rail: "direct_deposit",
          status: "rejected",
        });
        return;
      }

      const setup =
        payload.setup ??
        ({
          ...payload.directDeposit,
          idempotencyKey: "ui-direct-deposit-primary",
          status: response.ok ? "ready" : "blocked",
        } satisfies DirectDepositSetup);

      setOperations((current) => ({
        ...(current ?? {}),
        operations: {
          ...(current?.operations ?? {}),
          directDepositSetups: [
            setup,
            ...directDepositSetups.filter(
              (item) => item.idempotencyKey !== setup.idempotencyKey,
            ),
          ],
        },
      }));
      setDirectDepositState({
        message: payload.message || "Paycheck routing setup recorded.",
        status: "ready",
      });
      appendOperation({
        detail: setup.accountName || "Paycheck routing",
        label: "Paycheck routing",
        rail: "direct_deposit",
        status: setup.status || (response.ok ? "ready" : "blocked"),
      });
    } catch {
      setDirectDepositState({
        message: "Paycheck routing setup failed.",
        status: "error",
      });
      appendOperation({
        detail: "Paycheck routing request failed",
        label: "Paycheck routing",
        rail: "direct_deposit",
        status: "error",
      });
    }
  }

  async function syncBankTransactions() {
    setSyncState({
      message: "Syncing linked-bank activity...",
      status: "loading",
    });

    try {
      const response = await fetch("/api/app/paychecks/sync", {
        body: JSON.stringify({
          maxPages: 3,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        detectionCount?: number;
        error?: string;
        skippedCount?: number;
        sync?: {
          addedCount?: number;
          modifiedCount?: number;
          pageCount?: number;
          removedCount?: number;
        };
      };

      if (!response.ok) {
        setSyncState({
          message:
            payload.error ||
            "Linked-bank activity could not be synced from the core.",
          status: "error",
        });
        appendOperation({
          detail: payload.error || "Transaction sync unavailable",
          label: "Bank activity sync",
          rail: "transaction_sync",
          status: "blocked",
        });
        return;
      }

      const syncedCount =
        (payload.sync?.addedCount ?? 0) + (payload.sync?.modifiedCount ?? 0);

      setSyncState({
        message: `${syncedCount} transactions synced. ${
          payload.detectionCount ?? 0
        } paycheck deposits posted${
          payload.skippedCount ? `, ${payload.skippedCount} queued for review` : ""
        }.`,
        status: "ready",
      });
      appendOperation({
        detail: `${syncedCount} transactions · ${payload.detectionCount ?? 0} paycheck splits`,
        label: "Bank activity sync",
        rail: "transaction_sync",
        status: payload.detectionCount ? "processed" : "synced",
      });
    } catch {
      setSyncState({
        message: "Linked-bank activity sync failed.",
        status: "error",
      });
      appendOperation({
        detail: "Transaction sync request failed",
        label: "Bank activity sync",
        rail: "transaction_sync",
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
        appendOperation({
          amountCents,
          detail: payload.error || employerName,
          label: "Paycheck detection",
          rail: "income",
          status: "rejected",
        });
        return;
      }

      setDepositResult(payload);
      setDepositState({
        message: payload.message || "Paycheck detected.",
        status: "ready",
      });
      appendOperation({
        amountCents,
        detail: employerName,
        label: "Paycheck detection",
        rail: "income",
        status: "split_posted",
      });
    } catch {
      setDepositState({
        message: "Paycheck detection failed.",
        status: "error",
      });
      appendOperation({
        amountCents,
        detail: employerName,
        label: "Paycheck detection",
        rail: "income",
        status: "error",
      });
    }
  }

  async function saveDetectionRule() {
    const minimumAmountCents = dollarsToCents(ruleMinimumAmount);
    const maximumAmountCents = ruleMaximumAmount
      ? dollarsToCents(ruleMaximumAmount)
      : null;

    setDetectionRuleState({
      message: "Saving paycheck detection rule...",
      status: "loading",
    });

    try {
      const response = await fetch("/api/app/paychecks/rules", {
        body: JSON.stringify({
          employerNamePattern: ruleEmployerPattern,
          expectedFrequency: ruleFrequency,
          idempotencyKey: `ui-paycheck-rule-${ruleName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
          maximumAmountCents,
          minimumAmountCents,
          priority: 100,
          providerName: "plaid",
          ruleName,
          status: "active",
          transactionNamePattern: ruleEmployerPattern,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        rule?: PaycheckDetectionRule;
      };

      if (!response.ok) {
        setDetectionRuleState({
          message: payload.error || "Detection rule was not saved.",
          status: "error",
        });
        appendOperation({
          detail: payload.error || ruleName,
          label: "Detection rule",
          rail: "income",
          status: "rejected",
        });
        return;
      }

      setOperations((current) => ({
        ...(current ?? {}),
        operations: {
          ...(current?.operations ?? {}),
          paycheckDetectionRules: [
            payload.rule ?? {
              amountRangeCents: {
                max: maximumAmountCents,
                min: minimumAmountCents,
              },
              expectedFrequency: ruleFrequency,
              match: {
                employerNamePattern: ruleEmployerPattern,
                transactionNamePattern: ruleEmployerPattern,
              },
              providerName: "plaid",
              ruleName,
              status: "active",
            },
            ...detectionRules.filter(
              (rule) => rule.ruleName?.toLowerCase() !== ruleName.toLowerCase(),
            ),
          ],
        },
      }));
      setDetectionRuleState({
        message: payload.message || "Detection rule saved.",
        status: "ready",
      });
      appendOperation({
        detail: ruleName,
        label: "Detection rule",
        rail: "income",
        status: "active",
      });
    } catch {
      setDetectionRuleState({
        message: "Detection rule save failed.",
        status: "error",
      });
      appendOperation({
        detail: ruleName,
        label: "Detection rule",
        rail: "income",
        status: "error",
      });
    }
  }

  async function createTransfer() {
    const amountCents = transferAmountCents;

    if (!selectedBucket || !validDestinationPayee) {
      setTransferState({
        message:
          "Approve a destination for this bucket before protected money can be released.",
        status: "error",
      });
      appendOperation({
        amountCents,
        detail: selectedBucket?.name ?? "Protected bucket",
        label: "Transfer intent",
        rail: "transfer",
        status: "rejected",
      });
      return;
    }

    if (amountCents > transferLimitCents) {
      setTransferState({
        message:
          "Transfer amount exceeds the selected bucket balance or approved destination limit.",
        status: "error",
      });
      appendOperation({
        amountCents,
        detail: `${selectedBucket.name} -> ${validDestinationPayee.name}`,
        label: "Transfer intent",
        rail: "transfer",
        status: "rejected",
      });
      return;
    }

    setTransferState({
      message: "Validating protected transfer intent...",
      status: "loading",
    });

    try {
      const response = await fetch("/api/app/transfers", {
        body: JSON.stringify({
          amountCents,
          destinationPayeeId: validDestinationPayee.id,
          idempotencyKey: `ui-transfer-${crypto.randomUUID()}`,
          sourceBucketId: selectedBucket.id,
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
        appendOperation({
          amountCents,
          detail: `${selectedBucket.name} -> ${validDestinationPayee.name}`,
          label: "Transfer intent",
          rail: "transfer",
          status: "rejected",
        });
        return;
      }

      setTransferState({
        message: `${payload.message || "Transfer intent created."} Provider status: ${
          payload.providerTransfer?.status || "blocked"
        }.`,
        status: "ready",
      });
      appendOperation({
        amountCents,
        detail: `${selectedBucket.name} -> ${validDestinationPayee.name}`,
        label: "Transfer intent",
        rail: "transfer",
        status: payload.providerTransfer?.status || "blocked",
      });
    } catch {
      setTransferState({
        message: "Transfer intent failed.",
        status: "error",
      });
      appendOperation({
        amountCents,
        detail: `${selectedBucket.name} -> ${validDestinationPayee.name}`,
        label: "Transfer intent",
        rail: "transfer",
        status: "error",
      });
    }
  }

  const combinedTimeline = [
    ...localTimeline,
    ...(operations?.timeline ?? []),
  ].slice(0, 8);
  const revenueAndRails = operations?.revenueAndRails;
  const revenueRails = revenueAndRails?.rails ?? [];
  const serverRecordCount = recordCount(operations);
  const commercialGates = readiness?.commercial?.remainingGates ?? [];
  const moneyRailGates = readiness?.moneyRails?.remainingGates ?? [];
  const neobankGates = readiness?.neobank?.remainingGates ?? [];
  const bankLinkGates = moneyRailGates.filter(
    (gate) => gate.includes("PLAID") || gate.includes("TOKEN_VAULT"),
  );
  const detectionGates = moneyRailGates.filter(
    (gate) =>
      gate.includes("PLAID") ||
      gate.includes("TOKEN_VAULT") ||
      gate.includes("PROVIDER_WEBHOOK"),
  );
  const syncGates = [
    ...bankLinkGates,
    ...neobankGates.filter((gate) =>
      ["postgres_ledger", "dedicated_backend", "core_service_auth"].includes(gate),
    ),
  ];
  const transferGates = [
    ...moneyRailGates.filter(
      (gate) =>
        gate.includes("TRANSFER") ||
        gate.includes("transfer") ||
        gate.includes("PAYSHIELD_BAAS"),
    ),
    ...(readiness?.moneyRails?.providerAdapterMissing ?? []),
    ...neobankGates,
  ];
  const tokenCustodyMetric = readiness?.moneyRails?.tokenVaultEncryptionReady
    ? readiness.moneyRails.tokenVaultWebhookSource === "core_service"
      ? "core vault"
      : "encrypted custody"
    : readiness?.moneyRails?.tokenVaultStoreReady
      ? "vault ready"
      : readiness?.moneyRails?.tokenVaultHandoffReady
        ? readiness?.moneyRails?.tokenVaultEncryptionConfigured
          ? "encryption invalid"
          : "key needed"
        : readiness?.moneyRails?.tokenVaultConfigured
          ? "handoff needed"
          : "vault setup";
  const railStack = [
    {
      actionLabel: "Activate paid access",
      blockers: readiness?.commercial?.paidAccessReady
        ? []
        : [...new Set(commercialGates.map(friendlyGateLabel))],
      body: "Activate the paid household record first so every money-control workflow has a revenue gate.",
      endpoint: "POST /api/app/billing/checkout",
      icon: BadgeDollarSign,
      key: "commercial_access",
      metric:
        operations?.commercialAccess?.priceLabel ??
        readiness?.commercial?.priceLabel ??
        "$19/month",
      onAction: startPaidAccess,
      state: billingState,
      status: readiness?.commercial?.paidAccessReady
        ? "Paid access ready"
        : readiness?.commercial?.checkoutConfigured
          ? "Webhook pending"
          : "Stripe setup needed",
      title: "Make money",
      tone: readiness?.commercial?.checkoutOperationalReady
        ? "ready"
        : "attention",
    },
    {
      actionLabel: "Connect bank",
      blockers: readiness?.moneyRails?.bankLinkReady
        ? []
        : [...new Set(bankLinkGates.map(friendlyGateLabel))],
      body: "Launch Plaid Link only after credentials, signed vault handoff, and encrypted token custody are ready; the exchange route records the bank connection.",
      endpoint: "POST /api/app/bank-link/token",
      icon: Link2,
      key: "bank_connection",
      metric: tokenCustodyMetric,
      onAction: startBankLink,
      state: bankState,
      status: readiness?.moneyRails?.bankLinkReady
        ? "Bank link ready"
        : readiness?.moneyRails?.plaidConfigured
          ? readiness?.moneyRails?.tokenVaultHandoffReady
            ? "Encryption key needed"
            : "Vault handoff needed"
          : "Plaid setup needed",
      title: "Connect banks",
      tone: readiness?.moneyRails?.bankLinkReady ? "ready" : "attention",
    },
    {
      actionLabel: "Sync activity",
      blockers: readiness?.moneyRails?.transactionSyncReady
        ? []
        : [...new Set(syncGates.map(friendlyGateLabel))],
      body: "Pull linked-bank transactions through encrypted token custody, detect payroll deposits, and post protected bucket splits into the ledger.",
      endpoint: "POST /api/app/paychecks/sync",
      icon: RefreshCw,
      key: "transaction_sync",
      metric: readiness?.moneyRails?.detectionMode ?? "sync",
      onAction: syncBankTransactions,
      state: syncState,
      status:
        readiness?.moneyRails?.transactionSyncReady
          ? "Sync ready"
          : readiness?.moneyRails?.bankLinkReady
            ? "Core storage needed"
            : "Bank link needed",
      title: "Sync bank activity",
      tone: readiness?.moneyRails?.transactionSyncReady ? "ready" : "attention",
    },
    {
      actionLabel: "Set routing",
      blockers:
        directDepositSetups.length > 0 || readiness?.neobank?.liveMoneyReady
          ? []
          : [...new Set(neobankGates.map(friendlyGateLabel))],
      body: "Record the masked paycheck-routing setup used before incoming payroll funds protected buckets.",
      endpoint: "POST /api/app/direct-deposit",
      icon: Landmark,
      key: "direct_deposit",
      metric: directDepositSetups[0]?.accountLast4
        ? `*${directDepositSetups[0].accountLast4}`
        : "routing",
      onAction: startDirectDepositSetup,
      state: directDepositState,
      status:
        directDepositSetups[0]?.status ??
        (readiness?.neobank?.liveMoneyReady ? "Instructions ready" : "Provider activation"),
      title: "Route paycheck",
      tone:
        directDepositSetups.length > 0 || readiness?.neobank?.liveMoneyReady
          ? "ready"
          : "attention",
    },
    {
      actionLabel: "Edit buckets",
      blockers: [],
      body: "Customize protected categories, target amounts, priority order, due cadence, payees, and unlock behavior before money is released.",
      endpoint: "POST /api/app/buckets",
      icon: Split,
      key: "protected_buckets",
      metric: `${protectedTransferBuckets.length} buckets`,
      onAction: () => focusProductSection("bucket-studio", setBucketState),
      state: bucketState,
      status: "Customizable",
      title: "Protect the money",
      tone: "ready",
    },
    {
      actionLabel: "Run detection",
      blockers: readiness?.moneyRails?.paycheckDetectionReady
        ? []
        : [...new Set(detectionGates.map(friendlyGateLabel))],
      body: "Save a payroll rule and run a controlled detection now; automatic detection turns on when Plaid/token-vault/provider-event signing is configured.",
      endpoint: "POST /api/app/paychecks/detect",
      icon: Radar,
      key: "paycheck_detection",
      metric: `${detectionRules.length} rules`,
      onAction: detectPaycheck,
      state: depositState,
      status: readiness?.moneyRails?.paycheckDetectionReady
        ? "Auto detection ready"
        : readiness?.moneyRails?.bankLinkReady
          ? "Provider signing needed"
          : "Rule check ready",
      title: "Detect paychecks",
      tone: readiness?.moneyRails?.paycheckDetectionReady ? "ready" : "attention",
    },
    {
      actionLabel: "Create intent",
      blockers: readiness?.moneyRails?.transferReady
        ? []
        : [...new Set(transferGates.map(friendlyGateLabel))],
      body: "Validate bucket funds and create the provider handoff record before any protected money is released.",
      endpoint: "POST /api/app/transfers",
      icon: ArrowRightLeft,
      key: "protected_transfer",
      metric: selectedBucket ? formatMoney(selectedBucket.availableCents) : "bucket",
      onAction: createTransfer,
      state: transferState,
      status: readiness?.moneyRails?.transferReady
        ? "Transfers ready"
        : readiness?.moneyRails?.transferConfigured
          ? "Live gates pending"
          : "Intent validation active",
      title: "Move protected funds",
      tone: readiness?.moneyRails?.transferReady ? "ready" : "attention",
    },
    {
      actionLabel: "Check swipe",
      blockers: readiness?.neobank?.liveMoneyReady
        ? []
        : [...new Set(neobankGates.map(friendlyGateLabel))],
      body: "Run purchase decisions against Safe to Spend while approved billers can draw only from their assigned protected buckets.",
      endpoint: "POST /api/card/authorize",
      icon: CreditCard,
      key: "card_control",
      metric:
        operations?.balances?.safeToSpendCents !== undefined
          ? formatMoney(operations.balances.safeToSpendCents)
          : "safe spend",
      onAction: () => focusProductSection("card-authorization", setCardState),
      state: cardState,
      status: readiness?.neobank?.liveMoneyReady ? "Gateway ready" : "Ledger decisions",
      title: "Control spending",
      tone: readiness?.neobank?.liveMoneyReady ? "ready" : "attention",
    },
  ] satisfies Array<{
    actionLabel: string;
    blockers: string[];
    body: string;
    endpoint: string;
    icon: LucideIcon;
    key: string;
    metric: string;
    onAction: () => void | Promise<void>;
    state: ActionState;
    status: string;
    title: string;
    tone: "attention" | "ready";
  }>;
  const activeRailCount = railStack.filter((rail) => rail.tone === "ready").length;
  const blockerCount = railStack.reduce(
    (total, rail) => total + rail.blockers.length,
    0,
  );
  const flowSteps = railStack.map((rail) => ({
    key: rail.key,
    label: rail.title,
    ready: rail.tone === "ready",
  }));

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
              the bank source, set paycheck routing, detect income, split the
              ledger, and validate every transfer or card decision against
              protected funds.
            </p>
            <div className="mt-6 rounded-[8px] border border-white/10 bg-black/35 p-3">
              <p className="brand-kicker">Money path</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {flowSteps.map((step, index) => (
                  <div
                    className={`flex min-h-16 items-center gap-3 rounded-[8px] border p-3 ${
                      step.ready
                        ? "border-[#68f0c2]/25 bg-[#68f0c2]/10"
                        : "border-[#ffb237]/25 bg-[#ffb237]/10"
                    }`}
                    key={step.key}
                  >
                    <span
                      className={`grid size-8 shrink-0 place-items-center rounded-[8px] text-sm font-black ${
                        step.ready
                          ? "bg-[#68f0c2] text-[#04100c]"
                          : "bg-[#ffb237] text-[#15100a]"
                      }`}
                    >
                      {index + 1}
                    </span>
                    <span className="text-sm font-black leading-5 text-white">
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-[8px] border border-[#68f0c2]/25 bg-[#68f0c2]/10 p-3">
                <p className="brand-kicker">Runnable lanes</p>
                <p className="mt-2 text-3xl font-black text-white">
                  {activeRailCount}/{railStack.length}
                </p>
              </div>
              <div className="rounded-[8px] border border-[#ffb237]/25 bg-[#ffb237]/10 p-3">
                <p className="brand-kicker">Setup blockers</p>
                <p className="mt-2 text-3xl font-black text-white">
                  {blockerCount}
                </p>
              </div>
              <div className="rounded-[8px] border border-[#39e8ff]/25 bg-[#39e8ff]/10 p-3">
                <p className="brand-kicker">Audit records</p>
                <p className="mt-2 text-3xl font-black text-white">
                  {serverRecordCount + localTimeline.length}
                </p>
              </div>
              <div
                className={`rounded-[8px] border p-3 ${
                  openExceptionCount > 0
                    ? "border-[#ff6b35]/30 bg-[#ff6b35]/10"
                    : "border-[#68f0c2]/25 bg-[#68f0c2]/10"
                }`}
              >
                <p className="brand-kicker">Exception queue</p>
                <p className="mt-2 text-3xl font-black text-white">
                  {openExceptionCount}
                </p>
              </div>
            </div>
          </div>

          <div className="brand-panel rounded-[8px] p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="brand-kicker">Start here</p>
                <h3 className="mt-1 text-2xl font-black text-white">
                  Live rail stack.
                </h3>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-[#c9d0da]">
                  Each row is an executable part of the product. Use the action
                  button, then read the exact blocker if credentials or custody
                  are not configured yet.
                </p>
              </div>
              <button
                className="brand-button-blue inline-flex h-11 items-center justify-center gap-2 rounded-[8px] px-4 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50"
                disabled={portalState.status === "loading"}
                onClick={openBillingPortal}
                type="button"
              >
                {portalState.status === "loading" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ReceiptText className="size-4" aria-hidden="true" />
                )}
                Manage billing
              </button>
            </div>
            <div className="mt-5 grid gap-3">
              {railStack.map((rail) => (
                <ActivationRail
                  actionLabel={rail.actionLabel}
                  blockers={rail.blockers}
                  body={rail.body}
                  endpoint={rail.endpoint}
                  icon={rail.icon}
                  key={rail.key}
                  metric={rail.metric}
                  onAction={rail.onAction}
                  state={rail.state}
                  status={rail.status}
                  title={rail.title}
                  tone={rail.tone}
                />
              ))}
            </div>
            <div className="mt-3">
              <StateMessage state={portalState} />
            </div>
          </div>
        </div>

        {revenueRails.length > 0 ? (
          <div className="brand-panel rounded-[8px] p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="brand-kicker">Revenue and rails</p>
                <h3 className="mt-1 text-2xl font-black text-white">
                  The commercial operating map.
                </h3>
              </div>
              <div className="grid min-w-[12rem] gap-1 rounded-[8px] border border-[#68f0c2]/25 bg-[#68f0c2]/10 p-3">
                <p className="brand-kicker">Subscription</p>
                <p className="text-2xl font-black text-white">
                  {revenueAndRails?.summary?.priceLabel ??
                    operations?.commercialAccess?.priceLabel ??
                    "$19/month"}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {revenueRails.map((rail) => (
                <div
                  className={`grid min-h-52 content-start gap-3 rounded-[8px] border p-3 ${
                    rail.canRunNow
                      ? "border-[#68f0c2]/25 bg-[#68f0c2]/[0.07]"
                      : "border-white/10 bg-black/35"
                  }`}
                  key={rail.key}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span>
                      <span className="block text-xs font-black uppercase tracking-[0.12em] text-[#8f99aa]">
                        {rail.provider}
                      </span>
                      <span className="mt-1 block text-base font-black text-white">
                        {rail.label}
                      </span>
                    </span>
                    <span
                      className={`rounded-[8px] px-2.5 py-1 text-xs font-black capitalize ${
                        rail.canRunNow
                          ? "bg-[#68f0c2]/10 text-[#9af7d5]"
                          : "bg-[#ffb237]/10 text-[#ffe4ad]"
                      }`}
                    >
                      {rail.state.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="text-sm font-bold leading-6 text-[#d9dde5]">
                    {rail.userAction}
                  </p>
                  <p className="text-xs leading-5 text-[#aab3c2]">
                    {rail.unlocks}
                  </p>
                  <span className="mt-auto font-mono text-[0.68rem] font-black uppercase text-[#39e8ff]">
                    {rail.endpoint}
                  </span>
                  {rail.blockers?.length ? (
                    <p className="text-xs font-bold leading-5 text-[#ffe4ad]">
                      Needs {rail.blockers.slice(0, 2).map(friendlyGateLabel).join(", ")}
                      {rail.blockers.length > 2 ? " +" : ""}.
                    </p>
                  ) : (
                    <p className="text-xs font-bold leading-5 text-[#9af7d5]">
                      Ready in the current operating state.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="brand-panel rounded-[8px] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="brand-kicker">Money engine</p>
              <h3 className="mt-1 text-2xl font-black text-white">
                Charge, connect, detect, protect, move.
              </h3>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#aab3c2]">
                This lane creates the revenue record, bank-link handoff,
                paycheck-routing record, recurring payroll rule, paycheck
                split, protected transfer intent, and audit trail from one
                place.
              </p>
            </div>
            <div className="grid min-w-[12rem] gap-1 rounded-[8px] border border-[#48e6b2]/25 bg-[#48e6b2]/10 p-3">
              <p className="brand-kicker">Revenue model</p>
              <p className="text-2xl font-black text-white">
                {operations?.commercialAccess?.priceLabel ??
                  readiness?.commercial?.priceLabel ??
                  "$19/month"}
              </p>
              <p className="text-xs font-black capitalize text-[#68f0c2]">
                {(operations?.commercialAccess?.state ?? "needs_setup").replace(
                  /_/g,
                  " ",
                )}{" "}
                · {readiness?.neobank?.mode ?? "loading"} mode
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-2 md:grid-cols-5">
            {[
              {
                body: "Paid access creates the revenue record.",
                label: "Collect",
              },
              {
                body: "Bank link records the household funding source.",
                label: "Connect",
              },
              {
                body: "Routing setup captures masked payroll state.",
                label: "Route",
              },
              {
                body: "Paycheck events fund protected buckets first.",
                label: "Split",
              },
              {
                body: "Transfers and card decisions check Safe to Spend.",
                label: "Release",
              },
            ].map((step, index) => (
              <div
                className="rounded-[8px] border border-white/10 bg-black/35 p-3"
                key={step.label}
              >
                <span className="grid size-8 place-items-center rounded-[8px] bg-[#39e8ff] text-sm font-black text-[#050607]">
                  {index + 1}
                </span>
                <p className="mt-3 text-sm font-black text-white">{step.label}</p>
                <p className="mt-2 text-xs leading-5 text-[#aab3c2]">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="brand-panel rounded-[8px] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="brand-kicker">Operations ledger</p>
              <h3 className="mt-1 text-2xl font-black text-white">
                The money-control record lives here.
              </h3>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#aab3c2]">
                This combines the revenue gate, bank connection state, paycheck
                detections, protected transfer intents, bill routes, card
                decisions, and unlock records into one support-ready view.
              </p>
            </div>
            <a
              className="brand-button-blue inline-flex h-11 items-center justify-center gap-2 rounded-[8px] px-4 text-sm font-black"
              download="payshield-household-audit.json"
              href="/api/app/audit/export"
            >
              <FileDown className="size-4" aria-hidden="true" />
              Export audit
            </a>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            {(operations?.statusCards ?? [
              {
                key: "paid_access",
                label: "Paid access",
                state: readiness?.commercial?.checkoutConfigured
                  ? "ready"
                  : "needs_setup",
              },
              {
                key: "bank_connection",
                label: "Bank connection",
                state: readiness?.moneyRails?.bankLinkReady
                  ? "ready"
                  : "needs_setup",
              },
              {
                key: "direct_deposit",
                label: "Paycheck routing",
                state: directDepositSetups.length
                  ? "recorded"
                  : readiness?.neobank?.liveMoneyReady
                    ? "ready"
                    : "needs_setup",
              },
              {
                key: "paycheck_detection",
                label: "Paycheck detection",
                state: readiness?.moneyRails?.paycheckDetectionReady
                  ? "ready"
                  : "needs_setup",
              },
              {
                key: "protected_transfer",
                label: "Protected transfer",
                state: readiness?.moneyRails?.transferReady
                  ? "ready"
                  : "needs_setup",
              },
              {
                key: "reconciliation",
                label: "Exception queue",
                state: openExceptionCount > 0 ? "open" : "clear",
              },
            ]).map((card) => (
              <div
                className="rounded-[8px] border border-white/10 bg-black/35 p-3"
                key={card.key}
              >
                <p className="text-xs font-black uppercase tracking-[0.12em] text-[#8f99aa]">
                  {card.label}
                </p>
                <p
                  className={`mt-2 text-lg font-black ${
                    ["active", "checkout_started", "clear", "connected", "ready", "recorded"].includes(
                      card.state,
                    )
                      ? "text-[#68f0c2]"
                      : "text-[#ffcf72]"
                  }`}
                >
                  {card.state.replace(/_/g, " ")}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
            <div className="rounded-[8px] border border-[#39e8ff]/25 bg-[#39e8ff]/10 p-4">
              <ReceiptText className="size-5 text-[#39e8ff]" aria-hidden="true" />
              <p className="mt-3 text-sm font-black uppercase tracking-[0.12em] text-[#dffaff]">
                Recorded artifacts
              </p>
              <p className="mt-2 text-4xl font-black text-white">
                {serverRecordCount + localTimeline.length}
              </p>
              <p className="mt-2 text-sm leading-6 text-[#c9d0da]">
                {operations?.operationalAudit?.auditFound
                  ? "Loaded from durable core operations storage."
                  : "Current control model plus this device's recent actions."}
              </p>
            </div>

            <div className="grid gap-2">
              {combinedTimeline.length ? (
                combinedTimeline.map((item) => (
                  <div
                    className="grid gap-3 rounded-[8px] border border-white/10 bg-black/35 p-3 sm:grid-cols-[8rem_1fr_auto]"
                    key={item.id}
                  >
                    <span className="font-mono text-xs font-black uppercase text-[#39e8ff]">
                      {item.rail.replace(/_/g, " ")}
                    </span>
                    <span>
                      <span className="block text-sm font-black capitalize text-white">
                        {item.label}
                        {timelineAmount(item)}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-[#8f99aa]">
                        {item.detail || "Recorded by PayShield"}
                      </span>
                    </span>
                    <span className="rounded-[8px] border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-black capitalize text-[#d9dde5]">
                      {item.status.replace(/_/g, " ")}
                    </span>
                  </div>
                ))
              ) : (
                <div className="rounded-[8px] border border-white/10 bg-black/35 p-4 text-sm font-bold leading-6 text-[#aab3c2]">
                  Run checkout, connect a bank, detect a paycheck, or create a
                  transfer intent to populate the operating record.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="brand-panel rounded-[8px] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="brand-kicker">Paycheck detection</p>
                <h3 className="mt-1 text-xl font-black text-white">
                  Set the rule. Split every check first.
                </h3>
              </div>
              <Radar className="size-6 text-[#39e8ff]" aria-hidden="true" />
            </div>

            <div className="mt-4 rounded-[8px] border border-[#39e8ff]/20 bg-[#39e8ff]/[0.06] p-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
                <label className="grid gap-2 text-sm font-black text-white">
                  Rule name
                  <input
                    className="h-11 rounded-[8px] border border-white/10 bg-black/45 px-3 text-sm font-bold text-white outline-none transition focus:border-[#39e8ff]"
                    maxLength={80}
                    onChange={(event) => setRuleName(event.target.value)}
                    value={ruleName}
                  />
                </label>
                <label className="grid gap-2 text-sm font-black text-white">
                  Match text
                  <input
                    className="h-11 rounded-[8px] border border-white/10 bg-black/45 px-3 text-sm font-bold text-white outline-none transition focus:border-[#39e8ff]"
                    maxLength={100}
                    onChange={(event) => setRuleEmployerPattern(event.target.value)}
                    value={ruleEmployerPattern}
                  />
                </label>
                <label className="grid gap-2 text-sm font-black text-white">
                  Minimum
                  <input
                    className="h-11 rounded-[8px] border border-white/10 bg-black/45 px-3 text-sm font-bold text-white outline-none transition focus:border-[#39e8ff]"
                    inputMode="decimal"
                    min="0"
                    onChange={(event) => setRuleMinimumAmount(event.target.value)}
                    type="number"
                    value={ruleMinimumAmount}
                  />
                </label>
                <label className="grid gap-2 text-sm font-black text-white">
                  Maximum
                  <input
                    className="h-11 rounded-[8px] border border-white/10 bg-black/45 px-3 text-sm font-bold text-white outline-none transition focus:border-[#39e8ff]"
                    inputMode="decimal"
                    min="0"
                    onChange={(event) => setRuleMaximumAmount(event.target.value)}
                    placeholder="Optional"
                    type="number"
                    value={ruleMaximumAmount}
                  />
                </label>
                <label className="grid gap-2 text-sm font-black text-white sm:col-span-2">
                  Frequency
                  <select
                    className="h-11 rounded-[8px] border border-white/10 bg-black/45 px-3 text-sm font-bold text-white outline-none transition focus:border-[#39e8ff]"
                    onChange={(event) => setRuleFrequency(event.target.value)}
                    value={ruleFrequency}
                  >
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Biweekly</option>
                    <option value="semimonthly">Twice monthly</option>
                    <option value="monthly">Monthly</option>
                    <option value="unknown">Variable</option>
                  </select>
                </label>
              </div>
              <button
                className="brand-button-blue mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] px-4 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50"
                disabled={
                  !ruleName ||
                  !ruleEmployerPattern ||
                  ruleMinimumCents <= 0 ||
                  (ruleMaximumAmount !== "" &&
                    (!ruleMaximumCents || ruleMaximumCents <= ruleMinimumCents)) ||
                  detectionRuleState.status === "loading"
                }
                onClick={saveDetectionRule}
                type="button"
              >
                {detectionRuleState.status === "loading" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Radar className="size-4" aria-hidden="true" />
                )}
                Save detection rule
              </button>
              <div className="mt-3">
                <StateMessage state={detectionRuleState} />
              </div>
              {detectionRules.length > 0 ? (
                <div className="mt-3 grid gap-2">
                  {detectionRules.slice(0, 3).map((rule, index) => (
                    <div
                      className="flex items-center justify-between gap-3 rounded-[8px] border border-white/10 bg-black/35 px-3 py-2"
                      key={`${rule.id ?? rule.ruleName ?? "rule"}-${index}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-black text-white">
                          {rule.ruleName ?? "Paycheck rule"}
                        </span>
                        <span className="block truncate text-xs font-bold text-[#aab3c2]">
                          {rule.match?.employerNamePattern ??
                            rule.match?.transactionNamePattern ??
                            "Income match"}{" "}
                          · {formatMoney(rule.amountRangeCents?.min ?? 0)}+
                        </span>
                      </span>
                      <span className="rounded-[8px] border border-[#68f0c2]/25 bg-[#68f0c2]/10 px-2.5 py-1 text-xs font-black capitalize text-[#9af7d5]">
                        {rule.status ?? "active"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
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
                  onChange={(event) =>
                    changeTransferSource(event.target.value as BucketId)
                  }
                  value={selectedBucket?.id ?? ""}
                >
                  {protectedTransferBuckets.map((bucket) => (
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
                  disabled={!bucketPayees.length}
                  onChange={(event) => setDestinationPayeeId(event.target.value)}
                  value={validDestinationPayee?.id ?? ""}
                >
                  {bucketPayees.map((payee) => (
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
                  max={transferLimitCents / 100}
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
              <div className="rounded-[8px] border border-white/10 bg-black/35 p-3 sm:col-span-2">
                <p className="brand-kicker">Approved destination</p>
                <p className="mt-2 text-lg font-black text-white">
                  {validDestinationPayee
                    ? `${validDestinationPayee.name} - ${formatMoney(
                        validDestinationPayee.maxCents,
                      )} limit`
                    : "Approve a payee for this bucket"}
                </p>
                <p className="mt-2 text-xs font-bold leading-5 text-[#aab3c2]">
                  Only payees approved for the selected protected bucket appear
                  here.
                </p>
              </div>
            </div>

            <button
              className="brand-button-blue mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] px-4 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!transferReady}
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
