import { pathToFileURL } from "node:url";
import { runVercelCli } from "./vercel-cli.mjs";

const commonProductionEnv = [
  "NEXT_PUBLIC_SITE_URL",
  "PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK",
];
const blobProductionEnv = [
  "PAYSHIELD_WAITLIST_STORAGE",
  "BLOB_READ_WRITE_TOKEN",
];
const webhookProductionEnv = [
  "PAYSHIELD_WAITLIST_WEBHOOK_URL",
  "PAYSHIELD_WAITLIST_WEBHOOK_SECRET",
];
const upstashProductionEnv = [
  "PAYSHIELD_WAITLIST_STORAGE",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
];
const commercialProductionGroups = [
  {
    endpoint: "POST /api/app/billing/checkout",
    key: "revenue",
    required: [
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "PAYSHIELD_CORE_API_URL",
      "PAYSHIELD_CORE_SERVICE_TOKEN",
    ],
    alternatives: [
      {
        anyOf: [
          "PAYSHIELD_COMMERCIAL_PRICE_ID",
          "PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL",
        ],
        label:
          "PAYSHIELD_COMMERCIAL_PRICE_ID or PAYSHIELD_COMMERCIAL_PAYMENT_LINK_URL",
      },
    ],
    title: "Revenue switch",
    unlocks:
      "Paid household access, billing webhook activation, and private money workflows.",
  },
  {
    endpoint: "GET /api/app/me",
    key: "household_access",
    required: ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"],
    title: "Household access",
    unlocks: "Authenticated app entry and household-scoped support records.",
  },
  {
    endpoint: "POST /api/app/bank-link/token",
    key: "bank_connection",
    required: [
      "PLAID_ENV",
      "PLAID_CLIENT_ID",
      "PLAID_SECRET",
      "PAYSHIELD_TOKEN_VAULT_KEY_ID",
      "PAYSHIELD_TOKEN_VAULT_WEBHOOK_URL",
      "PAYSHIELD_TOKEN_VAULT_WEBHOOK_SECRET",
    ],
    title: "Bank connection",
    unlocks: "Plaid Link, public-token exchange, and token custody.",
  },
  {
    endpoint: "POST /api/app/paychecks/detect",
    key: "paycheck_detection",
    required: [
      "PAYSHIELD_PROVIDER_WEBHOOK_SECRET",
      "PAYSHIELD_LEDGER_DATABASE_URL",
      "PAYSHIELD_LEDGER_SCHEMA_VERIFIED",
      "PAYSHIELD_LEDGER_SCHEMA_VERIFIED_VERSION",
      "PAYSHIELD_CORE_REQUIRE_DURABLE_STORAGE",
    ],
    title: "Detection and ledger",
    unlocks:
      "Signed provider events, automatic payroll detection, and durable journal evidence.",
  },
  {
    endpoint: "POST /api/app/transfers",
    key: "money_movement",
    required: [
      "PAYSHIELD_TRANSFER_ENABLED",
      "PAYSHIELD_BAAS_PROVIDER",
      "PAYSHIELD_BAAS_ADAPTER",
      "PAYSHIELD_BAAS_API_BASE_URL",
      "PAYSHIELD_BAAS_API_KEY",
    ],
    title: "Movement rail",
    unlocks:
      "Protected transfer execution after bucket, payee, balance, and provider checks pass.",
  },
  {
    endpoint: "POST /api/card/authorize",
    key: "live_control",
    required: [
      "PAYSHIELD_BAAS_CONTRACT_APPROVED",
      "PAYSHIELD_BAAS_ADAPTER",
      "PAYSHIELD_BAAS_API_BASE_URL",
      "PAYSHIELD_SPONSOR_DISCLOSURES_APPROVED",
      "PAYSHIELD_REGULATED_COUNSEL_SIGNOFF",
      "PAYSHIELD_OPERATIONS_RUNBOOKS_APPROVED",
      "PAYSHIELD_LIVE_MONEY_ENABLED",
      "PAYSHIELD_CORE_REQUIRE_DURABLE_STORAGE",
    ],
    title: "Live control gate",
    unlocks:
      "Card authorization gateway and live money movement after recorded approvals.",
  },
];

