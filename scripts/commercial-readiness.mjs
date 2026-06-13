import { pathToFileURL } from "node:url";
import { normalizeSiteUrl } from "./paid-traffic-readiness.mjs";

const defaultTimeoutMs = 10_000;
const requiredService = "payshield-web-app";
const requiredLedgerSchemaVersion = "0008";

function usage() {
  return [
    "Usage: npm run readiness:commercial -- https://your-domain.com [--expect-site-url https://your-domain.com] [--timeout-ms 10000]",
    "",
    "Fails unless the deployed app reports production-ready commercial access, bank-link rails, transfer readiness, core backend, auth, provider, and ledger gates.",
    "This command reads public health/readiness state only; it does not print or require secrets.",
  ].join("\n");
}

function flagValue(args, name) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));

  if (inline) {
    return inline.slice(name.length + 1);
  }

  const index = args.indexOf(name);
  const next = args[index + 1];

  if (index === -1 || !next || next.startsWith("--")) {
    return "";
  }

  return next;
}

function parseCliArgs(args) {
  if (args.includes("--help") || args.includes("-h")) {
    return { help: true };
  }

  const targetUrl = args.find((arg) => !arg.startsWith("--"));
  const timeoutMs = Number(flagValue(args, "--timeout-ms") || defaultTimeoutMs);
  const unknown = args.find(
    (arg) =>
      arg.startsWith("--") &&
      !["--expect-site-url", "--help", "--timeout-ms", "-h"].includes(arg) &&
      !arg.startsWith("--expect-site-url=") &&
      !arg.startsWith("--timeout-ms="),
  );

  if (unknown) {
    throw new Error(`Unknown option: ${unknown}`);
  }

  if (!targetUrl) {
    throw new Error("A production URL is required.");
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000) {
    throw new Error("--timeout-ms must be a number between 1 and 60000.");
  }

  return {
    expectedSiteUrl: flagValue(args, "--expect-site-url"),
    help: false,
    targetUrl,
    timeoutMs,
  };
}

function urlFor(baseUrl, path) {
  return new URL(path, `${baseUrl}/`).toString();
}

function record(result, passed, message, gate) {
  if (passed) {
    result.checks.push(message);
    return;
  }

  result.failures.push(message);

  if (gate) {
    result.remainingGates.add(gate);
  }
}

function addReportedGates(result, gates) {
  if (!Array.isArray(gates)) {
    return;
  }

  for (const gate of gates) {
    if (typeof gate === "string" && gate.trim()) {
      result.providerReportedGates.add(gate.trim());
    }
  }
}

function statusText(ok, readyLabel, blockedLabel) {
  return ok ? readyLabel : blockedLabel;
}

/**
 * @param {{
 *   expectedSiteUrl?: string;
 *   health?: Record<string, any>;
 * }} evidence
 */
