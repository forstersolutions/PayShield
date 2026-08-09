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
import { useEffect, useState } from "react";
import type { BucketBalance, BucketProtection } from "@/app/lib/neobank/types.ts";

type BucketControl = {
  availableCents: number;
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

type ProfilePersistence =
  | "app_session_model"
  | "core_service_model"
  | "durable_core"
  | "stateless_model";

type BucketProfileResponse = {
  buckets?: BucketBalance[] | BucketControl[];
  error?: string;
  message?: string;
  persisted?: boolean;
  profilePersistence?: ProfilePersistence;
  profileSource?: "app_session_model" | "app_template_model" | "core_control_model";
};

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

function controlsFromBuckets(buckets: BucketBalance[]): BucketControl[] {
  return buckets
    .filter((bucket) => bucket.id !== "safe_spending")
    .sort((a, b) => a.priority - b.priority)
    .map((bucket) => ({
      availableCents: bucket.availableCents ?? 0,
      due: bucket.due,
      id: bucket.id,
      name: bucket.name,
      priority: bucket.priority,
      protection: bucket.protection,
      targetCents: bucket.targetCents,
    }));
}

function normalizePriorities(controls: BucketControl[]) {
  return controls.map((control, index) => ({
    ...control,
    priority: (index + 1) * 10,
  }));
}

export function BucketControlPanel({
  buckets,
  onSaved,
}: {
  buckets: BucketBalance[];
  onSaved?: () => Promise<void> | void;
}) {
  const [defaults] = useState(() => controlsFromBuckets(buckets));
  const [controls, setControls] = useState<BucketControl[]>(defaults);
  const [activeBucketId, setActiveBucketId] = useState(defaults[0]?.id ?? "");
  const [draftDirty, setDraftDirty] = useState(false);
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
          setSaveState({
            message:
              result.error ??
              "Your saved buckets could not be loaded. Try again before making changes.",
            status: "error",
          });
          return;
        }

        const loadedControls = controlsFromBuckets(result.buckets as BucketBalance[]);
        setControls(loadedControls);
        setActiveBucketId((current) =>
          loadedControls.some((control) => control.id === current)
            ? current
            : loadedControls[0]?.id ?? "",
        );
        setProfilePersisted(result.persisted === true);
        setDraftDirty(false);

        setSaveState({
          message: "Your bucket rules are ready.",
          status: result.persisted === true ? "saved" : "drafted",
        });
      } catch {
        if (cancelled) {
          return;
        }

        setSaveState({
          message:
            "Your saved buckets could not be loaded. Try again before making changes.",
          status: "error",
        });
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [defaults]);

  const protectedCents = controls.reduce(
    (total, control) => total + control.targetCents,
    0,
  );
  const activeRuleCount = controls.filter((control) => control.targetCents > 0).length;
  const nextProtected = controls.find((control) => control.targetCents > 0);
  const activeControl = controls.find((control) => control.id === activeBucketId) ?? controls[0];
  const activeIndex = activeControl
    ? controls.findIndex((control) => control.id === activeControl.id)
    : -1;

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
          availableCents: 0,
          due: "Every check",
          id,
          name: "New protected bucket",
          priority: 99,
          protection: "hard_lock",
          targetCents: 10_000,
        },
      ]),
    );
    setActiveBucketId(id);
    setDraftDirty(true);
    setSaveState({ message: "", status: "idle" });
  }

  function removeBucket(id: string) {
    const bucket = controls.find((control) => control.id === id);

    if (controls.length <= 1 || (bucket?.availableCents ?? 0) > 0) {
      return;
    }

    if (activeBucketId === id) {
      setActiveBucketId(controls.find((control) => control.id !== id)?.id ?? "");
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
      setProfilePersisted(result.persisted === true);

      if (result.persisted === true) {
        setDraftDirty(false);
      } else {
        setDraftDirty(true);
      }

      setSaveState({
        message:
          result.message ??
          (result.persisted === true
            ? "Bucket rules saved."
            : "Bucket changes remain open in this tab but were not saved."),
        status: result.persisted === true ? "saved" : "drafted",
      });

      if (result.persisted === true) {
        await onSaved?.();
      }
    } catch {
      setSaveState({
        message:
          "We could not save right now. Your changes remain open in this tab.",
        status: "error",
      });
      setDraftDirty(true);
    }
  }

  return (
    <section className="money-control-panel" id="bucket-studio">
      <div className="money-allocation-strip">
        <div><small>Protected each paycheck</small><strong>{formatMoney(protectedCents)}</strong></div>
        <div><small>Active rules</small><strong>{activeRuleCount}</strong></div>
        <div><small>Funds first</small><strong>{nextProtected?.name ?? "Not set"}</strong></div>
      </div>

      <p className="money-inline-alert" data-tone={activeRuleCount ? "ready" : "warning"}>
        <CheckCircle2 className="size-4" aria-hidden="true" />
        {activeRuleCount
          ? `${nextProtected?.name ?? "Protected buckets"} funds first. Safe to Spend gets whatever remains.`
          : "Add an amount to at least one bucket before saving your protection rules."}
      </p>

      <div className="money-bucket-workspace">
        <aside className="money-bucket-list">
          <div className="money-panel-heading">
            <div>
              <p className="pay-eyebrow">Funding order</p>
              <h2>Your protection rules</h2>
            </div>
            <button className="money-add-button" onClick={addBucket} type="button">
              <Plus className="size-4" aria-hidden="true" /> Add bucket
            </button>
          </div>

          <div className="money-priority-list" aria-label="Bucket priority list">
            {controls.map((control, index) => {
              const selected = activeControl?.id === control.id;
              const protectionLabel = protectionOptions.find(
                (option) => option.value === control.protection,
              )?.label ?? "Protected";

              return (
                <button
                  aria-pressed={selected}
                  className="money-priority-row"
                  data-selected={selected}
                  key={control.id}
                  onClick={() => setActiveBucketId(control.id)}
                  type="button"
                >
                  <span className="money-priority-number">{index + 1}</span>
                  <span className="money-priority-icon">
                    {control.protection === "bill_only" ? (
                      <CircleDollarSign className="size-4" aria-hidden="true" />
                    ) : (
                      <LockKeyhole className="size-4" aria-hidden="true" />
                    )}
                  </span>
                  <span className="money-priority-copy">
                    <strong>{control.name}</strong>
                    <small>{protectionLabel} - {control.due}</small>
                  </span>
                  <strong className="money-priority-amount">{formatMoney(control.targetCents)}</strong>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="money-bucket-editor">
          {activeControl ? (
            <>
              <div className="money-panel-heading">
                <div>
                  <p className="pay-eyebrow">Editing bucket</p>
                  <h2>{activeControl.name}</h2>
                  <p>Changes update your funding order immediately.</p>
                </div>
                <div className="money-editor-actions">
                  <button aria-label={`Move ${activeControl.name} earlier`} disabled={activeIndex <= 0} onClick={() => moveControl(activeControl.id, -1)} title="Move earlier" type="button">
                    <ChevronUp className="size-4" aria-hidden="true" />
                  </button>
                  <button aria-label={`Move ${activeControl.name} later`} disabled={activeIndex === controls.length - 1} onClick={() => moveControl(activeControl.id, 1)} title="Move later" type="button">
                    <ChevronDown className="size-4" aria-hidden="true" />
                  </button>
                  <button
                    aria-label={`Remove ${activeControl.name}`}
                    data-danger="true"
                    disabled={
                      controls.length <= 1 || activeControl.availableCents > 0
                    }
                    onClick={() => removeBucket(activeControl.id)}
                    title={
                      activeControl.availableCents > 0
                        ? "Move this bucket's money before removing it"
                        : controls.length <= 1
                          ? "Keep at least one protected bucket"
                          : "Remove bucket"
                    }
                    type="button"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="money-editor-form">
                <label>
                  Bucket name
                  <input maxLength={60} onChange={(event) => updateControl(activeControl.id, { name: event.target.value })} value={activeControl.name} />
                </label>
                <label>
                  Amount from each paycheck
                  <span className="money-input-prefix"><CircleDollarSign className="size-4" /><input min={0} onChange={(event) => updateControl(activeControl.id, { targetCents: dollarsToCents(event.target.value) })} step={25} type="number" value={activeControl.targetCents / 100} /></span>
                </label>
                <label>
                  Protection
                  <select onChange={(event) => updateControl(activeControl.id, { protection: event.target.value as BucketProtection })} value={activeControl.protection}>
                    {protectionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label>
                  Due
                  <input maxLength={40} onChange={(event) => updateControl(activeControl.id, { due: event.target.value })} value={activeControl.due} />
                </label>
              </div>

              <div className="money-protection-help">
                <Settings2 className="size-5" aria-hidden="true" />
                <div>
                  <strong>{protectionOptions.find((option) => option.value === activeControl.protection)?.label}</strong>
                  <p>
                    {activeControl.protection === "bill_only"
                      ? "Only approved billers assigned to this bucket can use the money."
                      : activeControl.protection === "emergency"
                        ? "The money stays protected until you start an emergency unlock."
                        : activeControl.protection === "soft_lock"
                          ? "The money stays protected but can be released with a recovery plan."
                          : "The money stays protected from everyday spending."}
                  </p>
                </div>
              </div>
            </>
          ) : null}

          <div className="money-save-row">
            <span>{profilePersisted && !draftDirty ? "Saved to your account" : draftDirty ? "Unsaved changes" : "Ready"}</span>
            <button disabled={saveState.status === "saving" || saveState.status === "loading"} onClick={saveProfile} type="button">
              {saveState.status === "saved" ? <CheckCircle2 className="size-4" /> : <Save className="size-4" />}
              Save changes
            </button>
          </div>

          {saveState.message ? (
            <p className="money-save-message" data-state={saveState.status} role={saveState.status === "error" ? "alert" : "status"}>
              {saveState.message}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
