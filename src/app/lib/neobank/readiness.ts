import type { NeobankReadiness, NeobankReadinessGate } from "./types.ts";
import { getCoreServiceConfig } from "./core-config.ts";

export const CORE_LEDGER_SCHEMA_VERSION = "0010";

function envTrue(name: string) {
  return process.env[name]?.trim().toLowerCase() === "true";
}

function envPresent(name: string) {
  return Boolean(process.env[name]?.trim());
}

export function getNeobankReadiness(): NeobankReadiness {
  const coreService = getCoreServiceConfig();
  const gates: NeobankReadinessGate[] = [
    {
      description: "Signed BaaS/card partner contract is recorded.",
      id: "provider_contract",
      ok: envTrue("PAYSHIELD_BAAS_CONTRACT_APPROVED"),
    },
    {
      description: "Provider sandbox/live API credentials are configured.",
      id: "provider_credentials",
      ok:
        envPresent("PAYSHIELD_BAAS_PROVIDER") &&
        envPresent("PAYSHIELD_BAAS_API_KEY"),
    },
    {
      description: "Sponsor-bank and pass-through wording is counsel-approved.",
      id: "sponsor_disclosures",
      ok: envTrue("PAYSHIELD_SPONSOR_DISCLOSURES_APPROVED"),
    },
    {
      description: "Counsel has approved regulated product, fee, and UX copy.",
      id: "counsel_signoff",
      ok: envTrue("PAYSHIELD_REGULATED_COUNSEL_SIGNOFF"),
    },
    {
      description: "Reg E, dispute, reconciliation, and support runbooks exist.",
      id: "operations_runbooks",
      ok: envTrue("PAYSHIELD_OPERATIONS_RUNBOOKS_APPROVED"),
    },
    {
      description: "Durable Postgres ledger schema is configured and verified.",
      id: "postgres_ledger",
      ok:
        envPresent("PAYSHIELD_LEDGER_DATABASE_URL") &&
        envTrue("PAYSHIELD_LEDGER_SCHEMA_VERIFIED") &&
        process.env.PAYSHIELD_LEDGER_SCHEMA_VERIFIED_VERSION?.trim() ===
          CORE_LEDGER_SCHEMA_VERSION,
    },
    {
      description: "Always-on regulated core backend is configured.",
      id: "dedicated_backend",
      ok: coreService.ok,
    },
    {
      description: "Clerk keys are configured for authenticated app access.",
      id: "clerk_auth",
      ok:
        envPresent("CLERK_SECRET_KEY") &&
        envPresent("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"),
    },
  ];
  const liveMoneyReady =
    envTrue("PAYSHIELD_LIVE_MONEY_ENABLED") && gates.every((gate) => gate.ok);
  const providerConfigured = gates.some(
    (gate) => gate.id === "provider_credentials" && gate.ok,
  );

  return {
    backendConfigured: gates.some(
      (gate) => gate.id === "dedicated_backend" && gate.ok,
    ),
    clerkConfigured: gates.some((gate) => gate.id === "clerk_auth" && gate.ok),
    gates,
    liveMoneyReady,
    mode: liveMoneyReady ? "live" : providerConfigured ? "sandbox" : "architecture",
    postgresConfigured: envPresent("PAYSHIELD_LEDGER_DATABASE_URL"),
    postgresSchemaVerified: gates.some(
      (gate) => gate.id === "postgres_ledger" && gate.ok,
    ),
    postgresSchemaVersion: CORE_LEDGER_SCHEMA_VERSION,
    providerConfigured,
  };
}

export function assertLiveMoneyReady(readiness = getNeobankReadiness()) {
  if (!readiness.liveMoneyReady) {
    const missing = readiness.gates
      .filter((gate) => !gate.ok)
      .map((gate) => gate.id);

    return {
      ok: false as const,
      reason:
        "Live money is blocked until provider, ledger, auth, counsel, disclosure, and operations gates are complete.",
      missing,
      readiness,
    };
  }

  return {
    ok: true as const,
    readiness,
  };
}
