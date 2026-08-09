"use client";

import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowRightLeft,
  BadgeDollarSign,
  BanknoteArrowDown,
  CalendarClock,
  Check,
  ChevronRight,
  CircleHelp,
  CreditCard,
  Download,
  Home,
  Landmark,
  Layers3,
  LifeBuoy,
  Link2,
  Loader2,
  LockKeyhole,
  Mail,
  Menu,
  ReceiptText,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
  Snowflake,
  SlidersHorizontal,
  Sparkles,
  UnlockKeyhole,
  WalletCards,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BillPaymentRecord } from "@/app/components/bill-payment-panel";
import { BillRoutingWorkspace } from "@/app/components/bill-routing-workspace";
import { BucketControlPanel } from "@/app/components/bucket-control-panel";
import { HouseholdMoneyProfilePanel } from "@/app/components/household-money-profile-panel";
import {
  GraystonLogo,
  PayShieldHeaderLogo,
  PayShieldMark,
} from "@/app/components/pay-shield-mark";
import { UnlockControlPanel } from "@/app/components/unlock-control-panel";
import {
  GRAYSTON_SUPPORT_EMAIL,
  PAYSHIELD_OWNERSHIP_LINE,
} from "@/app/lib/brand";
import {
  completeActionAttempt,
  idempotencyKeyForAction,
} from "@/app/lib/client-action-idempotency";
import type { ActionAttemptRef } from "@/app/lib/client-action-idempotency";
import type { BucketBalance, BucketId, Payee } from "@/app/lib/neobank/types.ts";

type AppView =
  | "today"
  | "paycheck"
  | "buckets"
  | "bills"
  | "card"
  | "activity"
  | "move"
  | "unlock";

type ActionState = {
  message: string;
  status: "idle" | "loading" | "ready" | "error";
};

type BankConnection = {
  accountMask?: string | null;
  accountName?: string | null;
  institutionName?: string | null;
  providerAccountId?: string;
  status?: string;
};

type DirectDepositSetup = {
  accountLast4?: string;
  accountName?: string;
  routingLast4?: string;
  status?: string;
};

type DetectionRule = {
  amountRangeCents?: { max?: number | null; min?: number | null };
  expectedFrequency?: string;
  id?: string;
  match?: {
    employerNamePattern?: string | null;
    transactionNamePattern?: string | null;
  };
  ruleName?: string;
  status?: string;
};

type TimelineItem = {
  amountCents?: number | null;
  at?: string | null;
  detail?: string | null;
  id: string;
  label: string;
  rail: string;
  status: string;
};

type OperationsPacket = {
  buckets?: BucketBalance[];
  balances?: {
    protectedCents?: number;
    safeToSpendCents?: number;
    totalCents?: number;
  };
  card?: {
    authorizationMode?: string;
    cardLast4?: string;
    status?: string;
  };
  commercialAccess?: {
    currentPeriodEnd?: string | null;
    priceLabel?: string;
    state?: string;
    subscriptionStatus?: string | null;
  };
  controls?: {
    payees?: Payee[];
  };
  directDeposit?: DirectDepositSetup;
  error?: string;
  generatedAt?: string;
  household?: { name?: string };
  operations?: {
    bankConnections?: BankConnection[];
    billPayments?: BillPaymentRecord[];
    cardDecisions?: Array<Record<string, unknown>>;
    directDepositSetups?: DirectDepositSetup[];
    journalEntries?: Array<Record<string, unknown>>;
    paycheckDetectionRules?: DetectionRule[];
    paycheckDetections?: Array<Record<string, unknown>>;
    reconciliationExceptions?: Array<Record<string, unknown>>;
    transferIntents?: Array<Record<string, unknown>>;
    unlockRequests?: Array<Record<string, unknown>>;
  };
  timeline?: TimelineItem[];
};

type PlaidMetadata = {
  account?: { id?: string; mask?: string; name?: string };
  institution?: { name?: string };
};

type PlaidHandler = {
  exit(): void;
  open(): void;
};

declare global {
  interface Window {
    Plaid?: {
      create(input: {
        onExit?: () => void;
        onSuccess: (publicToken: string, metadata: PlaidMetadata) => void;
        token: string;
      }): PlaidHandler;
    };
  }
}

const idleState: ActionState = { message: "", status: "idle" };
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
      existing.addEventListener(
        "error",
        () => reject(new Error("Bank connection could not be loaded.")),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Bank connection could not be loaded."));
    document.head.append(script);
  });

  return plaidScriptPromise;
}

function formatMoney(cents: number, digits = 0) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
    style: "currency",
  }).format(cents / 100);
}

function dollarsToCents(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0;
}

function safeSpendCentsFor(buckets: BucketBalance[]) {
  return (
    buckets.find((bucket) => bucket.id === "safe_spending")?.availableCents ?? 0
  );
}

function protectedCentsFor(buckets: BucketBalance[]) {
  return buckets
    .filter((bucket) => bucket.id !== "safe_spending")
    .reduce((sum, bucket) => sum + bucket.availableCents, 0);
}

function friendlyFailure(status: number, fallback: string) {
  if (status === 401 || status === 403) {
    return "Your account does not have access to this action.";
  }

  if (status === 423) {
    return "This feature is not available on your account yet. Support can help.";
  }

  if (status >= 500) {
    return "We could not complete that right now. Nothing was changed.";
  }

  return fallback;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "PS";
}

function relativeDate(value?: string | null) {
  if (!value) {
    return "Recently";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function safeHostedVerificationUrl(value?: string | null) {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);
    const localHttp =
      url.protocol === "http:" &&
      ["127.0.0.1", "::1", "localhost"].includes(url.hostname) &&
      process.env.NODE_ENV !== "production";

    return !url.username &&
      !url.password &&
      (url.protocol === "https:" || localHttp)
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}

function StateMessage({ state }: { state: ActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      className={`pay-state-message ${state.status === "error" ? "is-error" : "is-ready"}`}
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.status === "loading" ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : state.status === "error" ? (
        <CircleHelp className="size-4" aria-hidden="true" />
      ) : (
        <Check className="size-4" aria-hidden="true" />
      )}
      <span>{state.message}</span>
    </div>
  );
}

