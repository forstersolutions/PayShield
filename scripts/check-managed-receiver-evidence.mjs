import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { evaluateManagedReceiverEvidence } from "./market-go-no-go.mjs";

function usage() {
  return [
    "Usage: npm run receiver:managed:check -- --file launch-evidence/receiver-evidence.json",
    "",
    "Managed receiver evidence check: validates redacted CRM evidence before final market go/no-go.",
    "Use this when production capture is a CRM, Airtable, Slack, Make, Zapier, or internal webhook instead of the lightweight file receiver.",
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
      !["--file", "--help", "-h"].includes(arg) &&
      !arg.startsWith("--file="),
  );

  if (unknown) {
    throw new Error(`Unknown option: ${unknown}`);
  }

  const file = flagValue(args, "--file");

  if (!file) {
    throw new Error("--file is required.");
  }

  return {
    file,
    help: false,
  };
}

export function evaluateManagedReceiverEvidenceFile(evidence) {
  return evaluateManagedReceiverEvidence(evidence);
}

async function readJsonFile(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(
      `Unable to read managed receiver evidence JSON at ${path}: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }
}

async function main() {
  const parsed = parseCliArgs(process.argv.slice(2));

  if (parsed.help) {
    console.log(usage());
    return;
  }

  const evidence = await readJsonFile(parsed.file);
  const result = evaluateManagedReceiverEvidenceFile(evidence);

  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Managed receiver evidence check failed.",
    );
    process.exit(1);
  });
}
