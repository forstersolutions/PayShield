import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const safeContextPattern =
  /\b(not|does not|do not|doesn't|cannot|can't|without|avoid|avoids|future|requires|before|pending|not currently|no live)\b/i;
const contrastPattern = /\b(but|however|now)\b/i;

const rules = [
  {
    id: "bank-claim",
    message: "Do not claim PayShield is a bank.",
    pattern: /\b(?:payshield|we)\s+(?:is|are)\s+(?:a\s+)?bank\b/gi,
  },
  {
    id: "banking-services-provider",
    message: "Do not use sponsor-bank boilerplate before sponsorship is approved.",
    pattern: /\bbanking services provided by\b/gi,
  },
  {
    id: "fdic-insurance",
    message: "Do not claim FDIC or pass-through deposit insurance.",
    pattern:
      /\b(member\s+fdic|fdic[-\s]?insured|insured\s+by\s+(?:the\s+)?fdic|fdic\s+insurance|pass-through\s+(?:deposit\s+)?insurance)\b/gi,
  },
  {
    id: "deposit-account",
    message: "Do not promise deposit account opening or approval.",
    pattern:
      /\b(open\s+(?:a\s+|your\s+)?(?:bank\s+|deposit\s+)?account|account opening|deposit account|consumer deposit account|kyc approval)\b/gi,
  },
  {
    id: "direct-deposit",
    message: "Do not imply live direct deposit support.",
    pattern: /\b(direct deposit|deposit your paycheck|paycheck deposit)\b/gi,
  },
  {
    id: "money-movement",
    message: "Do not imply live money movement.",
    pattern: /\b(live\s+money movement|money movement|move money|moves money)\b/gi,
  },
  {
    id: "ach",
    message: "Do not imply live ACH transfer support.",
    pattern: /\b(ach|ach transfers?)\b/gi,
  },
  {
    id: "card-issuing",
    message: "Do not imply live debit-card, virtual-card, or card-issuing support.",
    pattern: /\b(debit card|virtual card|card issuing|issue cards?)\b/gi,
  },
  {
    id: "bill-pay",
    message: "Do not imply live bill-pay functionality.",
    pattern: /\b(bill[-\s]?pay|bill payment|pay bills)\b/gi,
  },
  {
    id: "guarantee",
    message: "Do not use guarantees or absolute protection claims.",
    pattern:
      /\b(guaranteed approval|guaranteed protection|never miss rent|no overdrafts?|can't be spent|cannot be spent)\b/gi,
  },
];

function usage() {
  return [
    "Usage: npm run campaign:lint -- <file ...>",
    "       npm run campaign:lint -- --stdin",
    "",
    "Checks campaign, ad, email, and landing-page copy for regulated-finance claims.",
  ].join("\n");
}

function lineAndColumnForIndex(text, index) {
  const prefix = text.slice(0, index);
  const lines = prefix.split("\n");

  return {
    column: lines.at(-1).length + 1,
    line: lines.length,
  };
}

function hasSafeContext(text, index) {
  const before = text.slice(Math.max(0, index - 100), index);
  const safeMatches = [...before.matchAll(new RegExp(safeContextPattern, "gi"))];

  if (!safeMatches.length) {
    return false;
  }

  const lastSafeMatch = safeMatches.at(-1);
  const suffixAfterSafe = before.slice(
    (lastSafeMatch?.index ?? 0) + (lastSafeMatch?.[0].length ?? 0),
  );

  return !contrastPattern.test(suffixAfterSafe);
}

function excerptForMatch(text, index, length) {
  const start = Math.max(0, index - 40);
  const end = Math.min(text.length, index + length + 40);

  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

/**
 * @param {{ label?: string; text: string }} input
 */
export function lintCampaignCopy({ label = "campaign-copy", text }) {
  const findings = [];

  for (const rule of rules) {
    rule.pattern.lastIndex = 0;

    for (const match of text.matchAll(rule.pattern)) {
      const index = match.index ?? 0;

      if (hasSafeContext(text, index)) {
        continue;
      }

      const location = lineAndColumnForIndex(text, index);

      findings.push({
        column: location.column,
        excerpt: excerptForMatch(text, index, match[0].length),
        id: rule.id,
        label,
        line: location.line,
        message: rule.message,
        match: match[0],
      });
    }
  }

  return {
    findings,
    ok: findings.length === 0,
  };
}

async function readStdin() {
  const chunks = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function collectInputs(args) {
  if (args.includes("--help") || args.includes("-h")) {
    return { help: true, inputs: [] };
  }

  if (args.includes("--stdin")) {
    return {
      help: false,
      inputs: [
        {
          label: "stdin",
          text: await readStdin(),
        },
      ],
    };
  }

  const files = args.filter((arg) => !arg.startsWith("--"));

  if (!files.length) {
    throw new Error("Provide at least one file path or use --stdin.");
  }

  return {
    help: false,
    inputs: await Promise.all(
      files.map(async (file) => ({
        label: file,
        text: await readFile(file, "utf8"),
      })),
    ),
  };
}

async function main() {
  const { help, inputs } = await collectInputs(process.argv.slice(2));

  if (help) {
    console.log(usage());
    return;
  }

  const results = inputs.map(lintCampaignCopy);
  const findings = results.flatMap((result) => result.findings);
  const output = {
    checked: inputs.map((input) => input.label),
    findings,
    ok: findings.length === 0,
  };

  console.log(JSON.stringify(output, null, 2));

  if (!output.ok) {
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Campaign copy lint failed.");
    process.exit(1);
  });
}
