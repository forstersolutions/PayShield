import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  Check,
  CircleAlert,
  Database,
  Landmark,
  Link2,
  Mail,
  ReceiptText,
  ShieldCheck,
  UserRoundCheck,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  GraystonLogo,
  PayShieldHeaderLogo,
} from "@/app/components/pay-shield-mark";
import { ProductionGateEvidenceRecorder } from "@/app/components/production-gate-evidence-recorder";
import { SiteFooter } from "@/app/components/site-footer";
import {
  GRAYSTON_SUPPORT_EMAIL,
  PAYSHIELD_OWNERSHIP_LINE,
} from "@/app/lib/brand";
import { getCommercialReadiness } from "@/app/lib/commercial/billing.ts";
import { getAppAccessReadiness } from "@/app/lib/neobank/app-access.ts";
import type { AppSession } from "@/app/lib/neobank/auth.ts";
import { forwardCoreRequest } from "@/app/lib/neobank/core-client.ts";
import { createHouseholdActivationPacket } from "@/app/lib/neobank/operations.ts";
import { getOperatorSession } from "@/app/lib/neobank/operator-auth.ts";
import { friendlyGateLabel } from "@/app/lib/readiness-gates.ts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "PayShield Operations",
  description: "Private release and operating status for PayShield.",
  robots: { follow: false, index: false },
};

type Gate = {
  description?: string;
  id: string;
  ok: boolean;
};

type StatusCard = {
  key?: string;
  label?: string;
  state?: string;
};

type ActivationPacket = {
  currentState?: {
    commercialAccess?: { state?: string };
    moneyRails?: {
      bankLinkReady?: boolean;
      paycheckDetectionReady?: boolean;
      transactionSyncReady?: boolean;
    };
    readiness?: {
      gates?: Gate[];
      liveMoneyReady?: boolean;
      postgresSchemaVersion?: string;
    };
    statusCards?: StatusCard[];
  };
  generatedAt?: string;
  operatorRunbook?: { remainingGates?: string[] };
  service?: string;
};

type OperatorLoad = {
  coreConnected: boolean;
  error: string;
  packet: ActivationPacket;
};

type ReleaseStatus = {
  detail: string;
  icon: LucideIcon;
  label: string;
  ok: boolean;
  value: string;
};

