import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { parseDockerPortOutput } from "./smoke-docker-receiver.mjs";

const execFileAsync = promisify(execFile);
const defaultImage = "payshield-core:ci-smoke";
const defaultTimeoutMs = 30_000;
const corePort = "8080/tcp";

function usage() {
  return [
    "Usage: npm run core:docker:smoke [--image payshield-core:ci-smoke] [--skip-build] [--keep-image] [--timeout-ms 30000]",
    "",
    "Builds and runs Dockerfile.core, checks core health, verifies optional service-token protection,",
    "and exercises balances, bill payments, card authorization, and onboarding gates without printing the service token.",
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

  const unknown = args.find(
    (arg) =>
      arg.startsWith("--") &&
      ![
        "--help",
        "--image",
        "--keep-image",
        "--skip-build",
        "--timeout-ms",
        "-h",
      ].includes(arg) &&
      !arg.startsWith("--image=") &&
      !arg.startsWith("--timeout-ms="),
  );

  if (unknown) {
    throw new Error(`Unknown option: ${unknown}`);
  }

  const timeoutMs = Number(flagValue(args, "--timeout-ms") || defaultTimeoutMs);

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 120_000) {
    throw new Error("--timeout-ms must be a number between 1 and 120000.");
  }

  return {
    help: false,
    image: flagValue(args, "--image") || defaultImage,
    keepImage: args.includes("--keep-image"),
    skipBuild: args.includes("--skip-build"),
    timeoutMs,
  };
}

async function docker(args, options = {}) {
  return execFileAsync("docker", args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    ...options,
  });
}

async function readJson(url, options = {}) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(options.timeoutMs ?? 5_000),
    ...options,
  });
  const body = await response.json();

  return { body, response };
}