export function evaluateCommercialReadiness({
  expectedSiteUrl = "",
  health,
} = {}) {
  const result = {
    checks: [],
    failures: [],
    providerReportedGates: new Set(),
    remainingGates: new Set(),
    warnings: [],
  };
  const commercial = health?.commercial ?? {};
  const moneyRails = health?.moneyRails ?? {};
  const neobank = health?.neobank ?? {};
  const waitlist = health?.waitlist ?? {};

  addReportedGates(result, commercial.remainingGates);
  addReportedGates(result, moneyRails.remainingGates);
  addReportedGates(result, neobank.remainingGates);

  record(
    result,
    health?.service === requiredService,
    `/api/health reports service=${requiredService}`,
    "health_service",
  );
  record(result, health?.ok === true, "/api/health reports ok=true", "health_ok");

  if (expectedSiteUrl) {
    record(
      result,
      health?.siteUrl === expectedSiteUrl,
      `/api/health siteUrl matches ${expectedSiteUrl}`,
      "site_url",
    );
  }

  record(
    result,
    waitlist.paidTrafficReady === true,
    "durable public lead capture is paid-traffic ready",
    "paid_traffic_capture",
  );
  record(
    result,
    commercial.checkoutConfigured === true,
    "Stripe checkout or payment-link access is configured",
    "stripe_checkout",
  );
  record(
    result,
    commercial.paidAccessReady === true &&
      commercial.webhookSigningSecretConfigured === true,
    "paid access has verified webhook signing configured",
    "stripe_webhook",
  );
  record(
    result,
    typeof commercial.priceLabel === "string" &&
      commercial.priceLabel.trim().length > 0,
    "commercial price label is exposed for the app",
    "commercial_price_label",
  );
  record(
    result,
    moneyRails.tokenVaultStoreReady === true,
    "signed token-vault handoff is ready for bank access tokens",
    "token_vault_handoff",
  );
  record(
    result,
    moneyRails.bankLinkReady === true,
    "bank linking is ready with Plaid credentials and token vault",
    "bank_link",
  );
  record(
    result,
    moneyRails.paycheckDetectionReady === true,
    "paycheck detection is ready for linked-bank/provider events",
    "paycheck_detection",
  );
  record(
    result,
    moneyRails.transferConfigured === true,
    "transfer/BaaS credentials are configured",
    "transfer_credentials",
  );
  record(
    result,
    moneyRails.transferReady === true,
    "protected transfer execution gate is ready",
    "transfer_ready",
  );
  record(
    result,
    neobank.backendConfigured === true,
    "dedicated always-on core backend is configured",
    "core_backend",
  );
  record(
    result,
    neobank.clerkConfigured === true,
    "Clerk app authentication is configured",
    "clerk_auth",
  );
  record(
    result,
    neobank.postgresSchemaVerified === true &&
      neobank.postgresSchemaVersion === requiredLedgerSchemaVersion,
    `Postgres ledger schema ${requiredLedgerSchemaVersion} is verified`,
    "postgres_ledger",
  );
  record(
    result,
    neobank.providerConfigured === true,
    "BaaS/provider adapter credentials are configured",
    "provider_credentials",
  );
  record(
    result,
    neobank.liveMoneyReady === true,
    "live-money gate is ready",
    "live_money",
  );

  const ok = result.failures.length === 0;

  return {
    checks: result.checks,
    commercial: {
      mode: commercial.mode ?? "unknown",
      paidAccess: statusText(
        commercial.paidAccessReady === true,
        "ready",
        "blocked",
      ),
      priceLabel: commercial.priceLabel ?? "",
    },
    failures: result.failures,
    moneyRails: {
      bankLink: statusText(moneyRails.bankLinkReady === true, "ready", "blocked"),
      detectionMode: moneyRails.detectionMode ?? "unknown",
      tokenVault: statusText(
        moneyRails.tokenVaultStoreReady === true,
        "ready",
        "blocked",
      ),
      transfer: statusText(moneyRails.transferReady === true, "ready", "blocked"),
    },
    neobank: {
      backend: statusText(neobank.backendConfigured === true, "ready", "blocked"),
      liveMoney: statusText(neobank.liveMoneyReady === true, "ready", "blocked"),
      mode: neobank.mode ?? "unknown",
      postgresSchemaVersion: neobank.postgresSchemaVersion ?? "",
      provider: statusText(
        neobank.providerConfigured === true,
        "ready",
        "blocked",
      ),
    },
    ok,
    providerReportedGates: [...result.providerReportedGates],
    remainingGates: [...result.remainingGates],
    warnings: result.warnings,
  };
}

async function fetchJson(baseUrl, path, timeoutMs) {
  const response = await fetch(urlFor(baseUrl, path), {
    headers: {
      accept: "application/json",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.text();

  try {
    return {
      body: JSON.parse(body),
      status: response.status,
    };
  } catch {
    throw new Error(`${path} did not return JSON.`);
  }
}

export async function collectCommercialReadinessEvidence({
  targetUrl,
  timeoutMs = defaultTimeoutMs,
}) {
  const baseUrl = normalizeSiteUrl(targetUrl);
  const health = await fetchJson(baseUrl, "/api/health", timeoutMs);

  return {
    baseUrl,
    health: health.body,
    healthStatus: health.status,
  };
}

function printResult({ baseUrl, result }) {
  console.log(`Commercial readiness audit for ${baseUrl}`);
  result.checks.forEach((check) => console.log(`PASS ${check}`));
  result.warnings.forEach((warning) => console.warn(`WARN ${warning}`));
  result.failures.forEach((failure) => console.error(`FAIL ${failure}`));
  console.log(
    JSON.stringify(
      {
        commercial: result.commercial,
        failures: result.failures,
        moneyRails: result.moneyRails,
        neobank: result.neobank,
        ok: result.ok,
        providerReportedGates: result.providerReportedGates,
        remainingGates: result.remainingGates,
        warnings: result.warnings,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));

  if (args.help) {
    console.log(usage());
    return;
  }

  const evidence = await collectCommercialReadinessEvidence(args);
  const expectedSiteUrl = args.expectedSiteUrl
    ? normalizeSiteUrl(args.expectedSiteUrl)
    : "";
  const result = evaluateCommercialReadiness({
    expectedSiteUrl,
    health: evidence.health,
  });

  printResult({ baseUrl: evidence.baseUrl, result });

  if (!result.ok) {
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Commercial readiness audit failed.",
    );
    process.exit(1);
  });
}
