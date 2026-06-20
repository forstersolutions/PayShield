"use client";

import {
  ArrowRightLeft,
  BadgeDollarSign,
  CheckCircle2,
  CreditCard,
  FileDown,
  KeyRound,
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
    paymentCollectionReady?: boolean;
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

type OperatingCockpit = {
  blockerCount?: number;
  headline?: string;
  lanes?: Array<{
    blockers?: string[];
    canRunNow?: boolean;
    key: string;
    label: string;
    primaryEndpoint: string;
    ready?: boolean;
    state?: string;
    userAction?: string;
    value?: string;
  }>;
  mode?: string;
  moneySummary?: {
    priceLabel?: string;
    protectedCents?: number;
    safeToSpendCents?: number;
    totalCents?: number;
  };
  nextAction?: {
    blockers?: string[];
    canRunNow?: boolean;
    key?: string;
    label?: string;
    primaryEndpoint?: string;
    state?: string;
    userAction?: string;
  };
  readyLaneCount?: number;
  service?: string;
  totalLaneCount?: number;
};

type CommercialOperatingState = {
  activeRailCount?: number;
  headline?: string;
  mode?: string;
  nextRail?: {
    blockers?: string[];
    endpoint?: string;
    key?: string;
    label?: string;
    ownerSwitch?: string;
    state?: string;
  };
  rails?: Array<{
    blockers?: string[];
    canRunNow?: boolean;
    endpoint: string;
    key: string;
    label: string;
    ownerSwitch: string;
    provider: string;
    ready?: boolean;
    state?: string;
    userOutcome: string;
  }>;
  revenueModel?: {
    billingProvider?: string;
    canActivatePaidAccess?: boolean;
    canCollectPayment?: boolean;
    checkoutEndpoint?: string;
    checkoutMode?: string;
    priceLabel?: string;
    publicCheckoutEndpoint?: string;
    webhookEndpoint?: string;
  };
  service?: string;
  totalRailCount?: number;
};

type GuidedMoneyFlowStep = {
  blockers?: string[];
  canRunNow?: boolean;
  endpoint: string;
  evidence?: string;
  key: string;
  label: string;
  ownerAction?: string;
  primaryAction: string;
  ready?: boolean;
  runMode?: string;
  status?: string;
  title: string;
  userOutcome?: string;
  uiTarget?: string;
};

type GuidedMoneyFlow = {
  headline?: string;
  mode?: string;
  nextStep?: GuidedMoneyFlowStep;
  progress?: {
    availableNowCount?: number;
    blockedStepCount?: number;
    percent?: number;
    readyStepCount?: number;
    totalStepCount?: number;
  };
  service?: string;
  steps?: GuidedMoneyFlowStep[];
  summary?: string;
  totals?: {
    priceLabel?: string;
    protectedCents?: number;
    safeToSpendCents?: number;
    totalCents?: number;
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
  commercialOperatingState?: CommercialOperatingState;
  guidedMoneyFlow?: GuidedMoneyFlow;
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
  operatingCockpit?: OperatingCockpit;
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

function formatStateLabel(value: string | undefined) {
  return (value || "setup_required").replace(/_/g, " ");
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

function CapabilityCard({
  actionLabel,
  blockers,
  body,
  endpoint,
  icon: Icon,
  metric,
  onAction,
  setupHref = "/launch",
  setupLabel = "Open owner setup",
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
  setupHref?: string;
  setupLabel?: string;
  state: ActionState;
  status: string;
  title: string;
  tone: "attention" | "ready";
}) {
  return (
    <div
      className={`grid min-h-[19rem] content-start gap-4 rounded-[8px] border p-4 ${
        tone === "ready"
          ? "border-[#68f0c2]/30 bg-[#68f0c2]/[0.075]"
          : "border-[#ffb237]/30 bg-[#ffb237]/[0.08]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`grid size-12 place-items-center rounded-[8px] border ${
            tone === "ready"
              ? "border-[#68f0c2]/25 bg-black/35 text-[#68f0c2]"
              : "border-[#ffb237]/25 bg-black/35 text-[#ffcf72]"
          }`}
        >
          <Icon className="size-6" aria-hidden="true" />
        </span>
        <span
          className={`rounded-[8px] px-2.5 py-1 text-xs font-black capitalize ${
            tone === "ready"
              ? "bg-[#68f0c2]/10 text-[#9af7d5]"
              : "bg-[#ffb237]/10 text-[#ffe4ad]"
          }`}
        >
          {status.replace(/_/g, " ")}
        </span>
      </div>

      <div>
        <p className="text-xs font-black uppercase text-[#8f99aa]">{metric}</p>
        <h3 className="mt-1 text-2xl font-black leading-tight text-white">
          {title}
        </h3>
        <p className="mt-3 text-sm font-bold leading-6 text-[#c9d0da]">
          {body}
        </p>
      </div>

      <p className="overflow-x-auto font-mono text-[0.68rem] font-black uppercase text-[#39e8ff]">
        {endpoint}
      </p>

      {blockers.length > 0 ? (
        <div className="grid gap-2">
          <p className="text-xs font-black uppercase text-[#ffcf72]">
            Needs before full operation
          </p>
          <div className="flex flex-wrap gap-1.5">
            {blockers.slice(0, 4).map((blocker) => (
              <span
                className="rounded-[8px] border border-[#ffb237]/25 bg-black/30 px-2 py-1 text-[0.68rem] font-black text-[#ffe4ad]"
                key={blocker}
              >
                {blocker}
              </span>
            ))}
            {blockers.length > 4 ? (
              <span className="rounded-[8px] border border-[#ffb237]/25 bg-black/30 px-2 py-1 text-[0.68rem] font-black text-[#ffe4ad]">
                +{blockers.length - 4}
              </span>
            ) : null}
          </div>
          <a
            className="inline-flex min-h-9 w-fit items-center justify-center rounded-[8px] border border-[#ffb237]/30 bg-black/35 px-3 text-xs font-black text-[#ffe4ad] transition hover:border-[#ffcf72]/45 hover:bg-[#ffb237]/10"
            href={setupHref}
          >
            {setupLabel}
          </a>
        </div>
      ) : (
        <p className="rounded-[8px] border border-[#68f0c2]/25 bg-black/30 p-2 text-xs font-black text-[#9af7d5]">
          Ready to run from this screen.
        </p>
      )}

      <button
        className={`mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-[8px] px-4 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50 ${
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
      <StateMessage state={state} />
    </div>
  );
}

function WorkflowCheckpoint({
  detail,
  endpoint,
  label,
  ready,
  value,
}: {
  detail: string;
  endpoint: string;
  label: string;
  ready: boolean;
  value: string;
}) {
  return (
    <article
      className={`grid gap-3 rounded-[8px] border p-3 ${
        ready
          ? "border-[#68f0c2]/25 bg-[#68f0c2]/[0.07]"
          : "border-white/10 bg-black/35"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span>
          <span className="brand-kicker">{label}</span>
          <span className="mt-1 block text-lg font-black text-white">
            {value}
          </span>
        </span>
        <span
          className={`rounded-[8px] px-2.5 py-1 text-xs font-black ${
            ready
              ? "bg-[#68f0c2]/10 text-[#9af7d5]"
              : "bg-[#ffb237]/10 text-[#ffe4ad]"
          }`}
        >
          {ready ? "Ready" : "Setup"}
        </span>
      </div>
      <p className="text-sm font-bold leading-6 text-[#c9d0da]">{detail}</p>
      <code className="overflow-x-auto font-mono text-[0.68rem] font-black uppercase text-[#39e8ff]">
        {endpoint}
      </code>
    </article>
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
        activation?: {
          autoActivationReady?: boolean;
          warning?: string;
        };
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
        message:
          payload.activation?.warning ||
          "Checkout intent recorded. Redirecting to checkout.",
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
  const guidedMoneyFlow = operations?.guidedMoneyFlow;
  const guidedSteps = guidedMoneyFlow?.steps ?? [];
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
      body: "Save payroll rules and run detections through the core ledger; automatic detection turns on when Plaid, token custody, and provider-event signing are configured.",
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
          : "Core setup required",
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
  const railByKey = new Map(railStack.map((rail) => [rail.key, rail]));
  const guidedNextStep = guidedMoneyFlow?.nextStep;
  const nextExecutableRail =
    (guidedNextStep ? railByKey.get(guidedNextStep.key) : undefined) ??
    railStack.find((rail) => rail.tone !== "ready") ??
    railStack[0];
  const NextExecutableIcon = nextExecutableRail.icon;
  const guidedReadyCount =
    guidedMoneyFlow?.progress?.readyStepCount ?? activeRailCount;
  const guidedTotalCount =
    guidedMoneyFlow?.progress?.totalStepCount ?? railStack.length;
  const guidedAvailableCount =
    guidedMoneyFlow?.progress?.availableNowCount ??
    railStack.filter((rail) => rail.tone === "ready").length;
  const guidedBlockedCount =
    guidedMoneyFlow?.progress?.blockedStepCount ?? blockerCount;
  const guidedPercent =
    guidedMoneyFlow?.progress?.percent ??
    Math.round((guidedReadyCount / Math.max(1, guidedTotalCount)) * 100);
  const displayGuidedSteps: GuidedMoneyFlowStep[] = guidedSteps.length
    ? guidedSteps
    : railStack.map((rail) => ({
        blockers: rail.blockers,
        canRunNow: rail.tone === "ready",
        endpoint: rail.endpoint,
        key: rail.key,
        label: rail.title,
        primaryAction: rail.actionLabel,
        ready: rail.tone === "ready",
        status: rail.status,
        title: rail.title,
      }));
  const ownerWorkflow = [
    {
      detail:
        "Stripe creates the paid household record before private money controls open.",
      endpoint: "POST /api/app/billing/checkout",
      label: "Revenue",
      ready: Boolean(readiness?.commercial?.checkoutOperationalReady),
      value:
        operations?.commercialAccess?.priceLabel ??
        readiness?.commercial?.priceLabel ??
        "$19/month",
    },
    {
      detail:
        "Clerk and the core service bind every private record to one household.",
      endpoint: "GET /api/app/me",
      label: "Access",
      ready: Boolean(readiness?.neobank?.backendConfigured),
      value: readiness?.neobank?.mode ?? "gated",
    },
    {
      detail:
        "Postgres, token custody, provider events, and audit export prove what happened.",
      endpoint: "GET /api/app/audit/export",
      label: "Evidence",
      ready: Boolean(operations?.operationalAudit?.auditFound),
      value: `${serverRecordCount + localTimeline.length} records`,
    },
  ];
  const householdWorkflow = [
    {
      detail:
        "Bank Link records the external funding source and moves tokens into server custody.",
      endpoint: "POST /api/app/bank-link/token",
      label: "Connect",
      ready: Boolean(readiness?.moneyRails?.bankLinkReady),
      value: readiness?.moneyRails?.plaidEnv ?? "plaid",
    },
    {
      detail:
        "Payroll rules and sync turn deposits into protected bucket funding.",
      endpoint: "POST /api/app/paychecks/sync",
      label: "Detect",
      ready: Boolean(readiness?.moneyRails?.paycheckDetectionReady),
      value: `${detectionRules.length} rule${detectionRules.length === 1 ? "" : "s"}`,
    },
    {
      detail:
        "Transfers and card decisions release only approved Safe to Spend or biller money.",
      endpoint: "POST /api/app/transfers",
      label: "Release",
      ready: Boolean(readiness?.moneyRails?.transferReady),
      value: selectedBucket ? formatMoney(selectedBucket.availableCents) : "bucket",
    },
  ];
  const flowSteps = displayGuidedSteps.map((step) => ({
    key: step.key,
    label: step.label,
    ready: Boolean(step.ready),
  }));
  const capabilityCards = [
    {
      actionLabel: "Start checkout",
      blockers: readiness?.commercial?.paidAccessReady
        ? []
        : [...new Set(commercialGates.map(friendlyGateLabel))],
      body: "This is the revenue path. Stripe checkout creates the paid household entry, and the webhook activates access in the core.",
      endpoint: "POST /api/app/billing/checkout",
      icon: BadgeDollarSign,
      key: "charge",
      metric:
        operations?.commercialAccess?.priceLabel ??
        readiness?.commercial?.priceLabel ??
        "$19/month",
      onAction: startPaidAccess,
      setupHref: "/launch#revenue",
      setupLabel: "Set up Stripe",
      state: billingState,
      status: readiness?.commercial?.paidAccessReady
        ? "paid access active"
        : readiness?.commercial?.checkoutConfigured
          ? "activation pending"
          : "stripe setup",
      title: "Charge the household",
      tone: readiness?.commercial?.checkoutOperationalReady
        ? "ready"
        : "attention",
    },
    {
      actionLabel: "Connect bank",
      blockers: readiness?.moneyRails?.bankLinkReady
        ? []
        : [...new Set(bankLinkGates.map(friendlyGateLabel))],
      body: "Plaid Link opens from the app, exchanges the public token, and stores the bank token through server-side custody.",
      endpoint: "POST /api/app/bank-link/token",
      icon: Link2,
      key: "bank",
      metric: readiness?.moneyRails?.plaidEnv ?? "plaid",
      onAction: startBankLink,
      setupHref: "/launch#bank-link",
      setupLabel: "Set up Plaid",
      state: bankState,
      status: readiness?.moneyRails?.bankLinkReady
        ? "bank link ready"
        : readiness?.moneyRails?.plaidConfigured
          ? "vault setup"
          : "plaid setup",
      title: "Connect banks",
      tone: readiness?.moneyRails?.bankLinkReady ? "ready" : "attention",
    },
    {
      actionLabel: "Set routing",
      blockers:
        directDepositSetups.length > 0 || readiness?.neobank?.liveMoneyReady
          ? []
          : [...new Set(neobankGates.map(friendlyGateLabel))],
      body: "This creates the paycheck-routing setup record so payroll can land in the controlled flow before bucket funding runs.",
      endpoint: "POST /api/app/direct-deposit",
      icon: Landmark,
      key: "route",
      metric: directDepositSetups[0]?.accountLast4
        ? `*${directDepositSetups[0].accountLast4}`
        : "payroll",
      onAction: startDirectDepositSetup,
      setupHref: "/launch#money_movement",
      setupLabel: "Set up provider",
      state: directDepositState,
      status:
        directDepositSetups[0]?.status ??
        (readiness?.neobank?.liveMoneyReady ? "routing ready" : "provider gate"),
      title: "Route the paycheck",
      tone:
        directDepositSetups.length > 0 || readiness?.neobank?.liveMoneyReady
          ? "ready"
          : "attention",
    },
    {
      actionLabel: "Run detection",
      blockers: readiness?.moneyRails?.paycheckDetectionReady
        ? []
        : [...new Set(detectionGates.map(friendlyGateLabel))],
      body: "The user sets employer and amount rules, then PayShield posts the paycheck split before Safe to Spend is recalculated.",
      endpoint: "POST /api/app/paychecks/detect",
      icon: Radar,
      key: "detect",
      metric: `${detectionRules.length} saved rule${detectionRules.length === 1 ? "" : "s"}`,
      onAction: detectPaycheck,
      setupHref: "/launch#detection",
      setupLabel: "Set up detection",
      state: depositState,
      status: readiness?.moneyRails?.paycheckDetectionReady
        ? "automatic"
        : readiness?.moneyRails?.bankLinkReady
          ? "event signing"
          : "core required",
      title: "Detect paychecks",
      tone: readiness?.moneyRails?.paycheckDetectionReady
        ? "ready"
        : "attention",
    },
    {
      actionLabel: "Edit buckets",
      blockers: [],
      body: "Households can add categories, set targets, reorder priorities, choose lock modes, and preview Safe to Spend before a paycheck posts.",
      endpoint: "POST /api/app/buckets",
      icon: Split,
      key: "protect",
      metric: `${protectedTransferBuckets.length} buckets`,
      onAction: () => focusProductSection("bucket-studio", setBucketState),
      setupHref: "#bucket-studio",
      setupLabel: "Open bucket studio",
      state: bucketState,
      status: "customizable now",
      title: "Protect funds first",
      tone: "ready",
    },
    {
      actionLabel: "Create transfer intent",
      blockers: readiness?.moneyRails?.transferReady
        ? []
        : [...new Set(transferGates.map(friendlyGateLabel))],
      body: "Protected money can only leave through approved payees, bucket limits, ledger checks, and provider handoff records.",
      endpoint: "POST /api/app/transfers",
      icon: ArrowRightLeft,
      key: "move",
      metric: selectedBucket ? formatMoney(selectedBucket.availableCents) : "bucket",
      onAction: createTransfer,
      setupHref: "/launch#movement",
      setupLabel: "Set up transfers",
      state: transferState,
      status: readiness?.moneyRails?.transferReady
        ? "movement ready"
        : "intent validation",
      title: "Move protected funds",
      tone: readiness?.moneyRails?.transferReady ? "ready" : "attention",
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
    setupHref?: string;
    setupLabel?: string;
    state: ActionState;
    status: string;
    title: string;
    tone: "attention" | "ready";
  }>;
  const commercialReality = [
    {
      blockers: readiness?.commercial?.paymentCollectionReady
        ? []
        : [...new Set(commercialGates.map(friendlyGateLabel))],
      detail:
        "Stripe checkout collects the subscription. Webhook and core activation turn that payment into paid app access.",
      endpoint: "POST /api/public/billing/checkout + POST /api/app/billing/checkout",
      icon: BadgeDollarSign,
      label: "Make money",
      provider: "Stripe",
      ready: Boolean(readiness?.commercial?.paymentCollectionReady),
      status: readiness?.commercial?.paymentCollectionReady
        ? readiness?.commercial?.paidAccessReady
          ? "collecting + activating"
          : "collecting, activation pending"
        : "Stripe setup needed",
    },
    {
      blockers: readiness?.moneyRails?.bankLinkReady
        ? []
        : [...new Set(bankLinkGates.map(friendlyGateLabel))],
      detail:
        "Plaid Link opens from the app, exchanges the public token, and stores token custody outside the browser.",
      endpoint: "POST /api/app/bank-link/token + POST /api/app/bank-link/exchange",
      icon: Link2,
      label: "Connect banks",
      provider: "Plaid Link",
      ready: Boolean(readiness?.moneyRails?.bankLinkReady),
      status: readiness?.moneyRails?.bankLinkReady
        ? "ready"
        : readiness?.moneyRails?.plaidConfigured
          ? "vault setup needed"
          : "Plaid setup needed",
    },
    {
      blockers: readiness?.moneyRails?.paycheckDetectionReady
        ? []
        : [...new Set(detectionGates.map(friendlyGateLabel))],
      detail:
        "Payroll rules, Plaid transaction sync, and signed provider events detect income before Safe to Spend is recalculated.",
      endpoint: "POST /api/app/paychecks/rules + POST /api/app/paychecks/sync",
      icon: Radar,
      label: "Detect payroll",
      provider: readiness?.moneyRails?.detectionMode ?? "Plaid/provider events",
      ready: Boolean(readiness?.moneyRails?.paycheckDetectionReady),
      status: readiness?.moneyRails?.paycheckDetectionReady
        ? "automatic"
        : "rule setup available",
    },
    {
      blockers: [],
      detail:
        "Custom buckets, target amounts, due cadence, payees, and unlock rules define what money is protected first.",
      endpoint: "POST /api/app/buckets + POST /api/app/payees",
      icon: Split,
      label: "Protect funds",
      provider: "PayShield ledger",
      ready: true,
      status: "customizable now",
    },
    {
      blockers: readiness?.moneyRails?.transferReady
        ? []
        : [...new Set(transferGates.map(friendlyGateLabel))],
      detail:
        "Transfers and card decisions validate Safe to Spend, approved payees, bucket balances, and provider handoff state.",
      endpoint: "POST /api/app/transfers + POST /api/card/authorize",
      icon: ArrowRightLeft,
      label: "Move money",
      provider: "BaaS/transfer adapter",
      ready: Boolean(readiness?.moneyRails?.transferReady),
      status: readiness?.moneyRails?.transferReady
        ? "provider handoff ready"
        : "intent validation active",
    },
  ] satisfies Array<{
    blockers: string[];
    detail: string;
    endpoint: string;
    icon: LucideIcon;
    label: string;
    provider: string;
    ready: boolean;
    status: string;
  }>;

  return (
    <section
      className="relative z-10 border-b border-white/10 py-8"
      id="money-operations"
    >
      <div className="grid gap-8">
        <div className="brand-panel rounded-[8px] p-4 sm:p-5">
          <div className="grid gap-5 xl:grid-cols-[0.76fr_1.24fr]">
            <div className="accent-rule pt-5">
              <p className="inline-flex items-center gap-2 rounded-[8px] border border-[#68f0c2]/30 bg-[#68f0c2]/10 px-3 py-2 text-sm font-black uppercase text-[#d9ffef]">
                <BadgeDollarSign className="size-4" aria-hidden="true" />
                Revenue-to-protection console
              </p>
              <h2 className="mt-4 text-3xl font-black leading-tight text-white sm:text-4xl">
                Run the money product from here.
              </h2>
              <p className="mt-4 text-sm font-bold leading-6 text-[#c9d0da]">
                The app earns first, then connects the bank, detects payroll,
                protects buckets, and releases money only through approved
                routes. Each button calls the route that powers that rail.
              </p>
              <div className="mt-5 rounded-[8px] border border-[#39e8ff]/25 bg-[#06141a]/80 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="brand-kicker">Guided money flow</p>
                    <h3 className="mt-1 text-2xl font-black text-white">
                      {guidedMoneyFlow?.headline ??
                        "Pay -> connect -> route -> detect -> protect -> release"}
                    </h3>
                  </div>
                  <span className="rounded-[8px] border border-white/10 bg-black/35 px-3 py-2 text-xs font-black uppercase text-[#dffaff]">
                    {formatStateLabel(guidedMoneyFlow?.mode)}
                  </span>
                </div>
                <p className="mt-3 text-sm font-bold leading-6 text-[#c9d0da]">
                  {guidedMoneyFlow?.summary ??
                    "One guided operating path collects revenue, links the funding source, identifies payroll, funds protected buckets first, and releases only approved money."}
                </p>

                <div className="mt-4 overflow-hidden rounded-full bg-black/45">
                  <span
                    className="block h-2 rounded-full bg-gradient-to-r from-[#68f0c2] via-[#39e8ff] to-[#ffb237]"
                    style={{ width: `${Math.max(2, guidedPercent)}%` }}
                  />
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <span className="rounded-[8px] border border-[#68f0c2]/20 bg-[#68f0c2]/10 p-2">
                    <span className="brand-kicker">Ready</span>
                    <span className="mt-1 block text-xl font-black text-white">
                      {guidedReadyCount}/{guidedTotalCount}
                    </span>
                  </span>
                  <span className="rounded-[8px] border border-[#39e8ff]/20 bg-[#39e8ff]/10 p-2">
                    <span className="brand-kicker">Runnable now</span>
                    <span className="mt-1 block text-xl font-black text-white">
                      {guidedAvailableCount}
                    </span>
                  </span>
                  <span className="rounded-[8px] border border-[#ffb237]/20 bg-[#ffb237]/10 p-2">
                    <span className="brand-kicker">Needs setup</span>
                    <span className="mt-1 block text-xl font-black text-white">
                      {guidedBlockedCount}
                    </span>
                  </span>
                </div>

                <div className="mt-4 rounded-[8px] border border-[#ffb237]/25 bg-[#ffb237]/10 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="brand-kicker">Next best action</p>
                      <p className="mt-1 text-lg font-black text-white">
                        {guidedNextStep?.title ?? nextExecutableRail.title}
                      </p>
                    </div>
                    <span className="rounded-[8px] bg-black/35 px-2.5 py-1 text-xs font-black capitalize text-[#ffe4ad]">
                      {formatStateLabel(guidedNextStep?.status)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-bold leading-6 text-[#ffe4bd]">
                    {guidedNextStep?.canRunNow
                      ? "This action can run in the current production configuration."
                      : guidedNextStep?.blockers?.[0]
                        ? `First blocker: ${guidedNextStep.blockers[0]}.`
                        : "Open the matching control and continue the workflow."}
                  </p>
                  <code className="mt-2 block overflow-x-auto font-mono text-[0.68rem] font-black uppercase text-[#ffcf72]">
                    {guidedNextStep?.endpoint ?? nextExecutableRail.endpoint}
                  </code>
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <button
                  className="brand-button-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] px-4 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={nextExecutableRail.state.status === "loading"}
                  onClick={() => {
                    void nextExecutableRail.onAction();
                  }}
                  type="button"
                >
                  {nextExecutableRail.state.status === "loading" ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <NextExecutableIcon className="size-4" aria-hidden="true" />
                  )}
                  Run next: {nextExecutableRail.actionLabel}
                </button>
                <a
                  className="brand-button-blue inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] px-4 text-sm font-black"
                  href="/launch"
                >
                  <KeyRound className="size-4" aria-hidden="true" />
                  Configure providers
                </a>
              </div>
              <div className="mt-4">
                <StateMessage state={nextExecutableRail.state} />
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {displayGuidedSteps.map((step, index) => {
                const rail = railByKey.get(step.key);
                const Icon = rail?.icon ?? ShieldAlert;
                const ready = Boolean(step.ready);
                const loading = rail?.state.status === "loading";

                return (
                  <button
                    className={`group grid min-h-[13.875rem] content-start gap-3 rounded-[8px] border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-55 ${
                      ready
                        ? "border-[#68f0c2]/25 bg-[#68f0c2]/[0.08] hover:border-[#68f0c2]/45"
                        : "border-[#ffb237]/25 bg-[#ffb237]/[0.085] hover:border-[#ffcf72]/45"
                    }`}
                    disabled={loading}
                    key={step.key}
                    onClick={() => {
                      if (rail) {
                        void rail.onAction();
                        return;
                      }

                      if (step.uiTarget) {
                        document
                          .getElementById(step.uiTarget)
                          ?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }
                    }}
                    type="button"
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span
                        className={`grid size-10 place-items-center rounded-[8px] border ${
                          ready
                            ? "border-[#68f0c2]/25 bg-black/30 text-[#68f0c2]"
                            : "border-[#ffb237]/25 bg-black/30 text-[#ffcf72]"
                        }`}
                      >
                        {loading ? (
                          <Loader2
                            className="size-5 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <Icon className="size-5" aria-hidden="true" />
                        )}
                      </span>
                      <span
                        className={`rounded-[8px] px-2.5 py-1 text-xs font-black ${
                          ready
                            ? "bg-[#68f0c2]/10 text-[#9af7d5]"
                            : "bg-[#ffb237]/10 text-[#ffe4ad]"
                        }`}
                      >
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </span>
                    <span>
                      <span className="block text-sm font-black text-white">
                        {step.title}
                      </span>
                      <span className="mt-1 block text-xs font-bold leading-5 text-[#aab3c2]">
                        {step.primaryAction}
                      </span>
                    </span>
                    <span className="mt-auto block truncate font-mono text-[0.68rem] font-black uppercase text-[#39e8ff]">
                      {step.endpoint}
                    </span>
                    <span
                      className={`text-xs font-bold leading-5 ${
                        ready ? "text-[#9af7d5]" : "text-[#ffe4ad]"
                      }`}
                    >
                      {ready
                        ? "Ready now"
                        : step.blockers?.[0]
                          ? `Needs ${step.blockers[0]}`
                          : formatStateLabel(step.status)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[0.82fr_1.18fr]">
          <div className="accent-rule pt-5 lg:col-span-2">
            <p className="inline-flex items-center gap-2 rounded-[8px] border border-[#39e8ff]/30 bg-[#39e8ff]/10 px-3 py-2 text-sm font-black uppercase tracking-[0.14em] text-[#dffaff]">
              <Landmark className="size-4" aria-hidden="true" />
              Start here / Money operations
            </p>
            <h2 className="mt-4 text-3xl font-black leading-tight text-white sm:text-4xl">
              Get paid, connect the bank, then protect the paycheck.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#c9d0da]">
              This is the working path inside PayShield: charge the household,
              bind that customer to a household record, connect the bank source,
              detect payroll, split the ledger, and validate every transfer or
              card decision against protected funds.
            </p>
            <div className="mt-6 rounded-[8px] border border-[#39e8ff]/25 bg-[#06141a]/80 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="brand-kicker">What actually turns on</p>
                  <h3 className="mt-1 text-2xl font-black text-white">
                    Revenue, bank link, detection, protection, and movement are
                    the app lanes.
                  </h3>
                </div>
                <span className="inline-flex min-h-9 items-center rounded-[8px] border border-white/10 bg-black/35 px-3 text-xs font-black uppercase text-[#dffaff]">
                  Credential-gated
                </span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {commercialReality.map((lane) => {
                  const Icon = lane.icon;

                  return (
                    <article
                      className={`grid min-h-56 content-start gap-3 rounded-[8px] border p-3 ${
                        lane.ready
                          ? "border-[#68f0c2]/25 bg-[#68f0c2]/[0.07]"
                          : "border-[#ffb237]/25 bg-[#ffb237]/[0.08]"
                      }`}
                      key={lane.label}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span
                          className={`grid size-10 place-items-center rounded-[8px] border ${
                            lane.ready
                              ? "border-[#68f0c2]/25 bg-black/30 text-[#68f0c2]"
                              : "border-[#ffb237]/25 bg-black/30 text-[#ffcf72]"
                          }`}
                        >
                          <Icon className="size-5" aria-hidden="true" />
                        </span>
                        <span
                          className={`rounded-[8px] px-2.5 py-1 text-[0.68rem] font-black capitalize ${
                            lane.ready
                              ? "bg-[#68f0c2]/10 text-[#9af7d5]"
                              : "bg-[#ffb237]/10 text-[#ffe4ad]"
                          }`}
                        >
                          {lane.status}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs font-black uppercase text-[#8f99aa]">
                          {lane.provider}
                        </p>
                        <h4 className="mt-1 text-lg font-black text-white">
                          {lane.label}
                        </h4>
                        <p className="mt-2 text-sm font-bold leading-6 text-[#c9d0da]">
                          {lane.detail}
                        </p>
                      </div>
                      <code className="mt-auto block overflow-x-auto rounded-[8px] border border-white/10 bg-black/40 px-3 py-2 font-mono text-[0.68rem] font-black uppercase text-[#39e8ff]">
                        {lane.endpoint}
                      </code>
                      {lane.blockers.length ? (
                        <p className="text-xs font-bold leading-5 text-[#ffe4ad]">
                          Needs {lane.blockers.slice(0, 2).join(", ")}
                          {lane.blockers.length > 2 ? " +" : ""}.
                        </p>
                      ) : (
                        <p className="text-xs font-bold leading-5 text-[#9af7d5]">
                          Ready from the current app state.
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
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
                  {guidedAvailableCount}/{guidedTotalCount}
                </p>
              </div>
              <div className="rounded-[8px] border border-[#ffb237]/25 bg-[#ffb237]/10 p-3">
                <p className="brand-kicker">Setup blockers</p>
                <p className="mt-2 text-3xl font-black text-white">
                  {guidedBlockedCount}
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

          <div className="brand-panel rounded-[8px] p-4 sm:p-5 lg:col-span-2">
            <div className="grid gap-5 xl:grid-cols-[0.86fr_1.14fr]">
              <div className="self-start rounded-[8px] border border-[#ffb237]/25 bg-[#ffb237]/10 p-4">
                <p className="brand-kicker">Next executable action</p>
                <h3 className="mt-2 text-3xl font-black leading-tight text-white">
                  {nextExecutableRail.title}
                </h3>
                <p className="mt-3 text-sm font-bold leading-6 text-[#ffe4bd]">
                  {nextExecutableRail.body}
                </p>
                <code className="mt-4 block overflow-x-auto rounded-[8px] border border-white/10 bg-black/35 px-3 py-2 font-mono text-xs font-black uppercase text-[#ffcf72]">
                  {nextExecutableRail.endpoint}
                </code>
                <button
                  className="brand-button-primary mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] px-4 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={nextExecutableRail.state.status === "loading"}
                  onClick={() => {
                    void nextExecutableRail.onAction();
                  }}
                  type="button"
                >
                  {nextExecutableRail.state.status === "loading" ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <NextExecutableIcon className="size-4" aria-hidden="true" />
                  )}
                  {nextExecutableRail.actionLabel}
                </button>
                <div className="mt-3">
                  <StateMessage state={nextExecutableRail.state} />
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="brand-kicker">Owner revenue lane</p>
                      <h3 className="mt-1 text-xl font-black text-white">
                        Get paid and prove control.
                      </h3>
                    </div>
                    <BadgeDollarSign
                      className="size-5 text-[#68f0c2]"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="mt-3 grid gap-3">
                    {ownerWorkflow.map((item) => (
                      <WorkflowCheckpoint
                        detail={item.detail}
                        endpoint={item.endpoint}
                        key={item.label}
                        label={item.label}
                        ready={item.ready}
                        value={item.value}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="brand-kicker">Household money lane</p>
                      <h3 className="mt-1 text-xl font-black text-white">
                        Connect, protect, release.
                      </h3>
                    </div>
                    <ShieldAlert
                      className="size-5 text-[#39e8ff]"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="mt-3 grid gap-3">
                    {householdWorkflow.map((item) => (
                      <WorkflowCheckpoint
                        detail={item.detail}
                        endpoint={item.endpoint}
                        key={item.label}
                        label={item.label}
                        ready={item.ready}
                        value={item.value}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="brand-panel rounded-[8px] p-4 sm:p-5 lg:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="brand-kicker">Use PayShield</p>
                <h3 className="mt-1 text-2xl font-black text-white">
                  Six controls run the money product.
                </h3>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-[#c9d0da]">
                  These are the actions that make the product usable: charge the
                  account, connect a bank, set paycheck routing, detect payroll,
                  customize protection, and release only approved protected
                  money. If a provider secret is missing, the card tells you the
                  exact blocker before the request reaches live rails.
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
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {capabilityCards.map((card) => (
                <CapabilityCard
                  actionLabel={card.actionLabel}
                  blockers={card.blockers}
                  body={card.body}
                  endpoint={card.endpoint}
                  icon={card.icon}
                  key={card.key}
                  metric={card.metric}
                  onAction={card.onAction}
                  setupHref={card.setupHref}
                  setupLabel={card.setupLabel}
                  state={card.state}
                  status={card.status}
                  title={card.title}
                  tone={card.tone}
                />
              ))}
            </div>
          </div>

          <details className="brand-panel rounded-[8px] p-4 sm:p-5 lg:col-span-2">
            <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-4">
              <span>
                <span className="brand-kicker">Detailed rail diagnostics</span>
                <span className="mt-1 block text-2xl font-black text-white">
                  Every endpoint and blocker in one place.
                </span>
                <span className="mt-3 block max-w-2xl text-sm leading-6 text-[#c9d0da]">
                  Expand this when you need to inspect the checkout, bank-link,
                  paycheck, routing, transfer, and card-control rails behind the
                  operating controls above.
                </span>
              </span>
              <span className="inline-flex h-11 items-center justify-center rounded-[8px] border border-[#39e8ff]/25 bg-[#39e8ff]/10 px-4 text-sm font-black text-[#dffaff]">
                Open diagnostics
              </span>
            </summary>
            <div className="mt-5 flex justify-end">
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
          </details>
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
