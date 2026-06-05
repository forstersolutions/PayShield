import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { lintCampaignCopy } from "./check-campaign-copy.mjs";

const defaultManifestPath = "docs/campaigns/manifest.json";
const allowedChannels = new Set([
  "alternate-landing-page",
  "email",
  "paid-ad",
  "paid-search",
  "paid-social",
  "partner",
  "social",
]);
const allowedStatuses = new Set(["draft", "ready-for-counsel", "approved"]);

function usage() {
  return [
    "Usage: npm run campaign:lint:all -- [--manifest docs/campaigns/manifest.json]",
    "",
    "Checks the campaign copy manifest and lints every listed paid ad, email, social, partner, and alternate landing-page draft.",
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
      !["--help", "--manifest", "-h"].includes(arg) &&
      !arg.startsWith("--manifest="),
  );

  if (unknown) {
    throw new Error(`Unknown option: ${unknown}`);
  }

  return {
    help: false,
    manifestPath: flagValue(args, "--manifest") || defaultManifestPath,
  };
}

function repoSafePath(path, root) {
  const absolute = resolve(root, path);
  const relationship = relative(root, absolute);

  if (
    relationship.startsWith("..") ||
    relationship === "" ||
    relationship.startsWith("/") ||
    relationship.includes("\0")
  ) {
    return null;
  }

  return {
    absolute,
    relative: relationship,
  };
}

function hasRequiredPrototypeFraming(text) {
  const normalized = text.replace(/\s+/g, " ").toLowerCase();

  return (
    normalized.includes("payshield is not a bank") &&
    normalized.includes("prototype")
  );
}

function publicDraftSummary(draft) {
  return {
    channel: draft?.channel ?? "",
    path: draft?.path ?? "",
    status: draft?.status ?? "",
    title: draft?.title ?? "",
  };
}

export async function lintCampaignManifest({
  manifestPath = defaultManifestPath,
  root = process.cwd(),
} = {}) {
  const findings = [];
  const checked = [];
  const manifestFile = repoSafePath(manifestPath, root);

  if (!manifestFile) {
    throw new Error("--manifest must point to a file inside the repository.");
  }

  let manifest;

  try {
    manifest = JSON.parse(await readFile(manifestFile.absolute, "utf8"));
  } catch (error) {
    throw new Error(
      `Unable to read campaign manifest at ${manifestPath}: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }

  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    findings.push({
      id: "manifest-shape",
      label: manifestFile.relative,
      message: "Campaign manifest must be a JSON object.",
    });
  }

  if (typeof manifest?.version !== "string" || manifest.version.length === 0) {
    findings.push({
      id: "manifest-version",
      label: manifestFile.relative,
      message: "Campaign manifest must include a version string.",
    });
  }

  const drafts = Array.isArray(manifest?.drafts) ? manifest.drafts : [];

  if (drafts.length === 0) {
    findings.push({
      id: "manifest-empty",
      label: manifestFile.relative,
      message: "Campaign manifest must list every paid campaign draft and cannot be empty.",
    });
  }

  const seenPaths = new Set();

  for (const [index, draft] of drafts.entries()) {
    const label = `drafts[${index}]`;

    if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
      findings.push({
        id: "draft-shape",
        label,
        message: "Campaign draft entry must be an object.",
      });
      continue;
    }

    const summary = publicDraftSummary(draft);

    if (typeof draft.path !== "string" || draft.path.length === 0) {
      findings.push({
        draft: summary,
        id: "draft-path",
        label,
        message: "Campaign draft entry must include a path.",
      });
      continue;
    }

    const draftFile = repoSafePath(draft.path, root);

    if (!draftFile) {
      findings.push({
        draft: summary,
        id: "draft-path-outside-repo",
        label: draft.path,
        message: "Campaign draft path must stay inside the repository.",
      });
      continue;
    }

    if (seenPaths.has(draftFile.relative)) {
      findings.push({
        draft: summary,
        id: "draft-duplicate",
        label: draftFile.relative,
        message: "Campaign draft appears more than once in the manifest.",
      });
      continue;
    }

    seenPaths.add(draftFile.relative);

    if (!/\.(?:md|txt)$/i.test(draftFile.relative)) {
      findings.push({
        draft: summary,
        id: "draft-extension",
        label: draftFile.relative,
        message: "Campaign draft must be a Markdown or text file.",
      });
    }

    if (!allowedChannels.has(draft.channel)) {
      findings.push({
        draft: summary,
        id: "draft-channel",
        label: draftFile.relative,
        message: `Campaign draft channel must be one of: ${[
          ...allowedChannels,
        ].join(", ")}.`,
      });
    }

    if (!allowedStatuses.has(draft.status)) {
      findings.push({
        draft: summary,
        id: "draft-status",
        label: draftFile.relative,
        message: `Campaign draft status must be one of: ${[
          ...allowedStatuses,
        ].join(", ")}.`,
      });
    }

    let text = "";

    try {
      text = await readFile(draftFile.absolute, "utf8");
    } catch (error) {
      findings.push({
        draft: summary,
        id: "draft-readable",
        label: draftFile.relative,
        message: `Unable to read campaign draft: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      });
      continue;
    }

    checked.push({
      channel: draft.channel,
      path: draftFile.relative,
      status: draft.status,
      title: draft.title ?? "",
    });

    if (!hasRequiredPrototypeFraming(text)) {
      findings.push({
        draft: summary,
        id: "draft-prototype-framing",
        label: draftFile.relative,
        message:
          'Campaign draft must include "PayShield is not a bank" and prototype framing.',
      });
    }

    const lintResult = lintCampaignCopy({
      label: draftFile.relative,
      text,
    });

    findings.push(...lintResult.findings);
  }

  return {
    checked,
    findings,
    manifest: {
      path: manifestFile.relative,
      version: manifest?.version ?? "",
    },
    ok: findings.length === 0,
  };
}

async function main() {
  const parsed = parseCliArgs(process.argv.slice(2));

  if (parsed.help) {
    console.log(usage());
    return;
  }

  const result = await lintCampaignManifest({
    manifestPath: parsed.manifestPath,
  });

  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Campaign manifest lint failed.",
    );
    process.exit(1);
  });
}