function titleCase(value: string | undefined, fallback: string) {
  const clean = value?.replace(/_/g, " ").trim();

  if (!clean) {
    return fallback;
  }

  return clean.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusCardState(cards: StatusCard[], key: string) {
  return cards.find((card) => card.key === key)?.state;
}

function gateReady(gates: Gate[], id: string) {
  return gates.some((gate) => gate.id === id && gate.ok);
}

async function loadOperatorActivation(session: AppSession): Promise<OperatorLoad> {
  const response = await forwardCoreRequest({
    method: "GET",
    path: "/api/app/activation",
    session,
  });

  if (!response) {
    if (session.authMode === "demo") {
      return {
        coreConnected: false,
        error: "",
        packet: createHouseholdActivationPacket(session) as ActivationPacket,
      };
    }

    return {
      coreConnected: false,
      error: "Core service configuration is required.",
      packet: {},
    };
  }

  const payload = (await response.json().catch(() => ({}))) as ActivationPacket & {
    error?: string;
  };

  return {
    coreConnected: response.headers.get("x-payshield-core-proxied") === "true",
    error: response.ok ? "" : payload.error || "Core status could not be loaded.",
    packet: payload,
  };
}

function StatusTile({ status }: { status: ReleaseStatus }) {
  const Icon = status.icon;

  return (
    <article className="rounded-[8px] border border-white/10 bg-black/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-[8px] ${
            status.ok
              ? "bg-[#68f0c2]/12 text-[#7af0c8]"
              : "bg-[#ffb85a]/12 text-[#ffcb86]"
          }`}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <span
          className={`inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-black ${
            status.ok
              ? "bg-[#68f0c2]/12 text-[#9af7d5]"
              : "bg-[#ffb85a]/12 text-[#ffe0b4]"
          }`}
        >
          {status.ok ? "Ready" : "Action needed"}
        </span>
      </div>
      <p className="mt-4 text-sm font-bold text-[#aeb8c6]">{status.label}</p>
      <h2 className="mt-1 text-xl font-black text-white">{status.value}</h2>
      <p className="mt-2 text-sm leading-6 text-[#aeb8c6]">{status.detail}</p>
    </article>
  );
}

export default async function LaunchConsolePage() {
  let session: AppSession;

  try {
    session = await getOperatorSession();
  } catch {
    notFound();
  }

  const [{ coreConnected, error, packet }, appAccess, commercial] =
    await Promise.all([
      loadOperatorActivation(session),
      Promise.resolve(getAppAccessReadiness()),
      Promise.resolve(getCommercialReadiness()),
    ]);
  const current = packet.currentState ?? {};
  const readiness = current.readiness ?? {};
  const moneyRails = current.moneyRails ?? {};
  const gates = readiness.gates ?? [];
  const cards = current.statusCards ?? [];
  const remainingGates = [
    ...new Set(
      packet.operatorRunbook?.remainingGates ??
        gates.filter((gate) => !gate.ok).map((gate) => gate.id),
    ),
  ];
  const statuses: ReleaseStatus[] = [
    {
      detail: "Signed-in households are isolated before account data is loaded.",
      icon: UserRoundCheck,
      label: "Account access",
      ok: !appAccess.locked && gateReady(gates, "clerk_auth"),
      value: !appAccess.locked ? titleCase(appAccess.mode, "Configured") : "Locked",
    },
    {
      detail: "Checkout and signed billing events control household membership.",
      icon: ReceiptText,
      label: "Membership billing",
      ok: commercial.paidAccessReady,
      value: titleCase(
        statusCardState(cards, "paid_access") ?? current.commercialAccess?.state,
        commercial.priceLabel,
      ),
    },
    {
      detail: "Account balances and money events are stored in the immutable ledger.",
      icon: Database,
      label: "Ledger",
      ok: coreConnected && gateReady(gates, "postgres_ledger"),
      value: readiness.postgresSchemaVersion
        ? `Schema ${readiness.postgresSchemaVersion}`
        : "Unavailable",
    },
    {
      detail: "Households can connect an account and keep provider tokens outside the browser.",
      icon: Link2,
      label: "Bank connection",
      ok: moneyRails.bankLinkReady === true,
      value: titleCase(statusCardState(cards, "bank_connection"), "Not connected"),
    },
    {
      detail: "New income can be recognized and assigned through saved paycheck rules.",
      icon: Landmark,
      label: "Paycheck automation",
      ok:
        moneyRails.transactionSyncReady === true &&
        moneyRails.paycheckDetectionReady === true,
      value: titleCase(statusCardState(cards, "paycheck_detection"), "Not active"),
    },
    {
      detail: "Card and transfer decisions enforce Safe to Spend and approved bill rules.",
      icon: WalletCards,
      label: "Money controls",
      ok: readiness.liveMoneyReady === true,
      value: readiness.liveMoneyReady ? "Live" : "Protected",
    },
  ];

  return (
    <main className="min-h-screen bg-[#07090a] text-[#f7f8fb]">
      <div className="mx-auto w-full max-w-7xl px-4 pb-14 pt-4 sm:px-6 lg:px-8">
        <header className="pay-header">
          <Link aria-label="PayShield home" className="pay-header-brand" href="/">
            <PayShieldHeaderLogo priority />
          </Link>
          <nav aria-label="Operator navigation" className="flex items-center gap-2">
            <a
              className="hidden min-h-10 items-center gap-2 rounded-[8px] border border-white/10 px-3 text-sm font-bold text-[#c8d0db] hover:bg-white/[0.06] sm:inline-flex"
              href={`mailto:${GRAYSTON_SUPPORT_EMAIL}`}
            >
              <Mail className="size-4" aria-hidden="true" />
              Support
            </a>
            <Link
              className="brand-button-primary inline-flex min-h-10 items-center gap-2 rounded-[8px] px-4 text-sm font-black"
              href="/app"
            >
              Open app
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </nav>
        </header>

        <section className="accent-rule mt-12 pt-6 sm:mt-16">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="brand-kicker">Private operations</p>
              <h1 className="mt-3 text-4xl font-black leading-tight text-white sm:text-5xl">
                Release status
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[#aeb8c6] sm:text-lg">
                One view of account access, billing, ledger health, connected banks,
                paycheck automation, and money controls.
              </p>
            </div>
            <div
              className={`inline-flex min-h-11 items-center gap-2 rounded-[8px] border px-4 text-sm font-black ${
                coreConnected && !error
                  ? "border-[#68f0c2]/25 bg-[#68f0c2]/10 text-[#9af7d5]"
                  : "border-[#ffb85a]/25 bg-[#ffb85a]/10 text-[#ffe0b4]"
              }`}
            >
              {coreConnected && !error ? (
                <Check className="size-4" aria-hidden="true" />
              ) : (
                <CircleAlert className="size-4" aria-hidden="true" />
              )}
              {coreConnected && !error ? "Core connected" : "Core attention needed"}
            </div>
          </div>
          {error ? (
            <div className="mt-6 rounded-[8px] border border-[#ffb85a]/25 bg-[#ffb85a]/10 p-4 text-sm font-bold text-[#ffe0b4]">
              {error}
            </div>
          ) : null}
        </section>

        <section className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {statuses.map((status) => (
            <StatusTile key={status.label} status={status} />
          ))}
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="brand-panel rounded-[8px] p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="brand-kicker">Release checks</p>
                <h2 className="mt-2 text-2xl font-black text-white">
                  {remainingGates.length
                    ? `${remainingGates.length} items remain`
                    : "All controls are ready"}
                </h2>
              </div>
              <ShieldCheck className="size-6 text-[#57d9bb]" aria-hidden="true" />
            </div>
            <div className="mt-5 grid gap-2">
              {remainingGates.length ? (
                remainingGates.map((gate) => (
                  <div
                    className="flex min-h-11 items-center justify-between gap-4 rounded-[8px] border border-white/10 bg-black/25 px-3 py-2"
                    key={gate}
                  >
                    <span className="text-sm font-bold text-[#e3e7ed]">
                      {friendlyGateLabel(gate)}
                    </span>
                    <span className="shrink-0 text-xs font-black text-[#ffcb86]">
                      Open
                    </span>
                  </div>
                ))
              ) : (
                <div className="flex min-h-12 items-center gap-3 rounded-[8px] border border-[#68f0c2]/20 bg-[#68f0c2]/10 px-4 text-sm font-black text-[#9af7d5]">
                  <Check className="size-4" aria-hidden="true" />
                  No release checks are open.
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4">
            <ProductionGateEvidenceRecorder remainingGates={remainingGates} />
            <div className="brand-panel rounded-[8px] p-5">
              <div className="flex items-center gap-4">
                <div className="flex h-12 items-center rounded-[8px] border border-white/10 bg-black/30 px-3">
                  <GraystonLogo className="h-8 w-auto" />
                </div>
                <div>
                  <p className="text-sm font-black text-white">
                    {PAYSHIELD_OWNERSHIP_LINE}
                  </p>
                  <a
                    className="mt-1 block text-sm font-bold text-[#68d9ee]"
                    href={`mailto:${GRAYSTON_SUPPORT_EMAIL}`}
                  >
                    {GRAYSTON_SUPPORT_EMAIL}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
