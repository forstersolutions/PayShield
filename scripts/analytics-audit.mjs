import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const analyticsFiles = [
  "src/app/components/waitlist-form.tsx",
  "src/app/api/waitlist/route.ts",
];
const expectedAnalyticsEvents = [
  "Pilot Request Attempted",
  "Pilot Request Failed",
  "Pilot Request Received",
  "Pilot Request Submitted",
];
const expectedPropertyKeys = [
  "campaignMedium",
  "campaignName",
  "campaignSource",
  "hasCampaignAttribution",
  "hasMessage",
  "hasName",
  "mode",
  "segment",
  "status",
];
const bannedTrackPropertyPatterns = [
  ["email", /\bemail\s*:/i],
  ["name", /\bname\s*:/i],
  ["message", /\bmessage\s*:/i],
  ["consentText", /\bconsentText\s*:/i],
  ["consentedAt", /\bconsentedAt\s*:/i],
  ["consentVersion", /\bconsentVersion\s*:/i],
  ["privacyVersion", /\bprivacyVersion\s*:/i],
  ["termsVersion", /\btermsVersion\s*:/i],
  ["submissionId", /\bsubmissionId\s*:/i],
  ["landingPath", /\blandingPath\s*:/i],
  ["utmContent", /\butmContent\s*:/i],
  ["utmTerm", /\butmTerm\s*:/i],
  ["rawQuery", /\brawQuery\s*:/i],
  ["url", /\burl\s*:/i],
];
const approvedTrackPropertySpreads = ["analyticsAttribution", "campaignProperties"];

function usage() {
  return [
    "Usage: npm run analytics:audit",
    "",
    "Checks PayShield pilot analytics instrumentation for mounted Vercel analytics,",
    "approved event names, approved property keys, campaign metadata, and banned PII fields.",
  ].join("\n");
}

function readProjectFile(path) {
  return readFileSync(join(root, path), "utf8");
}

function lineForIndex(text, index) {
  return text.slice(0, index).split("\n").length;
}

function extractBalancedCall(text, openParenIndex) {
  let depth = 0;
  let quote = "";
  let escaped = false;

  for (let index = openParenIndex; index < text.length; index += 1) {
    const char = text[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }

      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "(") {
      depth += 1;
      continue;
    }

    if (char === ")") {
      depth -= 1;

      if (depth === 0) {
        return text.slice(openParenIndex, index + 1);
      }
    }
  }

  return text.slice(openParenIndex);
}

