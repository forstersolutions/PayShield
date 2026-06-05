"use client";

import { track } from "@vercel/analytics";
import { CheckCircle2, Loader2, Send, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";
import {
  pilotCampaignAnalyticsProperties,
  type CampaignAttribution,
} from "../lib/pilot-analytics.ts";

const segments = [
  "Household",
  "Hourly worker",
  "Gig worker",
  "Military family",
  "Employer",
  "Investor or partner",
];

type FormState =
  | { status: "idle"; message: string }
  | { status: "loading"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

const attributionParamMap = [
  ["utm_source", "utmSource"],
  ["utm_medium", "utmMedium"],
  ["utm_campaign", "utmCampaign"],
  ["utm_content", "utmContent"],
  ["utm_term", "utmTerm"],
] as const;

const emailLikeValue = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/;
const longSensitiveNumber = /\b\d(?:[\s-]?\d){8,}\b/;
const urlLikeValue = /\b(?:https?:\/\/|www\.)/i;

function cleanAttributionValue(value: string, maxLength = 80) {
  const normalized = value.trim().replace(/\s+/g, " ").slice(0, maxLength);

  if (
    !normalized ||
    emailLikeValue.test(normalized) ||
    longSensitiveNumber.test(normalized) ||
    urlLikeValue.test(normalized)
  ) {
    return "";
  }

  return normalized.replace(/[^A-Za-z0-9 .:+/_-]/g, "").trim().slice(0, maxLength);
}

function cleanLandingPath(value: string) {
  const path = value.trim().split(/[?#]/)[0] ?? "";

  if (
    !path.startsWith("/") ||
    emailLikeValue.test(path) ||
    longSensitiveNumber.test(path)
  ) {
    return "";
  }

  return path.replace(/[^A-Za-z0-9/_-]/g, "").slice(0, 120) || "/";
}

function getCampaignAttribution() {
  const attribution: CampaignAttribution = {};

  if (typeof window === "undefined") {
    return attribution;
  }

  const params = new URLSearchParams(window.location.search);

  for (const [paramName, attributionKey] of attributionParamMap) {
    const cleaned = cleanAttributionValue(params.get(paramName) ?? "");

    if (cleaned) {
      attribution[attributionKey] = cleaned;
    }
  }

  const landingPath = cleanLandingPath(window.location.pathname);

  if (landingPath) {
    attribution.landingPath = landingPath;
  }

  return attribution;
}

export function WaitlistForm() {
  const [state, setState] = useState<FormState>({
    status: "idle",
    message: "",
  });

  async function submitPilotRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const segment = String(formData.get("segment") ?? "Unknown");
    const hasMessage = Boolean(String(formData.get("message") ?? "").trim());
    const attribution = getCampaignAttribution();
    const campaignProperties = pilotCampaignAnalyticsProperties(attribution);

    setState({
      status: "loading",
      message: "Submitting pilot request...",
    });

    track("Pilot Request Attempted", {
      segment,
      hasMessage,
      ...campaignProperties,
    });

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: formData.get("email"),
          name: formData.get("name"),
          segment: formData.get("segment"),
          company: formData.get("company"),
          message: formData.get("message"),
          consent: formData.get("consent") === "on",
          attribution,
        }),
      });

      const result = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
        mode?: string;
      };

      if (!response.ok) {
        track("Pilot Request Failed", {
          segment,
          status: response.status,
          ...campaignProperties,
        });
        setState({
          status: "error",
          message: result.error ?? "Unable to submit the request.",
        });
        return;
      }

      form.reset();
      track("Pilot Request Submitted", {
        segment,
        hasMessage,
        mode: String(result.mode ?? "unknown"),
        ...campaignProperties,
      });
      setState({
        status: "success",
        message: result.message ?? "Pilot request received.",
      });
    } catch {
      track("Pilot Request Failed", {
        segment,
        status: "network",
        ...campaignProperties,
      });
      setState({
        status: "error",
        message: "Network error. Try again shortly.",
      });
    }
  }

  return (
    <form
      className="rounded-[8px] border border-white/15 bg-white p-4 text-stone-950 shadow-[0_24px_80px_rgba(0,0,0,0.25)]"
      onSubmit={submitPilotRequest}
    >
      <div className="mb-4">
        <p className="text-sm font-semibold">Request pilot access</p>
        <p className="mt-1 text-sm leading-6 text-stone-600">
          Join the pilot list or start a partner conversation about
          protected-paycheck controls.
        </p>
      </div>

      <div className="grid gap-3">
        <label className="text-sm font-medium text-stone-700">
          Email
          <input
            autoComplete="email"
            className="mt-2 h-11 w-full rounded-[8px] border border-stone-300 bg-white px-3 text-stone-950 outline-none focus:border-teal-700"
            name="email"
            placeholder="you@example.com"
            required
            type="email"
          />
        </label>

        <label className="text-sm font-medium text-stone-700">
          Name
          <input
            autoComplete="name"
            className="mt-2 h-11 w-full rounded-[8px] border border-stone-300 bg-white px-3 text-stone-950 outline-none focus:border-teal-700"
            name="name"
            placeholder="Optional"
            type="text"
          />
        </label>

        <label className="text-sm font-medium text-stone-700">
          Segment
          <select
            className="mt-2 h-11 w-full rounded-[8px] border border-stone-300 bg-white px-3 text-stone-950 outline-none focus:border-teal-700"
            defaultValue="Household"
            name="segment"
          >
            {segments.map((segment) => (
              <option key={segment}>{segment}</option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium text-stone-700">
          What should PayShield protect first?
          <textarea
            className="mt-2 min-h-24 w-full resize-y rounded-[8px] border border-stone-300 bg-white px-3 py-3 text-stone-950 outline-none focus:border-teal-700"
            name="message"
            placeholder="Rent, car note, insurance, kids, tax set-aside..."
          />
          <span className="mt-2 block text-xs leading-5 text-stone-500">
            Do not include bank, card, SSN, account, or routing numbers.
          </span>
        </label>

        <label className="hidden">
          Company
          <input autoComplete="off" name="company" tabIndex={-1} type="text" />
        </label>

        <label className="flex items-start gap-3 rounded-[8px] border border-stone-200 bg-stone-50 p-3 text-sm leading-6 text-stone-700">
          <input
            className="mt-1 size-4 accent-teal-700"
            name="consent"
            required
            type="checkbox"
          />
          <span>
            I agree that PayShield can contact me about the pilot and handle my
            information under the{" "}
            <Link className="font-semibold text-teal-800 underline" href="/privacy">
              Privacy Notice
            </Link>{" "}
            and{" "}
            <Link className="font-semibold text-teal-800 underline" href="/terms">
              Terms
            </Link>
            .
          </span>
        </label>
      </div>

      <button
        className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[8px] bg-stone-950 px-4 font-semibold text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
        disabled={state.status === "loading"}
        type="submit"
      >
        {state.status === "loading" ? (
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        ) : (
          <Send className="size-5" aria-hidden="true" />
        )}
        Request access
      </button>

      {state.status === "success" ? (
        <p
          aria-live="polite"
          className="mt-4 flex items-start gap-2 rounded-[8px] border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-900"
          role="status"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {state.message}
        </p>
      ) : null}

      {state.status === "error" ? (
        <p
          aria-live="assertive"
          className="mt-4 flex items-start gap-2 rounded-[8px] border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-900"
          role="alert"
        >
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