const primaryNavigation: Array<{
  icon: LucideIcon;
  label: string;
  view: AppView;
}> = [
  { icon: Home, label: "Today", view: "today" },
  { icon: Landmark, label: "Paycheck", view: "paycheck" },
  { icon: Layers3, label: "Buckets", view: "buckets" },
  { icon: ReceiptText, label: "Bills", view: "bills" },
  { icon: CreditCard, label: "Card", view: "card" },
  { icon: Activity, label: "Activity", view: "activity" },
];

export function HouseholdMoneyWorkspace({
  buckets,
  householdName,
  initialOperations,
  payees,
  priceLabel,
}: {
  buckets: BucketBalance[];
  householdName: string;
  initialOperations?: OperationsPacket;
  payees: Payee[];
  priceLabel: string;
}) {
  const [view, setView] = useState<AppView>("today");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [workspaceBuckets, setWorkspaceBuckets] = useState(buckets);
  const [workspacePayees, setWorkspacePayees] = useState(payees);
  const [operations, setOperations] = useState<OperationsPacket | undefined>(
    initialOperations,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [dataState, setDataState] = useState<ActionState>(
    initialOperations
      ? idleState
      : { message: "Loading your account...", status: "loading" },
  );
  const [checkoutState, setCheckoutState] = useState<ActionState>(idleState);
  const [bankState, setBankState] = useState<ActionState>(idleState);
  const [syncState, setSyncState] = useState<ActionState>(idleState);
  const [accountState, setAccountState] = useState<ActionState>(idleState);
  const [cardControlState, setCardControlState] = useState<ActionState>(idleState);
  const [ruleState, setRuleState] = useState<ActionState>(idleState);
  const [transferState, setTransferState] = useState<ActionState>(idleState);
  const [portalState, setPortalState] = useState<ActionState>(idleState);
  const [exportState, setExportState] = useState<ActionState>(idleState);
  const [ruleName, setRuleName] = useState("Primary paycheck");
  const [rulePattern, setRulePattern] = useState("");
  const [ruleMinimum, setRuleMinimum] = useState("");
  const [ruleFrequency, setRuleFrequency] = useState("biweekly");
  const protectedBuckets = useMemo(
    () => workspaceBuckets.filter((bucket) => bucket.id !== "safe_spending"),
    [workspaceBuckets],
  );
  const [transferBucketId, setTransferBucketId] = useState<BucketId>(
    protectedBuckets[0]?.id ?? "rent",
  );
  const [transferPayeeId, setTransferPayeeId] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const checkoutAttempt = useRef<ActionAttemptRef["current"]>(null);
  const cardStatusAttempt = useRef<ActionAttemptRef["current"]>(null);
  const transferAttempt = useRef<ActionAttemptRef["current"]>(null);
  const ruleHydrated = useRef(false);

  const bankConnections = operations?.operations?.bankConnections ?? [];
  const directDepositSetups = operations?.operations?.directDepositSetups ?? [];
  const detectionRules = operations?.operations?.paycheckDetectionRules ?? [];
  const safeSpendCents =
    operations?.balances?.safeToSpendCents ?? safeSpendCentsFor(workspaceBuckets);
  const protectedCents =
    operations?.balances?.protectedCents ?? protectedCentsFor(workspaceBuckets);
  const accessState = operations?.commercialAccess?.state ?? "needs_setup";
  const accessActive = accessState === "active";
  const bankConnected = bankConnections.some(
    (connection) => connection.status === "connected",
  );
  const routingReady =
    directDepositSetups.some((setup) => setup.status === "ready") ||
    operations?.directDeposit?.status === "ready";
  const ruleReady = detectionRules.some(
    (rule) => !rule.status || rule.status === "active",
  );
  const cardStatus = operations?.card?.status ?? "gated";
  const cardReady = ["issued", "active", "frozen", "live"].includes(cardStatus);
  const cardFrozen = cardStatus === "frozen";
  const setupChecks = [accessActive, bankConnected, ruleReady, routingReady, cardReady];
  const setupCount = setupChecks.filter(Boolean).length;
  const setupPercent = Math.round((setupCount / setupChecks.length) * 100);
  const timeline = operations?.timeline ?? [];
  const selectedTransferBucket =
    protectedBuckets.find((bucket) => bucket.id === transferBucketId) ??
    protectedBuckets[0];
  const transferPayees = workspacePayees.filter(
    (payee) =>
      payee.status === "approved" &&
      payee.allowedBucketId === selectedTransferBucket?.id,
  );
  const selectedTransferPayee =
    transferPayees.find((payee) => payee.id === transferPayeeId) ??
    transferPayees[0];
  const transferAmountCents = dollarsToCents(transferAmount);
  const transferLimit = Math.min(
    selectedTransferBucket?.availableCents ?? 0,
    selectedTransferPayee?.maxCents ?? 0,
  );
  const transferValid =
    transferAmountCents > 0 &&
    transferAmountCents <= transferLimit &&
    Boolean(selectedTransferBucket && selectedTransferPayee);
  const accountLoaded = Boolean(operations);

  const applyOperationsPayload = useCallback((payload: OperationsPacket) => {
    setOperations(payload);

    if (Array.isArray(payload.buckets)) {
      setWorkspaceBuckets(payload.buckets);
    }

    if (Array.isArray(payload.controls?.payees)) {
      setWorkspacePayees(payload.controls.payees);
    }

    const savedRule = payload.operations?.paycheckDetectionRules?.find(
      (rule) => !rule.status || rule.status === "active",
    );

    if (savedRule && !ruleHydrated.current) {
      setRuleName(savedRule.ruleName || "Primary paycheck");
      setRulePattern(
        savedRule.match?.transactionNamePattern ||
          savedRule.match?.employerNamePattern ||
          "",
      );
      setRuleMinimum(
        savedRule.amountRangeCents?.min
          ? String(savedRule.amountRangeCents.min / 100)
          : "",
      );
      setRuleFrequency(savedRule.expectedFrequency || "unknown");
      ruleHydrated.current = true;
    }
  }, []);

  const nextAction = !accessActive
    ? {
        body: "Activate your household membership to save and run money controls.",
        icon: BadgeDollarSign,
        label: "Start membership",
        onClick: startCheckout,
      }
    : !bankConnected
      ? {
          body: "Connect the account where your paycheck arrives.",
          icon: Link2,
          label: "Connect bank",
          onClick: connectBank,
        }
      : !ruleReady
        ? {
            body: "Tell PayShield how to recognize your paycheck.",
            icon: ScanSearch,
            label: "Set paycheck rule",
            onClick: () => selectView("paycheck"),
          }
        : !routingReady
          ? {
              body: "Finish account setup to receive paycheck routing details.",
              icon: ArrowDownToLine,
              label: "Finish account setup",
              onClick: startAccountSetup,
            }
          : {
              body: "Your money protections are ready. Review the next paycheck split.",
              icon: ShieldCheck,
              label: "Review paycheck",
              onClick: () => selectView("paycheck"),
            };

  useEffect(() => {
    let cancelled = false;

    async function loadOperations() {
      try {
        const response = await fetch("/api/app/operations", {
          cache: "no-store",
          headers: { accept: "application/json" },
        });
        const payload = (await response.json().catch(() => ({}))) as OperationsPacket;

        if (!cancelled && response.ok) {
          applyOperationsPayload(payload);
          setDataState(idleState);
        } else if (!cancelled) {
          setDataState({
            message:
              payload.error ||
              "Your account data could not be loaded. Balances are hidden until refresh succeeds.",
            status: "error",
          });
        }
      } catch {
        if (!cancelled) {
          setDataState({
            message:
              "Your account data could not be loaded. Balances are hidden until refresh succeeds.",
            status: "error",
          });
        }
      }
    }

    void loadOperations();

    return () => {
      cancelled = true;
    };
  }, [applyOperationsPayload]);

  function selectView(nextView: AppView) {
    setView(nextView);
    setMobileMenuOpen(false);
    window.requestAnimationFrame(() => {
      window.scrollTo({ behavior: "smooth", top: 0 });
    });
  }

  async function refreshOperations() {
    setRefreshing(true);

    try {
      const response = await fetch("/api/app/operations", {
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      const payload = (await response.json().catch(() => ({}))) as OperationsPacket;

      if (response.ok) {
        applyOperationsPayload(payload);
        setDataState(idleState);
      } else {
        setDataState({
          message: operations
            ? "Balances could not be refreshed. The last loaded values are still shown."
            : payload.error || "Your account data could not be loaded.",
          status: "error",
        });
      }
    } catch {
      setDataState({
        message: operations
          ? "Balances could not be refreshed. The last loaded values are still shown."
          : "Your account data could not be loaded.",
        status: "error",
      });
    } finally {
      setRefreshing(false);
    }
  }

  async function startCheckout() {
    setCheckoutState({ message: "Opening secure checkout...", status: "loading" });
    const intent = {
      cancelPath: "/app?billing=cancelled",
      successPath: "/app?billing=active",
    };
    const idempotencyKey = idempotencyKeyForAction(
      checkoutAttempt,
      "app-checkout",
      intent,
    );

    try {
      const response = await fetch("/api/app/billing/checkout", {
        body: JSON.stringify({
          ...intent,
          idempotencyKey,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        url?: string;
      };

      if (!response.ok || !payload.url) {
        setCheckoutState({
          message: friendlyFailure(response.status, "Checkout could not be opened."),
          status: "error",
        });
        return;
      }

      setCheckoutState({ message: "Checkout is ready.", status: "ready" });
      completeActionAttempt(checkoutAttempt, idempotencyKey);
      window.location.assign(payload.url);
    } catch {
      setCheckoutState({
        message: "Checkout could not be opened. Nothing was charged.",
        status: "error",
      });
    }
  }

  async function openBillingPortal() {
    setPortalState({ message: "Opening billing...", status: "loading" });

    try {
      const response = await fetch("/api/app/billing/portal", {
        body: JSON.stringify({ returnPath: "/app" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        url?: string;
      };

      if (!response.ok || !payload.url) {
        setPortalState({
          message: friendlyFailure(response.status, "Billing could not be opened."),
          status: "error",
        });
        return;
      }

      window.location.assign(payload.url);
    } catch {
      setPortalState({ message: "Billing could not be opened.", status: "error" });
    }
  }

  async function connectBank() {
    setBankState({ message: "Preparing a secure bank connection...", status: "loading" });

    try {
      const response = await fetch("/api/app/bank-link/token", {
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        linkToken?: string;
      };

      if (!response.ok || !payload.linkToken) {
        setBankState({
          message: friendlyFailure(response.status, "Bank connection could not be started."),
          status: "error",
        });
        return;
      }

      await loadPlaidScript();

      if (!window.Plaid) {
        throw new Error("Bank connection could not be loaded.");
      }

      const handler = window.Plaid.create({
        onExit: () => {
          setBankState({ message: "Bank connection closed.", status: "idle" });
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
            bankConnection?: BankConnection;
          };

          if (!exchange.ok) {
            setBankState({
              message: friendlyFailure(
                exchange.status,
                "Bank connection could not be completed.",
              ),
              status: "error",
            });
            return;
          }

          setBankState({
            message: `${exchangePayload.bankConnection?.institutionName || "Bank"} connected.`,
            status: "ready",
          });
          await refreshOperations();
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

  async function syncPaychecks() {
    setSyncState({ message: "Checking for new paycheck activity...", status: "loading" });

    try {
      const response = await fetch("/api/app/paychecks/sync", {
        body: JSON.stringify({ maxPages: 3 }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        detectionCount?: number;
        skippedCount?: number;
        sync?: { addedCount?: number; modifiedCount?: number };
      };

      if (!response.ok) {
        setSyncState({
          message: friendlyFailure(response.status, "Paycheck activity could not be checked."),
          status: "error",
        });
        return;
      }

      const checked =
        (payload.sync?.addedCount ?? 0) + (payload.sync?.modifiedCount ?? 0);
      setSyncState({
        message: `${checked} new transactions checked. ${payload.detectionCount ?? 0} paycheck deposits found.`,
        status: "ready",
      });
      await refreshOperations();
    } catch {
      setSyncState({
        message: "Paycheck activity could not be checked.",
        status: "error",
      });
    }
  }

  async function startAccountSetup() {
    setAccountState({ message: "Continuing account setup...", status: "loading" });

    try {
      const response = await fetch("/api/app/onboarding/start", {
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        card?: OperationsPacket["card"];
        directDeposit?: DirectDepositSetup;
        kyc?: {
          status?: string;
          verificationUrl?: string | null;
        };
        message?: string;
      };

      if (!response.ok && response.status !== 202) {
        setAccountState({
          message: friendlyFailure(response.status, "Account setup could not continue."),
          status: "error",
        });
        return;
      }

      setOperations((current) => ({
        ...(current ?? {}),
        card: payload.card ?? current?.card,
        directDeposit: payload.directDeposit ?? current?.directDeposit,
      }));
      const verificationUrl = safeHostedVerificationUrl(
        payload.kyc?.verificationUrl,
      );

      if (response.status === 202 && verificationUrl) {
        setAccountState({
          message: "Opening secure identity verification...",
          status: "ready",
        });
        window.location.assign(verificationUrl);
        return;
      }

      setAccountState({
        message:
          response.status === 202
            ? "Identity review is in progress. We will continue setup after approval."
            : payload.message || "Account setup is complete.",
        status: "ready",
      });
      await refreshOperations();
    } catch {
      setAccountState({
        message: "Account setup could not continue. Nothing was changed.",
        status: "error",
      });
    }
  }

  async function changeCardStatus() {
    if (!cardReady) {
      await startAccountSetup();
      return;
    }

    const nextStatus = cardFrozen ? "active" : "frozen";
    setCardControlState({
      message: cardFrozen ? "Activating card..." : "Freezing card...",
      status: "loading",
    });
    const intent = { status: nextStatus };
    const idempotencyKey = idempotencyKeyForAction(
      cardStatusAttempt,
      `card-status-${nextStatus}`,
      intent,
    );

    try {
      const response = await fetch("/api/app/card/status", {
        body: JSON.stringify({
          ...intent,
          idempotencyKey,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        card?: OperationsPacket["card"];
        error?: string;
        message?: string;
      };

      if (!response.ok || !payload.card) {
        setCardControlState({
          message: payload.error ?? "Card status could not be changed.",
          status: "error",
        });
        return;
      }

      setOperations((current) => ({
        ...(current ?? {}),
        card: payload.card,
      }));
      completeActionAttempt(cardStatusAttempt, idempotencyKey);
      setCardControlState({
        message:
          payload.message ??
          (nextStatus === "frozen" ? "Card frozen." : "Card activated."),
        status: "ready",
      });
      await refreshOperations();
    } catch {
      setCardControlState({
        message: "Card status could not be changed. Nothing was changed.",
        status: "error",
      });
    }
  }

  async function saveDetectionRule() {
    setRuleState({ message: "Saving paycheck rule...", status: "loading" });

    try {
      const response = await fetch("/api/app/paychecks/rules", {
        body: JSON.stringify({
          employerNamePattern: rulePattern,
          expectedFrequency: ruleFrequency,
          idempotencyKey: `app-paycheck-rule-${ruleName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
          minimumAmountCents: dollarsToCents(ruleMinimum),
          priority: 100,
          providerName: "plaid",
          ruleName,
          status: "active",
          transactionNamePattern: rulePattern,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        setRuleState({
          message: friendlyFailure(response.status, "Paycheck rule could not be saved."),
          status: "error",
        });
        return;
      }

      setRuleState({ message: "Paycheck rule saved.", status: "ready" });
      await refreshOperations();
    } catch {
      setRuleState({ message: "Paycheck rule could not be saved.", status: "error" });
    }
  }

  async function createTransfer() {
    if (!transferValid || !selectedTransferBucket || !selectedTransferPayee) {
      setTransferState({
        message: "Choose an approved destination and an amount within its limit.",
        status: "error",
      });
      return;
    }

    setTransferState({ message: "Reviewing transfer...", status: "loading" });
    const intent = {
      amountCents: transferAmountCents,
      destinationPayeeId: selectedTransferPayee.id,
      sourceBucketId: selectedTransferBucket.id,
    };
    const idempotencyKey = idempotencyKeyForAction(
      transferAttempt,
      "app-transfer",
      intent,
    );

    try {
      const response = await fetch("/api/app/transfers", {
        body: JSON.stringify({
          ...intent,
          idempotencyKey,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        setTransferState({
          message: friendlyFailure(response.status, "Transfer could not be created."),
          status: "error",
        });
        return;
      }

      setTransferState({ message: "Transfer request created.", status: "ready" });
      completeActionAttempt(transferAttempt, idempotencyKey);
      setTransferAmount("");
      await refreshOperations();
    } catch {
      setTransferState({
        message: "Transfer could not be created. Nothing was moved.",
        status: "error",
      });
    }
  }

  async function exportActivity() {
    setExportState({ message: "Preparing your export...", status: "loading" });

    try {
      const response = await fetch("/api/app/audit/export", {
        cache: "no-store",
        headers: { accept: "application/json" },
      });

      if (!response.ok) {
        setExportState({
          message: friendlyFailure(response.status, "Activity export could not be prepared."),
          status: "error",
        });
        return;
      }

      const payload = await response.json();
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `payshield-activity-${new Date().toISOString().slice(0, 10)}.json`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      setExportState({ message: "Activity export downloaded.", status: "ready" });
    } catch {
      setExportState({ message: "Activity export could not be prepared.", status: "error" });
    }
  }

  function changeTransferBucket(nextBucketId: BucketId) {
    setTransferBucketId(nextBucketId);
    setTransferPayeeId(
      workspacePayees.find(
        (payee) =>
          payee.status === "approved" && payee.allowedBucketId === nextBucketId,
      )?.id ?? "",
    );
  }

  return (
    <div className="pay-app-shell min-h-screen">
      <header className="pay-app-header">
        <div className="pay-app-header-inner">
          <Link aria-label="PayShield home" className="pay-app-logo" href="/app">
            <PayShieldHeaderLogo priority />
          </Link>

          <nav aria-label="PayShield" className="pay-app-nav">
            {primaryNavigation.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  aria-current={view === item.view ? "page" : undefined}
                  className="pay-app-nav-button"
                  data-active={view === item.view}
                  key={item.view}
                  onClick={() => selectView(item.view)}
                  type="button"
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="pay-app-account">
            <button
              aria-label="Refresh balances"
              className="pay-icon-button"
              disabled={refreshing}
              onClick={refreshOperations}
              title="Refresh balances"
              type="button"
            >
              <RefreshCw
                className={`size-4 ${refreshing ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
            </button>
            <button
              aria-expanded={mobileMenuOpen}
              aria-label="Open navigation"
              className="pay-icon-button pay-mobile-menu-button"
              onClick={() => setMobileMenuOpen((current) => !current)}
              type="button"
            >
              {mobileMenuOpen ? (
                <X className="size-5" aria-hidden="true" />
              ) : (
                <Menu className="size-5" aria-hidden="true" />
              )}
            </button>
            <span className="pay-account-avatar" aria-hidden="true">
              {initials(householdName)}
            </span>
          </div>
        </div>

        {mobileMenuOpen ? (
          <nav aria-label="Mobile PayShield" className="pay-mobile-menu">
            {primaryNavigation.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  className="pay-mobile-menu-item"
                  data-active={view === item.view}
                  key={item.view}
                  onClick={() => selectView(item.view)}
                  type="button"
                >
                  <Icon className="size-5" aria-hidden="true" />
                  <span>{item.label}</span>
                  <ChevronRight className="ml-auto size-4" aria-hidden="true" />
                </button>
              );
            })}
          </nav>
        ) : null}
      </header>

      <main className="pay-app-main">
        <StateMessage state={dataState} />
        {view === "today" ? (
          <div className="pay-view pay-today-view">
            <div className="pay-view-heading">
              <div>
                <p className="pay-eyebrow">Good to see you</p>
                <h1>{householdName}</h1>
              </div>
              <p className="pay-date-label">
                {new Intl.DateTimeFormat("en-US", {
                  day: "numeric",
                  month: "long",
                  weekday: "long",
                }).format(new Date())}
              </p>
            </div>
            <section className="pay-overview-grid" aria-label="Money overview">
              <article className="pay-safe-card">
                <div className="pay-safe-card-topline">
                  <span className="pay-balance-label">
                    <WalletCards className="size-4" aria-hidden="true" />
                    Safe to Spend
                  </span>
                  <span className="pay-live-pill">
                    <span aria-hidden="true" /> {accountLoaded ? "Current" : "Unavailable"}
                  </span>
                </div>
                <p className="pay-safe-value">
                  {accountLoaded ? formatMoney(safeSpendCents, 2) : "--"}
                </p>
                <p className="pay-safe-caption">
                  {accountLoaded
                    ? `Available after ${formatMoney(protectedCents)} is set aside.`
                    : "Balances remain hidden until your account loads."}
                </p>
                <div className="pay-safe-actions">
                  <button
                    className="pay-primary-button"
                    disabled={!accountLoaded}
                    onClick={() => selectView("move")}
                    type="button"
                  >
                    <ArrowRightLeft className="size-4" aria-hidden="true" />
                    Move money
                  </button>
                  <button
                    className="pay-secondary-button"
                    disabled={!accountLoaded}
                    onClick={() => selectView("bills")}
                    type="button"
                  >
                    <ReceiptText className="size-4" aria-hidden="true" />
                    Pay a bill
                  </button>
                </div>
              </article>

              <article className="pay-next-card">
                <div className="pay-next-card-head">
                  <span className="pay-soft-icon">
                    <Sparkles className="size-5" aria-hidden="true" />
                  </span>
                  <span className="pay-progress-label">{setupPercent}% set up</span>
                </div>
                <h2>Your next best step</h2>
                <p>{nextAction.body}</p>
                <button className="pay-next-action" onClick={nextAction.onClick} type="button">
                  <nextAction.icon className="size-4" aria-hidden="true" />
                  {nextAction.label}
                  <ArrowRight className="ml-auto size-4" aria-hidden="true" />
                </button>
                <div className="pay-progress-track" aria-label={`${setupPercent}% set up`}>
                  <span style={{ width: `${setupPercent}%` }} />
                </div>
                <StateMessage state={checkoutState} />
                <StateMessage state={bankState} />
                <StateMessage state={accountState} />
              </article>
            </section>

            <section className="pay-section-block" aria-labelledby="protected-heading">
              <div className="pay-section-heading">
                <div>
                  <p className="pay-eyebrow">Protected first</p>
                  <h2 id="protected-heading">Your buckets</h2>
                </div>
                <button className="pay-text-button" onClick={() => selectView("buckets")} type="button">
                  Manage buckets <ChevronRight className="size-4" aria-hidden="true" />
                </button>
              </div>
              <div className="pay-bucket-grid">
                {accountLoaded ? protectedBuckets.slice(0, 6).map((bucket, index) => {
                  const fundedPercent = bucket.targetCents
                    ? Math.min(100, Math.round((bucket.availableCents / bucket.targetCents) * 100))
                    : 100;
                  return (
                    <article className="pay-bucket-card" key={bucket.id}>
                      <div className="pay-bucket-card-head">
                        <span className={`pay-bucket-symbol tone-${(index % 4) + 1}`}>
                          {bucket.protection === "bill_only" ? (
                            <ReceiptText className="size-5" aria-hidden="true" />
                          ) : (
                            <LockKeyhole className="size-5" aria-hidden="true" />
                          )}
                        </span>
                        <span className="pay-bucket-percent">{fundedPercent}%</span>
                      </div>
                      <h3>{bucket.name}</h3>
                      <p className="pay-bucket-amount">{formatMoney(bucket.availableCents)}</p>
                      <div className="pay-bucket-progress">
                        <span style={{ width: `${fundedPercent}%` }} />
                      </div>
                      <p className="pay-bucket-target">
                        {bucket.targetCents
                          ? `${formatMoney(bucket.targetCents)} target`
                          : bucket.due}
                      </p>
                    </article>
                  );
                }) : (
                  <div className="pay-empty-state">
                    <LockKeyhole className="size-5" aria-hidden="true" />
                    <span>Bucket balances will appear after your account loads.</span>
                  </div>
                )}
              </div>
            </section>

            <section className="pay-lower-grid">
              <article className="pay-activity-preview">
                <div className="pay-section-heading compact">
                  <div>
                    <p className="pay-eyebrow">Latest</p>
                    <h2>Activity</h2>
                  </div>
                  <button className="pay-text-button" onClick={() => selectView("activity")} type="button">
                    View all <ChevronRight className="size-4" aria-hidden="true" />
                  </button>
                </div>
                <div className="pay-activity-list">
                  {timeline.length ? (
                    timeline.slice(0, 4).map((item) => (
                      <div className="pay-activity-row" key={item.id}>
                        <span className="pay-activity-icon">
                          {item.rail === "ledger" ? (
                            <BanknoteArrowDown className="size-4" aria-hidden="true" />
                          ) : (
                            <Activity className="size-4" aria-hidden="true" />
                          )}
                        </span>
                        <span className="pay-activity-copy">
                          <strong>{item.label.replace(/_/g, " ")}</strong>
                          <small>{item.detail || "Recorded by PayShield"}</small>
                        </span>
                        <span className="pay-activity-meta">
                          <strong>
                            {item.amountCents ? formatMoney(item.amountCents) : item.status.replace(/_/g, " ")}
                          </strong>
                          <small>{relativeDate(item.at)}</small>
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="pay-empty-state">
                      <Activity className="size-5" aria-hidden="true" />
                      <span>Your account activity will appear here.</span>
                    </div>
                  )}
                </div>
              </article>

              <article className="pay-card-preview">
                <div className="pay-mini-card">
                  <div className="pay-mini-card-head">
                    <PayShieldMark className="size-9" />
                    <span>VISA</span>
                  </div>
                  <p className="pay-mini-card-number">
                    **** **** **** {operations?.card?.cardLast4 || "----"}
                  </p>
                  <div className="pay-mini-card-footer">
                    <span>{householdName}</span>
                    <span>{cardReady ? "Active" : "Setup"}</span>
                  </div>
                </div>
                <div className="pay-card-preview-copy">
                  <span className={`pay-status-dot ${cardReady ? "ready" : ""}`} />
                  <div>
                    <strong>{cardReady ? "Card controls active" : "Finish card setup"}</strong>
                    <p>Purchases use Safe to Spend. Protected money stays assigned.</p>
                  </div>
                  <button
                    aria-label="Open card"
                    className="pay-icon-button"
                    onClick={() => selectView("card")}
                    type="button"
                  >
                    <ChevronRight className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </article>
            </section>
          </div>
        ) : null}

        {view === "paycheck" ? (
          <div className="pay-view">
            <div className="pay-view-heading">
              <div>
                <p className="pay-eyebrow">Paycheck</p>
                <h1>Make every deposit arrive with a plan.</h1>
              </div>
              <button className="pay-secondary-button" onClick={syncPaychecks} type="button">
                {syncState.status === "loading" ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="size-4" aria-hidden="true" />
                )}
                Check for deposits
              </button>
            </div>

            <section className="pay-setup-strip" aria-label="Paycheck setup">
              <button className="pay-setup-step" data-ready={bankConnected} onClick={connectBank} type="button">
                <span>{bankConnected ? <Check className="size-4" /> : <Link2 className="size-4" />}</span>
                <strong>{bankConnected ? "Bank connected" : "Connect bank"}</strong>
                <small>{bankConnections[0]?.institutionName || "Paycheck account"}</small>
              </button>
              <button className="pay-setup-step" data-ready={ruleReady} onClick={() => document.getElementById("paycheck-rule")?.focus()} type="button">
                <span>{ruleReady ? <Check className="size-4" /> : <ScanSearch className="size-4" />}</span>
                <strong>{ruleReady ? "Rule saved" : "Set recognition rule"}</strong>
                <small>{detectionRules[0]?.ruleName || "Employer and amount"}</small>
              </button>
              <button className="pay-setup-step" data-ready={routingReady} onClick={startAccountSetup} type="button">
                <span>{routingReady ? <Check className="size-4" /> : <ArrowDownToLine className="size-4" />}</span>
                <strong>{routingReady ? "Routing ready" : "Set up routing"}</strong>
                <small>
                  {directDepositSetups[0]?.accountLast4
                    ? `Account ending ${directDepositSetups[0].accountLast4}`
                    : "Account and card setup"}
                </small>
              </button>
            </section>
            <StateMessage state={bankState} />
            <StateMessage state={syncState} />
            <StateMessage state={accountState} />

            <section className="pay-rule-panel">
              <div>
                <p className="pay-eyebrow">Recognition rule</p>
                <h2>Which deposits are paychecks?</h2>
                <p>Use the name and minimum amount that normally appear on your statement.</p>
              </div>
              <div className="pay-rule-form">
                <label>
                  Rule name
                  <input id="paycheck-rule" maxLength={80} onChange={(event) => setRuleName(event.target.value)} value={ruleName} />
                </label>
                <label>
                  Statement contains
                  <input maxLength={100} onChange={(event) => setRulePattern(event.target.value)} value={rulePattern} />
                </label>
                <label>
                  Minimum amount
                  <input min="1" onChange={(event) => setRuleMinimum(event.target.value)} type="number" value={ruleMinimum} />
                </label>
                <label>
                  Frequency
                  <select onChange={(event) => setRuleFrequency(event.target.value)} value={ruleFrequency}>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Every 2 weeks</option>
                    <option value="semimonthly">Twice a month</option>
                    <option value="monthly">Monthly</option>
                    <option value="unknown">Varies</option>
                  </select>
                </label>
                <button
                  className="pay-primary-button"
                  disabled={!ruleName.trim() || !rulePattern.trim() || dollarsToCents(ruleMinimum) <= 0 || ruleState.status === "loading"}
                  onClick={saveDetectionRule}
                  type="button"
                >
                  {ruleState.status === "loading" ? <Loader2 className="size-4 animate-spin" /> : <ScanSearch className="size-4" />}
                  Save rule
                </button>
              </div>
              <StateMessage state={ruleState} />
            </section>

            <div className="pay-workspace-view">
              <HouseholdMoneyProfilePanel
                buckets={workspaceBuckets}
                payees={workspacePayees}
              />
            </div>
          </div>
        ) : null}

        {view === "buckets" ? (
          <div className="pay-view">
            <div className="pay-view-heading">
              <div>
                <p className="pay-eyebrow">Protected buckets</p>
                <h1>Give every dollar one clear job.</h1>
              </div>
              <p className="pay-view-summary">Drag priorities, set targets, and choose how each bucket can be used.</p>
            </div>
            <div className="pay-workspace-view">
              <BucketControlPanel
                buckets={workspaceBuckets}
                onSaved={refreshOperations}
              />
            </div>
          </div>
        ) : null}

        {view === "bills" ? (
          <div className="pay-view">
            <div className="pay-view-heading">
              <div>
                <p className="pay-eyebrow">Bills</p>
                <h1>Protected money goes only where you approved.</h1>
              </div>
              <p className="pay-view-summary">Add a destination once, assign its bucket and limit, then schedule the bill.</p>
            </div>
            <div className="pay-workspace-view">
              <BillRoutingWorkspace
                billPayments={operations?.operations?.billPayments}
                buckets={workspaceBuckets}
                onOperationsRefresh={refreshOperations}
                onPayeesChanged={setWorkspacePayees}
                payees={workspacePayees}
              />
            </div>
          </div>
        ) : null}

        {view === "card" ? (
          <div className="pay-view">
            <div className="pay-view-heading">
              <div>
                <p className="pay-eyebrow">PayShield card</p>
                <h1>Spend what is free. Keep obligations protected.</h1>
              </div>
              <span className={`pay-card-status ${cardReady ? "ready" : ""}`} data-frozen={cardFrozen}>
                <span /> {cardFrozen ? "Frozen" : cardReady ? "Active" : "Setup needed"}
              </span>
            </div>
            <section className="pay-card-view-grid">
              <div className="pay-debit-card">
                <div className="pay-debit-card-top">
                  <PayShieldMark className="size-12" priority />
                  <span>VISA</span>
                </div>
                <p className="pay-debit-chip" aria-hidden="true" />
                <p className="pay-debit-number">**** **** **** {operations?.card?.cardLast4 || "----"}</p>
                <div className="pay-debit-footer">
                  <span><small>Cardholder</small>{householdName}</span>
                  <span><small>Available</small>{accountLoaded ? formatMoney(safeSpendCents) : "--"}</span>
                </div>
              </div>
              <div className="pay-card-controls">
                <div>
                  <span className="pay-soft-icon"><ShieldCheck className="size-5" /></span>
                  <h2>One honest spending number</h2>
                  <p>Every purchase checks Safe to Spend. Rent, bills, and other protected buckets are excluded.</p>
                </div>
                <div className="pay-card-rule-list">
                  <div><Check className="size-4" /><span><strong>Everyday purchases</strong><small>Use Safe to Spend</small></span></div>
                  <div><Check className="size-4" /><span><strong>Approved billers</strong><small>Use only their assigned bucket</small></span></div>
                  <div><LockKeyhole className="size-4" /><span><strong>Everything else</strong><small>Protected money stays put</small></span></div>
                </div>
                <div className="pay-card-action-row">
                  <button className={cardFrozen ? "pay-primary-button" : "pay-secondary-button"} disabled={cardControlState.status === "loading"} onClick={() => void changeCardStatus()} type="button">
                    {cardControlState.status === "loading" ? <Loader2 className="size-4 animate-spin" /> : cardFrozen ? <UnlockKeyhole className="size-4" /> : <Snowflake className="size-4" />}
                    {cardFrozen ? "Unfreeze card" : cardReady ? "Freeze card" : "Set up my card"}
                  </button>
                  {cardReady ? (
                    <button className="pay-icon-command" onClick={() => void refreshOperations()} title="Refresh card status" type="button">
                      <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
                      <span className="sr-only">Refresh card status</span>
                    </button>
                  ) : null}
                </div>
                <StateMessage state={accountState} />
                <StateMessage state={cardControlState} />
              </div>
            </section>
            <section className="pay-card-balance-band">
              <div><small>Safe to Spend</small><strong>{accountLoaded ? formatMoney(safeSpendCents, 2) : "--"}</strong></div>
              <div><small>Protected</small><strong>{accountLoaded ? formatMoney(protectedCents, 2) : "--"}</strong></div>
              <button onClick={() => selectView("unlock")} type="button">
                Need protected money? <span>Review an unlock</span><ChevronRight className="size-4" />
              </button>
            </section>
          </div>
        ) : null}

        {view === "move" ? (
          <div className="pay-view pay-narrow-view">
            <button className="pay-back-button" onClick={() => selectView("today")} type="button">
              <ArrowRight className="size-4 rotate-180" /> Back to Today
            </button>
            <div className="pay-view-heading">
              <div>
                <p className="pay-eyebrow">Move protected money</p>
                <h1>Send it only to an approved destination.</h1>
              </div>
            </div>
            <section className="pay-transfer-panel">
              <div className="pay-transfer-form">
                <label>
                  From bucket
                  <select onChange={(event) => changeTransferBucket(event.target.value as BucketId)} value={selectedTransferBucket?.id ?? ""}>
                    {protectedBuckets.map((bucket) => <option key={bucket.id} value={bucket.id}>{bucket.name} - {formatMoney(bucket.availableCents)}</option>)}
                  </select>
                </label>
                <label>
                  Approved destination
                  <select disabled={!transferPayees.length} onChange={(event) => setTransferPayeeId(event.target.value)} value={selectedTransferPayee?.id ?? ""}>
                    {transferPayees.map((payee) => <option key={payee.id} value={payee.id}>{payee.name}</option>)}
                  </select>
                </label>
                <label>
                  Amount
                  <input min="0" onChange={(event) => setTransferAmount(event.target.value)} type="number" value={transferAmount} />
                </label>
                <button className="pay-primary-button" disabled={!transferValid || transferState.status === "loading"} onClick={createTransfer} type="button">
                  {transferState.status === "loading" ? <Loader2 className="size-4 animate-spin" /> : <ArrowRightLeft className="size-4" />}
                  Review transfer
                </button>
                <StateMessage state={transferState} />
              </div>
              <aside className="pay-transfer-review">
                <span className="pay-soft-icon"><ShieldCheck className="size-5" /></span>
                <p className="pay-eyebrow">Transfer review</p>
                <h2>{formatMoney(transferAmountCents, 2)}</h2>
                <dl>
                  <div><dt>From</dt><dd>{selectedTransferBucket?.name || "Choose bucket"}</dd></div>
                  <div><dt>To</dt><dd>{selectedTransferPayee?.name || "No approved destination"}</dd></div>
                  <div><dt>Limit</dt><dd>{formatMoney(transferLimit)}</dd></div>
                </dl>
                {!transferPayees.length ? (
                  <button className="pay-secondary-button" onClick={() => selectView("bills")} type="button">
                    <SlidersHorizontal className="size-4" /> Add destination
                  </button>
                ) : null}
              </aside>
            </section>
          </div>
        ) : null}

        {view === "unlock" ? (
          <div className="pay-view">
            <button className="pay-back-button" onClick={() => selectView("card")} type="button">
              <ArrowRight className="size-4 rotate-180" /> Back to Card
            </button>
            <div className="pay-view-heading">
              <div>
                <p className="pay-eyebrow">Recovery</p>
                <h1>Use protected money with a clear way back.</h1>
              </div>
            </div>
            <div className="pay-workspace-view">
              <UnlockControlPanel buckets={workspaceBuckets} />
            </div>
          </div>
        ) : null}

        {view === "activity" ? (
          <div className="pay-view">
            <div className="pay-view-heading">
              <div>
                <p className="pay-eyebrow">Activity</p>
                <h1>A clear record of what happened to your money.</h1>
              </div>
              <button className="pay-secondary-button" onClick={exportActivity} type="button">
                {exportState.status === "loading" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                Download activity
              </button>
            </div>
            <StateMessage state={exportState} />
            <section className="pay-activity-layout">
              <div className="pay-full-activity">
                <div className="pay-activity-list">
                  {timeline.length ? timeline.map((item) => (
                    <div className="pay-activity-row" key={item.id}>
                      <span className="pay-activity-icon"><Activity className="size-4" /></span>
                      <span className="pay-activity-copy"><strong>{item.label.replace(/_/g, " ")}</strong><small>{item.detail || "Recorded by PayShield"}</small></span>
                      <span className="pay-activity-meta"><strong>{item.amountCents ? formatMoney(item.amountCents) : item.status.replace(/_/g, " ")}</strong><small>{relativeDate(item.at)}</small></span>
                    </div>
                  )) : <div className="pay-empty-state"><Activity className="size-5" /><span>No account activity yet.</span></div>}
                </div>
              </div>
              <aside className="pay-account-panel">
                <div className="pay-account-heading"><span className="pay-account-avatar large">{initials(householdName)}</span><div><strong>{householdName}</strong><small>{accessActive ? "Membership active" : priceLabel}</small></div></div>
                <button onClick={openBillingPortal} type="button"><CreditCard className="size-4" /> Billing <ChevronRight className="ml-auto size-4" /></button>
                <button onClick={() => selectView("unlock")} type="button"><CalendarClock className="size-4" /> Recovery plans <ChevronRight className="ml-auto size-4" /></button>
                <a href={`mailto:${GRAYSTON_SUPPORT_EMAIL}`}><LifeBuoy className="size-4" /> Support <ChevronRight className="ml-auto size-4" /></a>
                <StateMessage state={portalState} />
              </aside>
            </section>
          </div>
        ) : null}
      </main>

      <footer className="pay-app-footer">
        <div>
          <GraystonLogo className="h-7 w-auto" />
          <span>{PAYSHIELD_OWNERSHIP_LINE}</span>
        </div>
        <a href={`mailto:${GRAYSTON_SUPPORT_EMAIL}`}>
          <Mail className="size-4" aria-hidden="true" />
          {GRAYSTON_SUPPORT_EMAIL}
        </a>
      </footer>

      <nav aria-label="Mobile navigation" className="pay-mobile-bottom-nav">
        {primaryNavigation.map((item) => {
          const Icon = item.icon;
          return (
            <button data-active={view === item.view} key={item.view} onClick={() => selectView(item.view)} type="button">
              <Icon className="size-5" aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
