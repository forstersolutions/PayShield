import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/app/components/site-footer";

export const metadata: Metadata = {
  title: "Privacy Notice | PayShield",
  description:
    "How PayShield handles pilot request information for its protected paycheck prototype.",
};

const lastUpdated = "June 5, 2026";

export default function PrivacyPage() {
  return (
    <main className="bg-[#f7f5ef] text-stone-950">
      <section className="mx-auto min-h-screen max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <Link
          className="text-sm font-semibold text-teal-800 hover:text-teal-950"
          href="/"
        >
          Back to PayShield
        </Link>

        <div className="mt-8 rounded-[8px] border border-stone-300 bg-white p-6 shadow-[0_20px_70px_rgba(28,25,23,0.08)] sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-800">
            PayShield prototype
          </p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
            Privacy Notice
          </h1>
          <p className="mt-3 text-sm text-stone-500">
            Last updated: {lastUpdated}
          </p>

          <div className="mt-8 grid gap-8 text-base leading-7 text-stone-700">
            <section>
              <h2 className="text-xl font-semibold text-stone-950">
                What this notice covers
              </h2>
              <p className="mt-3">
                PayShield is currently a market prototype and pilot waitlist.
                This notice explains how pilot request information is handled.
                PayShield does not currently open deposit accounts, move money,
                issue cards, or collect bank credentials through this website.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-stone-950">
                Information we collect
              </h2>
              <p className="mt-3">
                The pilot form may collect your email address, name, segment,
                and optional notes about what you want PayShield to protect. The
                website may also process basic technical information such as IP
                address, browser metadata, timestamps, and anti-abuse signals.
                Campaign links may add allowlisted attribution fields such as
                utm_source, utm_medium, utm_campaign, utm_content, utm_term, and
                the landing path without query parameters.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-stone-950">
                How we use information
              </h2>
              <p className="mt-3">
                We use pilot request information to respond to inquiries,
                prioritize product research, evaluate market demand, improve the
                prototype, and prepare partner or customer discovery. Vercel Web
                Analytics and Speed Insights may process non-PII event,
                campaign, and performance metadata so the prototype can measure
                conversion and page experience.
              </p>
              <p className="mt-3">
                PayShield does not send email addresses, names, bank details,
                card details, Social Security numbers, or free-text pilot notes
                to analytics events.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-stone-950">
                Sharing and storage
              </h2>
              <p className="mt-3">
                Pilot requests may be forwarded to configured tools such as a
                CRM, Airtable, Slack, Make, Zapier, or another internal webhook.
                That forwarded pilot request may include sanitized campaign
                attribution so campaign performance can be matched to the lead.
                We do not sell pilot request information. Do not submit bank
                account numbers, Social Security numbers, card numbers, or other
                sensitive financial information through the prototype form.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-stone-950">
                Your choices
              </h2>
              <p className="mt-3">
                You can choose not to submit the pilot form. If you submitted a
                request and want it deleted or corrected, submit another pilot
                request with that instruction so it can be matched to your
                email address.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-stone-950">
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