async function waitForCoreHealth({ healthUrl, timeoutMs }) {
  const started = Date.now();
  let lastError = "";

  while (Date.now() - started < timeoutMs) {
    try {
      const { body, response } = await readJson(healthUrl, { timeoutMs: 1_500 });

      if (
        response.status === 200 &&
        body?.ok === true &&
        body?.service === "payshield-core"
      ) {
        return body;
      }

      lastError = `Unexpected health response: ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Health check failed";
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Core service health check did not pass: ${lastError}`);
}

function requireCheck(checks, condition, message) {
  if (!condition) {
    throw new Error(`Docker core smoke failed: ${message}`);
  }

  checks.push(message);
}

function durablePersistenceStatus(body = {}) {
  return (
    body.identityPersistence?.persistence ??
    body.bucketPersistence?.persistence ??
    body.payeePersistence?.persistence ??
    body.operationalAudit?.persistence ??
    body.decisionPersistence?.persistence ??
    null
  );
}

function durablePostgresRequired(result) {
  return (
    result.response.status === 503 &&
    durablePersistenceStatus(result.body) === "postgres_required"
  );
}

function onboardingFailClosed(result) {
  return (
    durablePostgresRequired(result) ||
    (result.response.status === 423 && result.body?.liveMoney?.ok === false)
  );
}

export function summarizeDockerCoreSmoke({
  authorizedBalances,
  billPayment,
  cardAuthorization,
  checks,
  health,
  image,
  onboarding,
  unauthorizedBalances,
}) {
  return {
    authorization: {
      protectedRouteStatusWithoutToken: unauthorizedBalances.response.status,
      protectedRouteStatusWithToken: authorizedBalances.response.status,
      serviceTokenConfigured: true,
    },
    cardAuthorization: {
      approved: cardAuthorization.body.decision?.approved === true,
      bucketId: cardAuthorization.body.decision?.bucketId ?? null,
      persistence: durablePersistenceStatus(cardAuthorization.body),
      mode: cardAuthorization.body.mode,
      status: cardAuthorization.response.status,
    },
    billPayment: {
      accepted: billPayment.body.decision?.accepted === true,
      bucketId: billPayment.body.decision?.bucketId ?? null,
      persistence: durablePersistenceStatus(billPayment.body),
      providerStatus: billPayment.body.decision?.providerStatus ?? null,
      status: billPayment.response.status,
    },
    checks,
    health,
    image,
    ok: true,
    onboarding: {
      liveMoneyOk: onboarding.body.liveMoney?.ok === true,
      status: onboarding.response.status,
    },
    durableStorage: {
      required: durablePersistenceStatus(authorizedBalances.body) === "postgres_required",
      status: authorizedBalances.response.status,
    },
    safeToSpendCents: authorizedBalances.body.safeToSpendCents ?? null,
  };
}

export async function runDockerCoreSmoke({
  image = defaultImage,
  keepImage = false,
  skipBuild = false,
  timeoutMs = defaultTimeoutMs,
} = {}) {
  const containerName = `payshield-core-smoke-${process.pid}-${Date.now()}`;
  const token = `core-smoke-${randomBytes(24).toString("hex")}`;
  const checks = [];
  let containerStarted = false;

  try {
    if (!skipBuild) {
      await docker(["build", "-f", "Dockerfile.core", "-t", image, "."]);
      requireCheck(checks, true, "Dockerfile.core builds successfully");
    }

    await docker([
      "run",
      "-d",
      "--name",
      containerName,
      "-p",
      "127.0.0.1::8080",
      "-e",
      `PAYSHIELD_CORE_SERVICE_TOKEN=${token}`,
      "-e",
      "PAYSHIELD_LIVE_MONEY_ENABLED=false",
      "-e",
      "PAYSHIELD_CORE_REQUIRE_DURABLE_STORAGE=true",
      image,
    ]);
    containerStarted = true;
    requireCheck(checks, true, "core container starts with token protection enabled");

    const portOutput = await docker(["port", containerName, corePort]);
    const mapped = parseDockerPortOutput(portOutput.stdout);
    const health = await waitForCoreHealth({
      healthUrl: `${mapped.url}/health`,
      timeoutMs,
    });

    requireCheck(
      checks,
      health?.service === "payshield-core" &&
        health?.readiness?.liveMoneyReady === false,
      "core health reports payshield-core and fail-closed live money",
    );

    const unauthorizedBalances = await readJson(`${mapped.url}/api/app/balances`, {
      timeoutMs,
    });

    requireCheck(
      checks,
      unauthorizedBalances.response.status === 401,
      "protected core routes reject requests without the service token",
    );

    const authorizedHeaders = {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    };
    const authorizedBalances = await readJson(`${mapped.url}/api/app/balances`, {
      headers: authorizedHeaders,
      timeoutMs,
    });

    requireCheck(
      checks,
      durablePostgresRequired(authorizedBalances),
      "production core refuses balance reads without durable Postgres storage",
    );

    const cardAuthorization = await readJson(`${mapped.url}/api/card/authorize`, {
      body: JSON.stringify({
        amountCents: 8_000,
        idempotencyKey: "docker-core-card-8000",
        merchantName: "Grocery market",
      }),
      headers: authorizedHeaders,
      method: "POST",
      timeoutMs,
    });

    requireCheck(
      checks,
      durablePostgresRequired(cardAuthorization),
      "production core refuses card decisions without durable Postgres storage",
    );

    const billPayment = await readJson(`${mapped.url}/api/app/bill-payments`, {
      body: JSON.stringify({
        amountCents: 50_000,
        idempotencyKey: "docker-core-bill-rent",
        payeeId: "payee_abc_apartments",
        scheduledFor: "2026-07-01",
      }),
      headers: authorizedHeaders,
      method: "POST",
      timeoutMs,
    });

    requireCheck(
      checks,
      durablePostgresRequired(billPayment),
      "production core refuses bill-payment writes without durable Postgres storage",
    );

    const onboarding = await readJson(`${mapped.url}/api/app/onboarding/start`, {
      body: "{}",
      headers: authorizedHeaders,
      method: "POST",
      timeoutMs,
    });

    requireCheck(
      checks,
      onboardingFailClosed(onboarding),
      "onboarding remains fail-closed without provider and compliance gates",
    );

    return summarizeDockerCoreSmoke({
      authorizedBalances,
      billPayment,
      cardAuthorization,
      checks,
      health,
      image,
      onboarding,
      unauthorizedBalances,
    });
  } finally {
    if (containerStarted) {
      await docker(["rm", "-f", containerName]).catch(() => undefined);
    }

    if (!keepImage && !skipBuild) {
      await docker(["image", "rm", image]).catch(() => undefined);
    }
  }
}

async function main() {
  const parsed = parseCliArgs(process.argv.slice(2));

  if (parsed.help) {
    console.log(usage());
    return;
  }

  const result = await runDockerCoreSmoke(parsed);

  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Docker core smoke failed.");
    process.exit(1);
  });
}