function usage() {
  return [
    "Usage: npm run vercel:env:audit -- [--stdin] [--allow-demo-capture] [--environment Production] [--profile capture|commercial|all]",
    "",
    "Checks whether required Vercel environment variables exist without printing values.",
    "--stdin reads `vercel env ls` output from stdin instead of running the pinned Vercel CLI.",
    "--allow-demo-capture exits 0 while reporting missing paid-traffic capture variables.",
    "--profile commercial checks revenue, auth, bank-link, detection, transfer, ledger, and live-provider gates.",
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

  const environment = flagValue(args, "--environment") || "Production";
  const profile = flagValue(args, "--profile") || "capture";

  if (!/^[A-Za-z][A-Za-z ]{0,40}$/.test(environment)) {
    throw new Error("--environment must be a Vercel environment name.");
  }

  if (!["all", "capture", "commercial"].includes(profile)) {
    throw new Error("--profile must be capture, commercial, or all.");
  }

  const unknown = args.find(
    (arg) =>
      arg.startsWith("--") &&
      ![
        "--allow-demo-capture",
        "--environment",
        "--help",
        "--profile",
        "--stdin",
        "-h",
      ].includes(arg) &&
      !arg.startsWith("--environment=") &&
      !arg.startsWith("--profile=")
  );

  if (unknown) {
    throw new Error(`Unknown option: ${unknown}`);
  }

  return {
    allowDemoCapture: args.includes("--allow-demo-capture"),
    environment,
    help: false,
    profile,
    stdin: args.includes("--stdin"),
  };
}

async function readStdin() {
  const chunks = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function readVercelEnvList() {
  const { stdout } = await runVercelCli(["env", "ls"]);

  return stdout;
}

export function parseVercelEnvList(text) {
  const variables = new Map();

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    const name = line.match(/^([A-Z][A-Z0-9_]+)\s+/)?.[1];

    if (!name || !line.includes("Encrypted")) {
      continue;
    }

    variables.set(name, {
      environments: {
        Development: line.includes("Development"),
        Preview: line.includes("Preview"),
        Production: line.includes("Production"),
      },
    });
  }

  return variables;
}

function auditRequiredVariables(variables, required, environment) {
  const configured = [];
  const missing = [];
  const wrongEnvironment = [];

  for (const name of required) {
    const variable = variables.get(name);

    if (!variable) {
      missing.push(name);
      continue;
    }

    if (!variable.environments[environment]) {
      wrongEnvironment.push(name);
      continue;
    }

    configured.push(name);
  }

  return {
    configured,
    environment,
    missing,
    ok: missing.length === 0 && wrongEnvironment.length === 0,
    required,
    wrongEnvironment,
  };
}

function mergeUnique(values) {
  return [...new Set(values)];
}

function vercelEnvAddCommand(name) {
  return `npx vercel env add ${name} production`;
}

function auditAlternative(variables, alternative, environment) {
  const configured = [];
  const wrongEnvironment = [];

  for (const name of alternative.anyOf) {
    const variable = variables.get(name);

    if (!variable) {
      continue;
    }

    if (!variable.environments[environment]) {
      wrongEnvironment.push(name);
      continue;
    }

    configured.push(name);
  }

  return {
    anyOf: alternative.anyOf,
    configured,
    label: alternative.label,
    missing: configured.length === 0 && wrongEnvironment.length === 0
      ? [alternative.label]
      : [],
    ok: configured.length > 0,
    wrongEnvironment,
  };
}

function auditVariableGroups(variables, groups, environment) {
  const auditedGroups = groups.map((group) => {
    const required = auditRequiredVariables(
      variables,
      group.required,
      environment,
    );
    const alternatives = (group.alternatives ?? []).map((alternative) =>
      auditAlternative(variables, alternative, environment),
    );
    const configured = mergeUnique([
      ...required.configured,
      ...alternatives.flatMap((alternative) => alternative.configured),
    ]);
    const missing = mergeUnique([
      ...required.missing,
      ...alternatives.flatMap((alternative) => alternative.missing),
    ]);
    const wrongEnvironment = mergeUnique([
      ...required.wrongEnvironment,
      ...alternatives.flatMap((alternative) => alternative.wrongEnvironment),
    ]);
    const env = mergeUnique([
      ...group.required,
      ...alternatives.flatMap((alternative) => alternative.anyOf),
    ]);

    return {
      endpoint: group.endpoint,
      key: group.key,
      configured,
      environment,
      missing,
      ok: missing.length === 0 && wrongEnvironment.length === 0,
      required: group.required,
      alternatives,
      setupCommands: env.map(vercelEnvAddCommand),
      title: group.title,
      unlocks: group.unlocks,
      wrongEnvironment,
    };
  });

  return {
    configured: mergeUnique(
      auditedGroups.flatMap((group) => group.configured),
    ),
    environment,
    groups: auditedGroups,
    missing: mergeUnique(auditedGroups.flatMap((group) => group.missing)),
    ok: auditedGroups.every((group) => group.ok),
    presenceOnly: true,
    profile: "commercial",
    required: mergeUnique(
      auditedGroups.flatMap((group) => [
        ...group.required,
        ...group.alternatives.flatMap((alternative) => alternative.anyOf),
      ]),
    ),
    setupCommands: mergeUnique(
      auditedGroups.flatMap((group) => group.setupCommands),
    ),
    wrongEnvironment: mergeUnique(
      auditedGroups.flatMap((group) => group.wrongEnvironment),
    ),
  };
}

function auditCaptureProfile(variables, environment) {
  const webhook = auditRequiredVariables(
    variables,
    [...commonProductionEnv, ...webhookProductionEnv],
    environment,
  );
  const blob = auditRequiredVariables(
    variables,
    [...commonProductionEnv, ...blobProductionEnv],
    environment,
  );
  const upstash = auditRequiredVariables(
    variables,
    [...commonProductionEnv, ...upstashProductionEnv],
    environment,
  );
  const ok = webhook.ok || blob.ok || upstash.ok;
  const selected = webhook.ok ? webhook : blob.ok ? blob : upstash.ok ? upstash : webhook;

  return {
    capturePath: webhook.ok ? "webhook" : blob.ok ? "blob" : upstash.ok ? "upstash" : "",
    capturePaths: {
      blob: {
        missing: blob.missing,
        ok: blob.ok,
        required: blob.required,
        wrongEnvironment: blob.wrongEnvironment,
      },
      upstash: {
        missing: upstash.missing,
        ok: upstash.ok,
        required: upstash.required,
        wrongEnvironment: upstash.wrongEnvironment,
      },
      webhook: {
        missing: webhook.missing,
        ok: webhook.ok,
        required: webhook.required,
        wrongEnvironment: webhook.wrongEnvironment,
      },
    },
    configured: mergeUnique(selected.configured),
    environment,
    missing: selected.missing,
    ok,
    profile: "capture",
    required: selected.required,
    wrongEnvironment: selected.wrongEnvironment,
  };
}

export function auditVercelEnvList({
  environment = "Production",
  profile = "capture",
  required = undefined,
  text,
}) {
  const variables = parseVercelEnvList(text);

  if (required) {
    return auditRequiredVariables(variables, required, environment);
  }

  if (profile === "commercial") {
    return auditVariableGroups(variables, commercialProductionGroups, environment);
  }

  const capture = auditCaptureProfile(variables, environment);

  if (profile === "all") {
    const commercial = auditVariableGroups(
      variables,
      commercialProductionGroups,
      environment,
    );

    return {
      capture,
      capturePath: capture.capturePath,
      commercial,
      configured: mergeUnique([
        ...capture.configured,
        ...commercial.configured,
      ]),
      environment,
      missing: mergeUnique([...capture.missing, ...commercial.missing]),
      ok: capture.ok && commercial.ok,
      profile: "all",
      required: mergeUnique([...capture.required, ...commercial.required]),
      setupCommands: commercial.setupCommands,
      wrongEnvironment: mergeUnique([
        ...capture.wrongEnvironment,
        ...commercial.wrongEnvironment,
      ]),
    };
  }

  return capture;
}

async function main() {
  const parsed = parseCliArgs(process.argv.slice(2));

  if (parsed.help) {
    console.log(usage());
    return;
  }

  const text = parsed.stdin ? await readStdin() : await readVercelEnvList();
  const result = auditVercelEnvList({
    environment: parsed.environment,
    profile: parsed.profile,
    text,
  });

  console.log(JSON.stringify(result, null, 2));

  if (
    !result.ok &&
    !(parsed.allowDemoCapture && parsed.profile === "capture")
  ) {
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Vercel env audit failed.");
    process.exit(1);
  });
}
