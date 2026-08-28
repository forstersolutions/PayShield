import type { NeobankReadiness, NeobankReadinessGate } from "./types.ts";
import { clerkAppConfigured } from "./app-access.ts";
import { getCoreServiceConfig } from "./core-config.ts";
import { getProviderAdapterConfig } from "./provider-adapter.ts";

export const CORE_LEDGER_SCHEMA_VERSION = "0022";

function envTrue(name: string) {
  return process.env[name]?.trim().toLowerCase() === "true";
}

function envPresent(name: string) {
  return Boolean(process.env[name]?.trim());
}

export function getNeobankReadiness(): NeobankReadiness {
  const coreService = getCoreServiceConfig();
  const providerAdapter = getProviderAdapterConfig();
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
      description: "Configured BaaS/card provider adapter can receive live API calls.",
      id: "provider_adapter",
      ok: providerAdapter.ok,
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
      description: "Supabase ledger schema and Data API isolation are verified.",
      id: "postgres_ledger",
      ok:
        envPresent("PAYSHIELD_LEDGER_DATABASE_URL") &&
        envTrue("PAYSHIELD_LEDGER_SCHEMA_VERIFIED") &&
        process.env.PAYSHIELD_LEDGER_SCHEMA_VERIFIED_VERSION?.trim() ===
          CORE_LEDGER_SCHEMA_VERSION &&
        (process.env.PAYSHIELD_CORE_RUNTIME?.trim().toLowerCase() !== "vercel" ||
          envTrue("PAYSHIELD_SUPABASE_SECURITY_VERIFIED")),
    },
    {
      description: "The Vercel money-control runtime is configured.",
      id: "dedicated_backend",
      ok: coreService.ok,
    },
    {
      description: "Money-control operations stay behind an authenticated server boundary.",
      id: "core_service_auth",
      ok:
        coreService.ok &&
        (coreService.mode === "in_process" || Boolean(coreService.serviceToken)),
    },
    {
      description: "Clerk keys are configured for authenticated app access.",
      id: "clerk_auth",
      ok: clerkAppConfigured(process.env),
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
    mode: liveMoneyReady ? "live" : providerConfigured ? "sandbox" : "setup",
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
        "Live money is blocked until provider adapter, ledger, auth, counsel, disclosure, and operations gates are complete.",
      missing,
      readiness,
    };
  }

  return {
    ok: true as const,
    readiness,
  };
}
