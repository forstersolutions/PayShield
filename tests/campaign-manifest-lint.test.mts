import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { lintCampaignManifest } from "../scripts/check-campaign-manifest.mjs";

async function tempRepo() {
  return mkdtemp(join(tmpdir(), "payshield-campaign-manifest-"));
}

async function writeJson(path: string, value: unknown) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const safeCopy = [
  "PayShield is a planning-only paycheck app for household clarity.",
  "Financial accounts, cards, money movement, and insurance coverage are available only through approved regulated partners when enabled.",
  "The current app does not provide financial services.",
].join("\n");

test("passes a non-empty manifest when every campaign draft is safe", async () => {
  const root = await tempRepo();

  try {
    await writeFile(join(root, "paid-social.md"), safeCopy, "utf8");
    await writeFile(join(root, "email.md"), safeCopy, "utf8");
    await writeJson(join(root, "manifest.json"), {
      drafts: [
        {
          channel: "paid-social",
          path: "paid-social.md",
          status: "ready-for-counsel",
          title: "Paid social",
        },
        {
          channel: "email",
          path: "email.md",
          status: "draft",
          title: "Email",
        },
      ],
      version: "test-manifest",
    });

    const result = await lintCampaignManifest({
      manifestPath: "manifest.json",
      root,
    });

    assert.equal(result.ok, true);
    assert.deepEqual(
      result.checked.map((draft: { path: string }) => draft.path),
      ["paid-social.md", "email.md"],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("fails an empty campaign manifest", async () => {
  const root = await tempRepo();

  try {
    await writeJson(join(root, "manifest.json"), {
      drafts: [],
      version: "test-manifest",
    });

    const result = await lintCampaignManifest({
      manifestPath: "manifest.json",
      root,
    });

    assert.equal(result.ok, false);
    assert.equal(
      result.findings.some((finding: { id: string }) => finding.id === "manifest-empty"),
      true,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("flags missing planning-only framing and regulated copy findings", async () => {
  const root = await tempRepo();

  try {
    await writeFile(
      join(root, "bad.md"),
      "Open your account today with direct deposit and ACH.",
      "utf8",
    );
    await writeJson(join(root, "manifest.json"), {
      drafts: [
        {
          channel: "paid-search",
          path: "bad.md",
          status: "ready-for-counsel",
          title: "Bad search",
        },
      ],
      version: "test-manifest",
    });

    const result = await lintCampaignManifest({
      manifestPath: "manifest.json",
      root,
    });
    const ids = result.findings.map((finding: { id: string }) => finding.id);

    assert.equal(result.ok, false);
    assert.equal(ids.includes("draft-planning-only-framing"), true);
    assert.equal(ids.includes("deposit-account"), true);
    assert.equal(ids.includes("direct-deposit"), true);
    assert.equal(ids.includes("ach"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("flags duplicate draft paths and paths outside the repo", async () => {
  const root = await tempRepo();

  try {
    await writeFile(join(root, "safe.md"), safeCopy, "utf8");
    await writeJson(join(root, "manifest.json"), {
      drafts: [
        {
          channel: "partner",
          path: "safe.md",
          status: "draft",
          title: "Safe one",
        },
        {
          channel: "partner",
          path: "safe.md",
          status: "draft",
          title: "Safe duplicate",
        },
        {
          channel: "partner",
          path: "../outside.md",
          status: "draft",
          title: "Outside",
        },
      ],
      version: "test-manifest",
    });

    const result = await lintCampaignManifest({
      manifestPath: "manifest.json",
      root,
    });
    const ids = result.findings.map((finding: { id: string }) => finding.id);

    assert.equal(result.ok, false);
    assert.equal(ids.includes("draft-duplicate"), true);
    assert.equal(ids.includes("draft-path-outside-repo"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
