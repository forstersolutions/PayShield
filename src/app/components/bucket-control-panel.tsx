"use client";

import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  LockKeyhole,
  Plus,
  Save,
  Settings2,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { BucketBalance, BucketProtection } from "@/app/lib/neobank/types.ts";

type BucketControl = {
  due: string;
  id: string;
  name: string;
  priority: number;
  protection: BucketProtection;
  targetCents: number;
};

type SaveState =
  | { status: "idle"; message: string }
  | { status: "loading"; message: string }
  | { status: "drafted"; message: string }
  | { status: "saving"; message: string }
  | { status: "saved"; message: string }
  | { status: "error"; message: string };

type ProfilePersistence = "core_service_model" | "durable_core" | "stateless_model";

type BucketProfileResponse = {
  buckets?: BucketBalance[] | BucketControl[];
  error?: string;
  message?: string;
  persisted?: boolean;
  profilePersistence?: ProfilePersistence;
  profileSource?: "core_control_model" | "local_simulation";
};

const draftStorageKey = "payshield.bucket-controls.draft.v3";
const paycheckCents = 300_000;
const coreBucketIds = new Set(["rent", "vehicle", "insurance", "safe_spending"]);
const protectionOptions: Array<{
  label: string;
  value: BucketProtection;
}> = [
  { label: "Bill-only", value: "bill_only" },
  { label: "Hard lock", value: "hard_lock" },
  { label: "Soft lock", value: "soft_lock" },
  { label: "Emergency", value: "emergency" },
];

function dollarsToCents(value: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.round(parsed * 100));
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}

function slugify(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32) || "custom_bucket"
  );
}

function controlsFromBuckets(buckets: BucketBalance[]): BucketControl[] {
  return buckets
    .filter((bucket) => bucket.id !== "safe_spending")
    .sort((a, b) => a.priority - b.priority)
    .map((bucket) => ({
      due: bucket.due,
      id: bucket.id,
      name: bucket.name,
      priority: bucket.priority,
      protection: bucket.protection,
      targetCents: bucket.targetCents,
    }));
}

function readDraftControls(defaults: BucketControl[]) {
  if (typeof window === "undefined") {
    return {
      controls: defaults,
      found: false,
    };
  }

  try {
    const stored = window.localStorage.getItem(draftStorageKey);

    if (!stored) {
      return {
        controls: defaults,
        found: false,
      };
    }

    const parsed = JSON.parse(stored);

    if (!Array.isArray(parsed)) {
      return {
        controls: defaults,
        found: false,
      };
    }

    const storedControls = parsed
      .map((item): BucketControl | null => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const record = item as Record<string, unknown>;
        const name = typeof record.name === "string" ? record.name.trim() : "";
        const id =
          typeof record.id === "string" && record.id.trim()
            ? record.id.trim()
            : `custom_${slugify(name)}`;
        const due = typeof record.due === "string" ? record.due.trim() : "";
        const protection = protectionOptions.some(
          (option) => option.value === record.protection,
        )
          ? (record.protection as BucketProtection)
          : "hard_lock";
        const targetCents =
          typeof record.targetCents === "number" && Number.isFinite(record.targetCents)
            ? Math.max(0, Math.round(record.targetCents))
            : 0;
        const priority =
          typeof record.priority === "number" && Number.isFinite(record.priority)
            ? Math.max(1, Math.round(record.priority))
            : 99;

        if (!name) {
          return null;
        }

        return {
          due: due || "Every check",
          id,
          name,
          priority,
          protection,
          targetCents,
        };
      })
      .filter((item): item is BucketControl => Boolean(item));

    return {
      controls: storedControls.length ? storedControls : defaults,
      found: storedControls.length > 0,
    };
  } catch {
    return {
      controls: defaults,
      found: false,
    };
  }
}

function normalizePriorities(controls: BucketControl[]) {
  return controls.map((control, index) => ({
    ...control,
    priority: (index + 1) * 10,
  }));
}

