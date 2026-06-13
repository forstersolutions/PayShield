import { GRAYSTON_SUPPORT_EMAIL } from "../brand.ts";
import { getCommercialReadiness } from "../commercial/billing.ts";
import type { AppSession } from "./auth.ts";
import { createNeobankSnapshot } from "./demo-state.ts";
import { getMoneyRailReadiness } from "./money-rails.ts";

export function createHouseholdOperationsPacket(session?: AppSession) {
  const snapshot = createNeobankSnapshot();
  const commercial = getCommercialReadiness();
  const moneyRails = getMoneyRailReadiness();
  const safeToSpendCents =
    snapshot.buckets.find((bucket) => bucket.id === "safe_spending")
      ?.availableCents ?? 0;
  const protectedCents = snapshot.buckets
    .filter((bucket) => bucket.id !== "safe_spending")
    .reduce((sum, bucket) => sum + bucket.availableCents, 0);
  const operations = {
    bankConnections: [],
    billingEvents: [],
    billPayments: [],
    cardDecisions: [],
    checkoutIntents: [],
    directDepositSetups: [],
    journalEntries: snapshot.ledgerEntries,
    moneyRailEvents: [],
    paycheckDetectionRules: [],
    paycheckDetections: [],
    transferIntents: [],
    unlockRequests: [],
  };
  const timeline = snapshot.ledgerEntries
    .slice(-6)
    .reverse()
    .map((entry) => ({
      amountCents:
        typeof entry.metadata?.amountCents === "number"
          ? entry.metadata.amountCents
          : null,
      at: entry.createdAt,
      detail: entry.memo,
      id: entry.id,
      label: entry.type.replace(/_/g, " "),
      rail: "ledger",
      status: "posted",
    }));

  return {
    balances: {
      protectedCents,
      safeToSpendCents,
      totalCents: safeToSpendCents + protectedCents,
    },
    buckets: snapshot.buckets,
    card: snapshot.card,
    controls: {
      bucketPersistence: {
        persisted: false,
        persistence: "memory",
        persistenceReason:
          "Bucket rules are running from the Vercel control model until the dedicated core is configured.",
      },
      payeePersistence: {
        persisted: false,
        persistence: "memory",
        persistenceReason:
          "Payees are running from the Vercel control model until the dedicated core is configured.",
      },
      payees: snapshot.payees,
    },
    directDeposit: snapshot.directDeposit,
    generatedAt: new Date().toISOString(),
    household: {
      householdId: snapshot.householdId,
      kycStatus: snapshot.user.kycStatus,
      profileAccess: snapshot.user.profileAccess,
      userId: session?.userId ?? snapshot.user.id,
    },
    commercialAccess: {
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      mode: commercial.mode,
      priceLabel: commercial.priceLabel,
      providerCustomerId: null,
      providerName: "stripe",
      providerSubscriptionId: null,
      readyForCheckout: commercial.checkoutConfigured,
      state: commercial.checkoutConfigured ? "ready" : "needs_setup",
      subscriptionStatus: null,
    },
    moneyRails,
    operations,
    operationalAudit: {
      audit: null,
      auditFound: false,
      persisted: false,
      persistence: "memory",
      persistenceReason:
        "Dedicated core storage is not configured for this request.",
    },
    readiness: snapshot.readiness,
    service: "payshield-household-operations",
    statusCards: [
      {
        key: "paid_access",
        label: "Paid access",
        state: commercial.checkoutConfigured ? "ready" : "needs_setup",
      },
      {
        key: "bank_connection",
        label: "Bank connection",
        state: moneyRails.bankLinkReady ? "ready" : "needs_setup",
      },
      {
        key: "paycheck_detection",
        label: "Paycheck detection",
        state: moneyRails.paycheckDetectionReady ? "ready" : "needs_setup",
      },
      {
        key: "protected_transfer",
        label: "Protected transfer",
        state: moneyRails.transferReady ? "ready" : "needs_setup",
      },
    ],
    support: {
      contact: GRAYSTON_SUPPORT_EMAIL,
      operator: "Grayston Technologies",
    },
    timeline,
  };
}

export function createHouseholdAuditPacket(session?: AppSession) {
  const packet = createHouseholdOperationsPacket(session);

  return {
    balances: packet.balances,
    buckets: packet.buckets,
    card: packet.card,
    controls: packet.controls,
    directDeposit: packet.directDeposit,
    exportVersion: "payshield-household-audit-v1",
    generatedAt: packet.generatedAt,
    household: packet.household,
    commercialAccess: packet.commercialAccess,
    ledger: {
      entries: packet.operations.journalEntries,
      source: "core_control_model",
    },
    moneyRails: packet.moneyRails,
    operations: packet.operations,
    readiness: packet.readiness,
    service: "payshield-audit-export",
    statusCards: packet.statusCards,
    support: packet.support,
    timeline: packet.timeline,
  };
}
