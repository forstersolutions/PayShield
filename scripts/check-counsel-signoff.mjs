import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const requiredScopes = [
  "privacy",
  "terms",
  "publicclaims",
  "productflows",
  "providerdisclosures",
  "operations",
];

function normalizedScopes(value) {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => String(item).trim().toLowerCase()).filter(Boolean))]
    : [];
}

function safeText(value, maxLength = 200) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength;
}

export function evaluateCounselSignoffEvidence(signoff = {}) {
  const scopes = normalizedScopes(signoff.scope);
  const missingScopes = requiredScopes.filter((scope) => !scopes.includes(scope));
  const reviewedAt = Date.parse(signoff.reviewedAt || "");
  const serialized = JSON.stringify(signoff);
  const checks = [
    { name: "approved", ok: signoff.approved === true },
    { name: "reviewedAt", ok: Number.isFinite(reviewedAt) && reviewedAt <= Date.now() },
    { name: "reviewer", ok: safeText(signoff.reviewer, 120) },
    { name: "sourceCommit", ok: /^[a-f0-9]{40}$/i.test(signoff.sourceCommit || "") },
    { name: "providerProgram", ok: safeText(signoff.providerProgram, 160) },
    { name: "evidenceRef", ok: safeText(signoff.evidenceRef, 200) },
    { name: "scope", ok: missingScopes.length === 0 },
    {
      name: "redacted",
      ok: !/(sk_live_|whsec_|password|access[_-]?token|private[_-]?key|api[_-]?key)/i.test(serialized),
    },
  ];
  const findings = checks
    .filter((check) => !check.ok)
    .map((check) => ({ finding: check.name }));

  return {
    checks,
    findings,
    ok: findings.length === 0,
    service: "payshield-counsel-signoff",
    summary: {
      evidenceRef: safeText(signoff.evidenceRef) ? signoff.evidenceRef : "",
      missingScopes,
      providerProgram: safeText(signoff.providerProgram) ? signoff.providerProgram : "",
      reviewedAt: Number.isFinite(reviewedAt) ? signoff.reviewedAt : "",
      sourceCommit: /^[a-f0-9]{40}$/i.test(signoff.sourceCommit || "")
        ? signoff.sourceCommit
        : "",
    },
  };
}

function flagValue(args, name) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || "" : "";
}

async function main() {
  const args = process.argv.slice(2);
  const file = flagValue(args, "--file");

  if (!file || args.includes("--help") || args.includes("-h")) {
    console.log("Usage: npm run counsel:signoff:check -- --file /path/to/redacted-signoff.json");
    process.exitCode = file ? 0 : 1;
    return;
  }

  const signoff = JSON.parse(await readFile(file, "utf8"));
  const result = evaluateCounselSignoffEvidence(signoff);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Counsel sign-off check failed.");
    process.exit(1);
  });
}
