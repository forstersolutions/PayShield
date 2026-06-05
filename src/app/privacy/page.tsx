import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/app/components/site-footer";

export const metadata: Metadata = {
  title: "Privacy Notice | PayShield",
  description:
    "How PayShield handles early access information for its paycheck planning MVP.",
};

const lastUpdated = "June 5, 2026";

export default function PrivacyPage() {
  return (
    <main className="bg-[#05070a] text-[#f8f1e4]">
      <section className="mx-auto min-h-screen max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <Link
          className="text-sm font-semibold text-[#7cf8d4] hover:text-[#a5ffe7]"
          href="/"
        >
          Back to PayShield
        </Link>

        <div className="mt-8 rounded-[8px] border border-white/10 bg-[#080c12] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.42)] ring-1 ring-[#7cf8d4]/10 sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#7cf8d4]">
            PayShield MVP
          </p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
            Privacy Notice
          </h1>
          <p className="mt-3 text-sm text-[#9ca3af]">
            Last updated: {lastUpdated}
          </p>

          <div className="mt-8 grid gap-8 text-base leading-7 text-[#d4d9e2]">
            <section>
              <h2 className="text-xl font-semibold text-[#fff8eb]">
                What this notice covers
              </h2>
              <p className="mt-3">
                PayShield is currently a manual planning MVP and early access
                list. This notice explains how early access request information is handled.
                PayShield does not currently open deposit accounts, move money,
                issue cards, or collect bank credentials through this website.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#fff8eb]">
                Information we collect
              </h2>
              <p className="mt-3">
                The early access form may collect your email address, name, segment,
                and optional notes about what you want PayShield to protect. The
                website may also process basic technical information such as IP
                address, browser metadata, timestamps, and anti-abuse signals.
                Campaign links may add allowlisted attribution fields such as
                utm_source, utm_medium, utm_campaign, utm_content, utm_term, and
                the landing path without query parameters.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#fff8eb]">
                How we use information
              </h2>
              <p className="mt-3">
                We use early access request information to respond to inquiries,
                prioritize product research, evaluate market demand, improve the
                MVP, and prepare customer discovery. Vercel Web
                Analytics and Speed Insights may process non-PII event,
                campaign, and performance metadata so the MVP can measure
                conversion and page experience.
              </p>
              <p className="mt-3">
                PayShield does not send email addresses, names, bank details,
                card details, Social Security numbers, or free-text access notes
                to analytics events.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#fff8eb]">
                Sharing and storage
              </h2>
              <p className="mt-3">
                Early access requests may be forwarded to configured tools such as a
                CRM, Airtable, Slack, Make, Zapier, or another internal webhook.
                That forwarded request may include sanitized campaign
                attribution so campaign performance can be matched to the lead.
                We do not sell early access request information. Do not submit bank
                account numbers, Social Security numbers, card numbers, or other
                sensitive financial information through the early access form.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#fff8eb]">
                Your choices
              </h2>
              <p className="mt-3">
                You can choose not to submit the early access form. If you submitted a
                request and want it deleted or corrected, submit another early access
                request with that instruction so it can be matched to your
                email address.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#fff8eb]">
                Future financial services
              </h2>
              <p className="mt-3">
                If PayShield later offers regulated financial services, account
                opening, KYC, banking, payment, card, or bill-pay functionality,
                additional privacy, compliance, consent, and partner-bank
                notices will be required before those services launch.
              </p>
            </section>
          </div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