export function extractTrackCalls({ file = "source", text }) {
  const calls = [];
  const pattern = /\btrack\s*\(/g;
  let match;

  while ((match = pattern.exec(text))) {
    const openParenIndex = text.indexOf("(", match.index);
    const call = extractBalancedCall(text, openParenIndex);
    const eventMatch = call.match(/^\(\s*(["'])([^"']+)\1/);

    calls.push({
      call,
      eventName: eventMatch?.[2] ?? "",
      file,
      line: lineForIndex(text, match.index),
    });
  }

  return calls;
}

function extractFirstObjectLiteral(text) {
  let quote = "";
  let escaped = false;

  for (let start = 0; start < text.length; start += 1) {
    const char = text[start];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }

      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char !== "{") {
      continue;
    }

    let depth = 0;

    for (let index = start; index < text.length; index += 1) {
      const nestedChar = text[index];

      if (quote) {
        if (escaped) {
          escaped = false;
        } else if (nestedChar === "\\") {
          escaped = true;
        } else if (nestedChar === quote) {
          quote = "";
        }

        continue;
      }

      if (
        nestedChar === '"' ||
        nestedChar === "'" ||
        nestedChar === "`"
      ) {
        quote = nestedChar;
        continue;
      }

      if (nestedChar === "{") {
        depth += 1;
        continue;
      }

      if (nestedChar === "}") {
        depth -= 1;

        if (depth === 0) {
          return text.slice(start + 1, index);
        }
      }
    }
  }

  return "";
}

function splitTopLevelProperties(text) {
  const parts = [];
  let start = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  let parenDepth = 0;
  let quote = "";
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = "";
      }

      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "{") {
      braceDepth += 1;
      continue;
    }

    if (char === "}") {
      braceDepth -= 1;
      continue;
    }

    if (char === "[") {
      bracketDepth += 1;
      continue;
    }

    if (char === "]") {
      bracketDepth -= 1;
      continue;
    }

    if (char === "(") {
      parenDepth += 1;
      continue;
    }

    if (char === ")") {
      parenDepth -= 1;
      continue;
    }

    if (
      char === "," &&
      braceDepth === 0 &&
      bracketDepth === 0 &&
      parenDepth === 0
    ) {
      parts.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }

  const last = text.slice(start).trim();

  if (last) {
    parts.push(last);
  }

  return parts.filter(Boolean);
}

export function extractTrackPropertyEntries(call) {
  const objectLiteral = extractFirstObjectLiteral(call);
  const keys = [];
  const spreads = [];

  for (const part of splitTopLevelProperties(objectLiteral)) {
    const spreadMatch = part.match(/^\.\.\.\s*([A-Za-z_$][\w$]*)\s*$/);

    if (spreadMatch) {
      spreads.push(spreadMatch[1]);
      continue;
    }

    const explicitMatch =
      part.match(/^([A-Za-z_$][\w$]*)\s*:/) ??
      part.match(/^["']([^"']+)["']\s*:/);

    if (explicitMatch) {
      keys.push(explicitMatch[1]);
      continue;
    }

    const shorthandMatch = part.match(/^([A-Za-z_$][\w$]*)$/);

    if (shorthandMatch) {
      keys.push(shorthandMatch[1]);
    }
  }

  return { keys, spreads };
}

function extractArrayLiteral(text, name) {
  const pattern = new RegExp(`export const ${name} = \\[`);
  const match = pattern.exec(text);

  if (!match) {
    return [];
  }

  const start = text.indexOf("[", match.index);
  const end = text.indexOf("]", start);
  const literal = text.slice(start + 1, end);
  const values = [];
  const stringPattern = /["']([^"']+)["']/g;
  let stringMatch;

  while ((stringMatch = stringPattern.exec(literal))) {
    values.push(stringMatch[1]);
  }

  return values;
}

function compareArrays(actual, expected, label, findings) {
  for (const value of expected) {
    if (!actual.includes(value)) {
      findings.push(`${label} is missing ${value}`);
    }
  }

  for (const value of actual) {
    if (!expected.includes(value)) {
      findings.push(`${label} includes unapproved value ${value}`);
    }
  }
}

function publicAuditResult({
  allowedEventNames,
  allowedPropertyKeys,
  analyticsMounted,
  eventNames,
  findings,
  propertyKeys,
  speedInsightsMounted,
  spreadProperties,
  trackCallCount,
}) {
  return {
    allowedEventNames,
    allowedPropertyKeys,
    analyticsMounted,
    eventNames,
    findings,
    ok: findings.length === 0,
    propertyKeys,
    speedInsightsMounted,
    spreadProperties,
    trackCallCount,
  };
}

export function auditAnalyticsInstrumentation({
  files = Object.fromEntries(
    analyticsFiles.map((path) => [path, readProjectFile(path)]),
  ),
  layoutText = readProjectFile("src/app/layout.tsx"),
  privacyText = readProjectFile("src/app/privacy/page.tsx"),
  sharedText = readProjectFile("src/app/lib/pilot-analytics.ts"),
} = {}) {
  const findings = [];
  const calls = Object.entries(files).flatMap(([file, text]) =>
    extractTrackCalls({ file, text }),
  );
  const eventNames = [...new Set(calls.map((call) => call.eventName))].sort();
  const propertyEntries = calls.flatMap((call) => {
    const entries = extractTrackPropertyEntries(call.call);

    return [
      ...entries.keys.map((key) => ({
        file: call.file,
        key,
        line: call.line,
        type: "key",
      })),
      ...entries.spreads.map((key) => ({
        file: call.file,
        key,
        line: call.line,
        type: "spread",
      })),
    ];
  });
  const propertyKeys = [
    ...new Set(
      propertyEntries
        .filter((entry) => entry.type === "key")
        .map((entry) => entry.key),
    ),
  ].sort();
  const spreadProperties = [
    ...new Set(
      propertyEntries
        .filter((entry) => entry.type === "spread")
        .map((entry) => entry.key),
    ),
  ].sort();
  const allowedEventNames = extractArrayLiteral(sharedText, "pilotAnalyticsEventNames");
  const allowedPropertyKeys = extractArrayLiteral(
    sharedText,
    "pilotAnalyticsPropertyKeys",
  );
  const analyticsMounted = layoutText.includes("<Analytics />");
  const speedInsightsMounted = layoutText.includes("<SpeedInsights />");

  if (!analyticsMounted) {
    findings.push("Vercel Analytics component is not mounted.");
  }

  if (!speedInsightsMounted) {
    findings.push("Vercel Speed Insights component is not mounted.");
  }

  compareArrays(
    allowedEventNames,
    expectedAnalyticsEvents,
    "pilotAnalyticsEventNames",
    findings,
  );
  compareArrays(
    allowedPropertyKeys,
    expectedPropertyKeys,
    "pilotAnalyticsPropertyKeys",
    findings,
  );

  for (const eventName of eventNames) {
    if (!allowedEventNames.includes(eventName)) {
      findings.push(`Unapproved analytics event name: ${eventName || "unknown"}`);
    }
  }

  for (const call of calls) {
    for (const [label, pattern] of bannedTrackPropertyPatterns) {
      if (pattern.test(call.call)) {
        findings.push(
          `${call.file}:${call.line} sends banned analytics property ${label}`,
        );
      }
    }
  }

  for (const entry of propertyEntries) {
    if (
      entry.type === "key" &&
      !allowedPropertyKeys.includes(entry.key)
    ) {
      findings.push(
        `${entry.file}:${entry.line} sends unapproved analytics property ${entry.key}`,
      );
    }

    if (
      entry.type === "spread" &&
      !approvedTrackPropertySpreads.includes(entry.key)
    ) {
      findings.push(
        `${entry.file}:${entry.line} uses unapproved analytics property spread ${entry.key}`,
      );
    }
  }

  if (!privacyText.includes("does not send email addresses, names, bank details")) {
    findings.push("Privacy Notice is missing analytics PII-boundary language.");
  }

  if (!privacyText.includes("Analytics") || !privacyText.includes("Speed Insights")) {
    findings.push("Privacy Notice is missing Vercel analytics disclosures.");
  }

  if (
    !privacyText.includes("utm_source") ||
    !privacyText.includes("utm_campaign")
  ) {
    findings.push("Privacy Notice is missing campaign attribution disclosures.");
  }

  return publicAuditResult({
    allowedEventNames,
    allowedPropertyKeys,
    analyticsMounted,
    eventNames,
    findings,
    propertyKeys,
    speedInsightsMounted,
    spreadProperties,
    trackCallCount: calls.length,
  });
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(usage());
    return;
  }

  const result = auditAnalyticsInstrumentation();

  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Analytics audit failed.",
    );
    process.exit(1);
  });
}
