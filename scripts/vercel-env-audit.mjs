import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const requiredProductionEnv = [
  "NEXT_PUBLIC_SITE_URL",
  "PAYSHIELD_WAITLIST_WEBHOOK_URL",
  "PAYSHIELD_WAITLIST_WEBHOOK_SECRET",
  "PAYSHIELD_REQUIRE_WAITLIST_WEBHOOK",
];

function usage() {
  return [
    "Usage: npm run vercel:env:audit -- [--stdin] [--allow-prototype] [--environment Production]",
    "",
    "Checks whether required Vercel environment variables exist without printing values.",
    "--stdin reads `vercel env ls` output from stdin instead of running `npx vercel env ls`.",
    "--allow-prototype exits 0 while reporting missing paid-traffic webhook variables.",
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

  if (!/^[A-Za-z][A-Za-z ]{0,40}$/.test(environment)) {
    throw new Error("--environment must be a Vercel environment name.");
  }

  const unknown = args.find(
    (arg) =>
      arg.startsWith("--") &&
      ![
        "--allow-prototype",
        "--environment",
        "--help",
        "--stdin",
        "-h",
      ].includes(arg) &&
      !arg.startsWith("--environment="),
  );

  if (unknown) {
    throw new Error(`Unknown option: ${unknown}`);
  }

  return {
    allowPrototype: args.includes("--allow-prototype"),
    environment,
    help: false,
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
  const { stdout } = await execFileAsync("npx", ["vercel", "env", "ls"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });

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

export function auditVercelEnvList({
  environment = "Production",
  required = requiredProductionEnv,
  text,
}) {
  const variables = parseVercelEnvList(text);
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

async function main() {
  const parsed = parseCliArgs(process.argv.slice(2));

  if (parsed.help) {
    console.log(usage());
    return;
  }

  const text = parsed.stdin ? await readStdin() : await readVercelEnvList();
  const result = auditVercelEnvList({
    environment: parsed.environment,
    text,
  });

  console.log(JSON.stringify(result, null, 2));

  if (!result.ok && !parsed.allowPrototype) {
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Vercel env audit failed.");
    process.exit(1);
  });
}
