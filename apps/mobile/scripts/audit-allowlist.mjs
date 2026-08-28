import { execFileSync } from "node:child_process";

let output = "";

try {
  output = execFileSync("npm", ["audit", "--json"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch (error) {
  output = String(error.stdout || "");
}

const report = JSON.parse(output || "{}");
const vulnerabilities = report.vulnerabilities || {};
const names = Object.keys(vulnerabilities).sort();
const allowedNames = [
  "image-size",
  "metro",
  "metro-config",
  "metro-transform-worker",
];
const imageAdvisories = new Set(
  (vulnerabilities["image-size"]?.via || [])
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => Number(entry.source)),
);
const expectedAdvisories = new Set([1138808, 1138809]);
const advisoriesMatch =
  imageAdvisories.size === expectedAdvisories.size &&
  [...imageAdvisories].every((id) => expectedAdvisories.has(id));
const onlyPatchedParserAdvisories =
  names.length === 0 ||
  (JSON.stringify(names) === JSON.stringify(allowedNames) &&
    advisoriesMatch &&
    Number(report.metadata?.vulnerabilities?.critical || 0) === 0);

if (!onlyPatchedParserAdvisories) {
  console.error(
    JSON.stringify(
      {
        advisories: [...imageAdvisories],
        error: "Mobile dependency audit contains an unreviewed advisory.",
        vulnerabilities: names,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

console.log(
  names.length
    ? "npm audit contains only the locally hardened image-size parser advisories"
    : "npm audit found no vulnerabilities",
);
