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
  | { status: "saving"; message: string }
  | { status: "saved"; message: string }
  | { status: "error"; message: string };

const storageKey = "payshield.bucket-controls.v2";
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

function readStoredControls(defaults: BucketControl[]) {
  if (typeof window === "undefined") {
    return defaults;
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]");

    if (!Array.isArray(parsed)) {
      return defaults;
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

    return storedControls.length ? storedControls : defaults;
  } catch {
    return defaults;
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
  const [saveState, setSaveState] = useState<SaveState>({
    message: "",
    status: "idle",
  });

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setControls(readStoredControls(defaults));
    }, 0);

    return () => window.clearTimeout(handle);
  }, [defaults]);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(controls));
  }, [controls]);

  const protectedCents = controls.reduce(
    (total, control) => total + control.targetCents,
    0,
  );
  const safePreviewCents = Math.max(0, paycheckCents - protectedCents);
  const overTargetCents = Math.max(0, protectedCents - paycheckCents);
  const nextProtected = controls.find((control) => control.targetCents > 0);

  function updateControl(id: string, patch: Partial<BucketControl>) {
    setControls((current) =>
      current.map((control) =>
        control.id === id ? { ...control, ...patch } : control,
      ),
    );
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
    setSaveState({ message: "", status: "idle" });
  }

  function removeBucket(id: string) {
    if (coreBucketIds.has(id)) {
      return;
    }

    setControls((current) =>
      normalizePriorities(current.filter((control) => control.id !== id)),
    );
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
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        setSaveState({
          message: result.error ?? "Unable to save bucket rules.",
          status: "error",
        });
        return;
      }

      setControls(normalizePriorities(controls));
      setSaveState({
        message: result.message ?? "Bucket rules saved.",
        status: "saved",
      });
    } catch {
      setSaveState({
        message: "Network error. Bucket rules are still saved on this device.",
        status: "error",
      });
    }
  }

  return (
    <section
      className="relative z-10 border-y border-[#243b32] bg-[#102019]"
      id="bucket-studio"
    >
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.78fr_1.22fr] lg:px-8">
        <div>
          <p className="inline-flex items-center gap-2 rounded-[8px] border border-[#bfe8d0]/25 bg-[#bfe8d0]/10 px-3 py-2 text-sm font-semibold uppercase tracking-[0.14em] text-[#d7f7df]">
            <Settings2 className="size-4" aria-hidden="true" />
            Bucket control studio
          </p>
          <h2 className="mt-4 text-3xl font-semibold leading-tight text-[#fff8ed] sm:text-4xl">
            Build the household rules before the money arrives.
          </h2>
          <p className="mt-4 text-lg leading-8 text-[#d8cbb8]">
            Every protected bucket has a name, funding target, due rule,
            protection mode, and priority. The profile is saved locally today
            and matches the backend bucket model for account-backed enforcement
            when regulated partner rails are enabled.
          </p>

          <div className="mt-6 grid gap-3">
            <div className="rounded-[8px] border border-[#33473e] bg-[#152920] p-4">
              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#f2bc7d]">
                Current check
              </p>
              <p className="mt-2 text-3xl font-semibold text-[#fff8ed]">
                {formatMoney(paycheckCents)}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[8px] border border-[#33473e] bg-[#152920] p-4">
                <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#bfe8d0]">
                  Protected first
                </p>
                <p className="mt-2 text-2xl font-semibold text-[#fff8ed]">
                  {formatMoney(protectedCents)}
                </p>
              </div>
              <div className="rounded-[8px] border border-[#33473e] bg-[#152920] p-4">
                <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#a8c8ff]">
                  Safe after rules
                </p>
                <p className="mt-2 text-2xl font-semibold text-[#fff8ed]">
                  {formatMoney(safePreviewCents)}
                </p>
              </div>
            </div>
            {overTargetCents ? (
              <p className="rounded-[8px] border border-[#f2bc7d]/35 bg-[#f2bc7d]/10 p-3 text-sm leading-6 text-[#ffe2bd]">
                This profile over-allocates the paycheck by{" "}
                {formatMoney(overTargetCents)}. PayShield would fund in priority
                order and leave lower-priority buckets short.
              </p>
            ) : (
              <p className="rounded-[8px] border border-[#bfe8d0]/25 bg-[#bfe8d0]/10 p-3 text-sm leading-6 text-[#d7f7df]">
                {nextProtected?.name ?? "Protected buckets"} fund before
                ordinary card spending. Safe to Spend is the remainder.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-[8px] border border-[#33473e] bg-[#152920] p-4 shadow-[0_26px_90px_rgba(0,0,0,0.26)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#bfe8d0]">
                Household profile
              </p>
              <h3 className="mt-1 text-2xl font-semibold text-[#fff8ed]">
                Secure bucket rules
              </h3>
            </div>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-[#bfe8d0] px-3 text-sm font-semibold text-[#11251a] hover:bg-[#d7f7df]"
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
                className="rounded-[8px] border border-[#33473e] bg-[#0f1b16] p-3"
                key={control.id}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-[8px] bg-[#20382d] text-[#bfe8d0]">
                      {control.protection === "bill_only" ? (
                        <CircleDollarSign className="size-5" aria-hidden="true" />
                      ) : (
                        <LockKeyhole className="size-5" aria-hidden="true" />
                      )}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-[#fff8ed]">
                        Priority {index + 1}
                      </p>
                      <p className="text-xs leading-5 text-[#b8ab99]">
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
                      className="grid size-9 place-items-center rounded-[8px] border border-[#33473e] text-[#d8cbb8] hover:bg-[#20382d]"
                      disabled={index === 0}
                      onClick={() => moveControl(control.id, -1)}
                      type="button"
                    >
                      <ChevronUp className="size-4" aria-hidden="true" />
                    </button>
                    <button
                      aria-label={`Move ${control.name} later`}
                      className="grid size-9 place-items-center rounded-[8px] border border-[#33473e] text-[#d8cbb8] hover:bg-[#20382d]"
                      disabled={index === controls.length - 1}
                      onClick={() => moveControl(control.id, 1)}
                      type="button"
                    >
                      <ChevronDown className="size-4" aria-hidden="true" />
                    </button>
                    <button
                      aria-label={`Remove ${control.name}`}
                      className="grid size-9 place-items-center rounded-[8px] border border-[#33473e] text-[#f0a6a0] hover:bg-[#3a1f1d] disabled:cursor-not-allowed disabled:text-[#73685e]"
                      disabled={coreBucketIds.has(control.id)}
                      onClick={() => removeBucket(control.id)}
                      type="button"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-[1.1fr_0.7fr_0.85fr_0.8fr]">
                  <label className="text-xs font-semibold uppercase tracking-[0.1em] text-[#b8ab99]">
                    Bucket name
                    <input
                      className="mt-2 h-10 w-full rounded-[8px] border border-[#33473e] bg-[#152920] px-3 text-sm normal-case tracking-normal text-[#fff8ed] outline-none focus:border-[#bfe8d0]"
                      onChange={(event) =>
                        updateControl(control.id, { name: event.target.value })
                      }
                      value={control.name}
                    />
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-[0.1em] text-[#b8ab99]">
                    Target
                    <input
                      className="mt-2 h-10 w-full rounded-[8px] border border-[#33473e] bg-[#152920] px-3 text-sm normal-case tracking-normal text-[#fff8ed] outline-none focus:border-[#bfe8d0]"
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
                  <label className="text-xs font-semibold uppercase tracking-[0.1em] text-[#b8ab99]">
                    Protection
                    <select
                      className="mt-2 h-10 w-full rounded-[8px] border border-[#33473e] bg-[#152920] px-3 text-sm normal-case tracking-normal text-[#fff8ed] outline-none focus:border-[#bfe8d0]"
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
                  <label className="text-xs font-semibold uppercase tracking-[0.1em] text-[#b8ab99]">
                    Due rule
                    <input
                      className="mt-2 h-10 w-full rounded-[8px] border border-[#33473e] bg-[#152920] px-3 text-sm normal-case tracking-normal text-[#fff8ed] outline-none focus:border-[#bfe8d0]"
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
            className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-[#f2bc7d] px-4 text-sm font-semibold text-[#23150a] hover:bg-[#ffd39c] disabled:cursor-not-allowed disabled:bg-[#33473e] disabled:text-[#b8ab99]"
            disabled={saveState.status === "saving"}
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
                  ? "border-[#f0a6a0]/35 bg-[#f0a6a0]/10 text-[#ffd2cf]"
                  : "border-[#bfe8d0]/25 bg-[#bfe8d0]/10 text-[#d7f7df]"
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