export function BucketControlPanel({
  buckets,
}: {
  buckets: BucketBalance[];
}) {
  const defaults = useMemo(() => controlsFromBuckets(buckets), [buckets]);
  const [controls, setControls] = useState<BucketControl[]>(defaults);
  const [draftDirty, setDraftDirty] = useState(false);
  const [profileSource, setProfileSource] =
    useState<BucketProfileResponse["profileSource"]>("local_simulation");
  const [profilePersistence, setProfilePersistence] =
    useState<ProfilePersistence>("stateless_model");
  const [profilePersisted, setProfilePersisted] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({
    message: "Loading household profile...",
    status: "loading",
  });

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        const response = await fetch("/api/app/buckets", {
          headers: { accept: "application/json" },
        });
        const result = (await response.json().catch(() => ({}))) as
          BucketProfileResponse;

        if (cancelled) {
          return;
        }

        if (!response.ok || !Array.isArray(result.buckets)) {
          const draft = readDraftControls(defaults);

          setControls(draft.controls);
          setSaveState({
            message:
              result.error ??
              "Could not load the household profile. A device draft is open for recovery.",
            status: "error",
          });
          setDraftDirty(draft.found);
          return;
        }

        const loadedControls = controlsFromBuckets(result.buckets as BucketBalance[]);
        const draft =
          result.persisted === true
            ? { controls: loadedControls, found: false }
            : readDraftControls(loadedControls);

        setControls(draft.controls);
        setProfileSource(result.profileSource ?? "local_simulation");
        setProfilePersistence(result.profilePersistence ?? "stateless_model");
        setProfilePersisted(result.persisted === true);

        if (result.persisted === true) {
          setDraftDirty(false);
          window.localStorage.removeItem(draftStorageKey);
        } else {
          setDraftDirty(draft.found);
        }

        setSaveState({
          message: draft.found
            ? "Recovered your device draft for bucket rules."
            : result.message ?? "Household profile loaded for rule validation.",
          status: result.persisted === true ? "saved" : "drafted",
        });
      } catch {
        if (cancelled) {
          return;
        }

        const draft = readDraftControls(defaults);

        setControls(draft.controls);
        setSaveState({
          message:
            "Network error while loading the household profile. A device draft is open for recovery.",
          status: "error",
        });
        setDraftDirty(draft.found);
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [defaults]);

  useEffect(() => {
    if (!draftDirty) {
      return;
    }

    window.localStorage.setItem(draftStorageKey, JSON.stringify(controls));
  }, [controls, draftDirty]);

  const protectedCents = controls.reduce(
    (total, control) => total + control.targetCents,
    0,
  );
  const safePreviewCents = Math.max(0, paycheckCents - protectedCents);
  const overTargetCents = Math.max(0, protectedCents - paycheckCents);
  const protectedPercent = Math.min(
    100,
    Math.round((protectedCents / paycheckCents) * 100),
  );
  const safePercent = Math.max(0, 100 - protectedPercent);
  const nextProtected = controls.find((control) => control.targetCents > 0);

  function updateControl(id: string, patch: Partial<BucketControl>) {
    setControls((current) =>
      current.map((control) =>
        control.id === id ? { ...control, ...patch } : control,
      ),
    );
    setDraftDirty(true);
    setSaveState({ message: "", status: "idle" });
  }

  function moveControl(id: string, direction: -1 | 1) {
    setControls((current) => {
      const index = current.findIndex((control) => control.id === id);
      const nextIndex = index + direction;

      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [control] = next.splice(index, 1);
      next.splice(nextIndex, 0, control);
      return normalizePriorities(next);
    });
    setDraftDirty(true);
    setSaveState({ message: "", status: "idle" });
  }

  function addBucket() {
    const id = `custom_${Date.now().toString(36)}`;
    setControls((current) =>
      normalizePriorities([
        ...current,
        {
          due: "Every check",
          id,
          name: "New protected bucket",
          priority: 99,
          protection: "hard_lock",
          targetCents: 10_000,
        },
      ]),
    );
    setDraftDirty(true);
    setSaveState({ message: "", status: "idle" });
  }

  function removeBucket(id: string) {
    if (coreBucketIds.has(id)) {
      return;
    }

    setControls((current) =>
      normalizePriorities(current.filter((control) => control.id !== id)),
    );
    setDraftDirty(true);
    setSaveState({ message: "", status: "idle" });
  }

  async function saveProfile() {
    setSaveState({
      message: "Saving bucket rules...",
      status: "saving",
    });

    try {
      const response = await fetch("/api/app/buckets", {
        body: JSON.stringify({
          action: "replace_profile",
          buckets: normalizePriorities(controls),
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const result = (await response.json().catch(() => ({}))) as {
        buckets?: BucketControl[];
        message?: string;
        error?: string;
        persisted?: boolean;
        profilePersistence?: ProfilePersistence;
        profileSource?: BucketProfileResponse["profileSource"];
      };

      if (!response.ok) {
        setSaveState({
          message: result.error ?? "Unable to save bucket rules.",
          status: "error",
        });
        return;
      }

      const savedControls = Array.isArray(result.buckets)
        ? controlsFromBuckets(result.buckets as BucketBalance[])
        : normalizePriorities(controls);

      setControls(savedControls);
      setProfileSource(result.profileSource ?? profileSource);
      setProfilePersistence(result.profilePersistence ?? profilePersistence);
      setProfilePersisted(result.persisted === true);

      if (result.persisted === true) {
        setDraftDirty(false);
        window.localStorage.removeItem(draftStorageKey);
      } else {
        setDraftDirty(true);
      }

      setSaveState({
        message:
          result.message ??
          (result.persisted === true
            ? "Bucket rules saved."
            : "Bucket rules validated and preserved as a device draft."),
        status: result.persisted === true ? "saved" : "drafted",
      });
    } catch {
      setSaveState({
        message:
          "Network error. Your changes are preserved as a device draft; retry to sync them.",
        status: "error",
      });
      setDraftDirty(true);
    }
  }

  return (
    <section
      className="relative z-10 border-y border-white/10 bg-[#050607]"
      id="bucket-studio"
    >
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.78fr_1.22fr] lg:px-8">
        <div>
          <p className="inline-flex items-center gap-2 rounded-[8px] border border-[#39e8ff]/25 bg-[#39e8ff]/10 px-3 py-2 text-sm font-semibold uppercase tracking-[0.14em] text-[#dffaff]">
            <Settings2 className="size-4" aria-hidden="true" />
            Bucket control studio
          </p>
          <h2 className="mt-4 text-3xl font-semibold leading-tight text-white sm:text-4xl">
            Build the household rules before the money arrives.
          </h2>
          <p className="mt-4 text-lg leading-8 text-[#c9d0da]">
            Every protected bucket has a name, funding target, due rule,
            protection mode, and priority. The app validates those rules through
            the control API and keeps device draft recovery active until durable
            account sync is active.
          </p>

          <div className="mt-6 grid gap-3">
            <div className="rounded-[8px] border border-white/10 bg-[#101214] p-4">
              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#ffb237]">
                Current check
              </p>
              <p className="mt-2 text-3xl font-semibold text-white">
                {formatMoney(paycheckCents)}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[8px] border border-white/10 bg-[#101214] p-4">
                <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#39e8ff]">
                  Protected first
                </p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {formatMoney(protectedCents)}
                </p>
              </div>
              <div className="rounded-[8px] border border-white/10 bg-[#101214] p-4">
                <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#1588ff]">
                  Safe after rules
                </p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {formatMoney(safePreviewCents)}
                </p>
              </div>
            </div>
            <div className="rounded-[8px] border border-white/10 bg-black/40 p-3">
              <div className="flex items-center justify-between gap-3 text-xs font-black uppercase tracking-[0.12em] text-[#8f99aa]">
                <span>Protected</span>
                <span>Safe</span>
              </div>
              <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-[#121821]">
                <span
                  className="bg-gradient-to-r from-[#ffb237] to-[#ff6b35]"
                  style={{ width: `${protectedPercent}%` }}
                />
                <span
                  className="bg-gradient-to-r from-[#1588ff] to-[#39e8ff]"
                  style={{ width: `${safePercent}%` }}
                />
              </div>
            </div>

            {overTargetCents ? (
              <p className="rounded-[8px] border border-[#ffb237]/35 bg-[#ffb237]/10 p-3 text-sm leading-6 text-[#ffe2bd]">
                This profile over-allocates the paycheck by{" "}
                {formatMoney(overTargetCents)}. PayShield would fund in priority
                order and leave lower-priority buckets short.
              </p>
            ) : (
              <p className="rounded-[8px] border border-[#39e8ff]/25 bg-[#39e8ff]/10 p-3 text-sm leading-6 text-[#dffaff]">
                {nextProtected?.name ?? "Protected buckets"} fund before
                ordinary card spending. Safe to Spend is the remainder.
              </p>
            )}
          </div>
        </div>

        <div className="brand-panel rounded-[8px] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#39e8ff]">
                Household profile
              </p>
              <h3 className="mt-1 text-2xl font-semibold text-white">
                Secure bucket rules
              </h3>
              <p className="mt-1 text-xs font-bold text-[#8f99aa]">
                {profilePersisted
                  ? "Durable account sync active"
                  : profileSource === "core_control_model"
                    ? "Core model validated"
                    : "App model validated"}
                {!profilePersisted
                  ? profilePersistence === "core_service_model"
                    ? " - account sync pending"
                    : draftDirty
                      ? " - device draft kept"
                      : " - draft recovery ready"
                  : ""}
              </p>
            </div>
            <button
              className="brand-button-blue inline-flex h-10 items-center gap-2 rounded-[8px] px-3 text-sm font-black"
              onClick={addBucket}
              type="button"
            >
              <Plus className="size-4" aria-hidden="true" />
              Add bucket
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            {controls.map((control, index) => (
              <div
                className="rounded-[8px] border border-white/10 bg-black/40 p-3 transition hover:border-[#39e8ff]/35"
                key={control.id}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-[8px] border border-[#1588ff]/25 bg-[#1588ff]/12 text-[#39e8ff]">
                      {control.protection === "bill_only" ? (
                        <CircleDollarSign className="size-5" aria-hidden="true" />
                      ) : (
                        <LockKeyhole className="size-5" aria-hidden="true" />
                      )}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-white">
                        Priority {index + 1}
                      </p>
                      <p className="text-xs leading-5 text-[#8f99aa]">
                        {protectionOptions.find(
                          (option) => option.value === control.protection,
                        )?.label ?? "Protected"}{" "}
                        until {control.due}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      aria-label={`Move ${control.name} earlier`}
                      className="grid size-10 place-items-center rounded-[8px] border border-white/10 text-[#c9d0da] hover:bg-[#1588ff]/12"
                      disabled={index === 0}
                      onClick={() => moveControl(control.id, -1)}
                      type="button"
                    >
                      <ChevronUp className="size-4" aria-hidden="true" />
                    </button>
                    <button
                      aria-label={`Move ${control.name} later`}
                      className="grid size-10 place-items-center rounded-[8px] border border-white/10 text-[#c9d0da] hover:bg-[#1588ff]/12"
                      disabled={index === controls.length - 1}
                      onClick={() => moveControl(control.id, 1)}
                      type="button"
                    >
                      <ChevronDown className="size-4" aria-hidden="true" />
                    </button>
                    <button
                      aria-label={`Remove ${control.name}`}
                      className="grid size-10 place-items-center rounded-[8px] border border-white/10 text-[#ff8a7a] hover:bg-[#ff6b35]/10 disabled:cursor-not-allowed disabled:text-[#555d69]"
                      disabled={coreBucketIds.has(control.id)}
                      onClick={() => removeBucket(control.id)}
                      type="button"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-[1.1fr_0.7fr_0.85fr_0.8fr]">
                  <label className="text-xs font-semibold uppercase tracking-[0.1em] text-[#8f99aa]">
                    Bucket name
                    <input
                      className="mt-2 h-10 w-full rounded-[8px] border border-white/10 bg-[#101214] px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#39e8ff]"
                      onChange={(event) =>
                        updateControl(control.id, { name: event.target.value })
                      }
                      value={control.name}
                    />
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-[0.1em] text-[#8f99aa]">
                    Target
                    <input
                      className="mt-2 h-10 w-full rounded-[8px] border border-white/10 bg-[#101214] px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#39e8ff]"
                      min={0}
                      onChange={(event) =>
                        updateControl(control.id, {
                          targetCents: dollarsToCents(event.target.value),
                        })
                      }
                      step={25}
                      type="number"
                      value={control.targetCents / 100}
                    />
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-[0.1em] text-[#8f99aa]">
                    Protection
                    <select
                      className="mt-2 h-10 w-full rounded-[8px] border border-white/10 bg-[#101214] px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#39e8ff]"
                      onChange={(event) =>
                        updateControl(control.id, {
                          protection: event.target.value as BucketProtection,
                        })
                      }
                      value={control.protection}
                    >
                      {protectionOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-[0.1em] text-[#8f99aa]">
                    Due rule
                    <input
                      className="mt-2 h-10 w-full rounded-[8px] border border-white/10 bg-[#101214] px-3 text-sm normal-case tracking-normal text-white outline-none focus:border-[#39e8ff]"
                      onChange={(event) =>
                        updateControl(control.id, { due: event.target.value })
                      }
                      value={control.due}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>

          <button
            className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-[#ffb237] px-4 text-sm font-black text-[#050607] hover:bg-[#ffd06f] disabled:cursor-not-allowed disabled:bg-[#252a31] disabled:text-[#8f99aa]"
            disabled={
              saveState.status === "saving" || saveState.status === "loading"
            }
            onClick={saveProfile}
            type="button"
          >
            {saveState.status === "saved" ? (
              <CheckCircle2 className="size-4" aria-hidden="true" />
            ) : (
              <Save className="size-4" aria-hidden="true" />
            )}
            Save bucket profile
          </button>

          {saveState.message ? (
            <p
              aria-live={saveState.status === "error" ? "assertive" : "polite"}
              className={`mt-3 rounded-[8px] border p-3 text-sm leading-6 ${
                saveState.status === "error"
                  ? "border-[#ff8a7a]/35 bg-[#ff8a7a]/10 text-[#ffd7d1]"
                  : "border-[#39e8ff]/25 bg-[#39e8ff]/10 text-[#dffaff]"
              }`}
              role={saveState.status === "error" ? "alert" : "status"}
            >
              {saveState.message}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
