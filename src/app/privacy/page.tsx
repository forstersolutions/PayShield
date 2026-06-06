import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/app/components/site-footer";

export const metadata: Metadata = {
  title: "Privacy Notice | PayShield",
  description:
    "How PayShield handles information for its paycheck planning app.",
};

const lastUpdated = "June 6, 2026";

export default function PrivacyPage() {
  return (
    <main className="bg-[#17130f] text-[#f9efe1]">
      <section className="mx-auto min-h-screen max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <Link
          className="text-sm font-semibold text-[#b8e7c5] hover:text-[#cff1d7]"
          href="/"
        >
          Back to PayShield
        </Link>

        <div className="mt-8 rounded-[8px] border border-[#3a3027] bg-[#211b16] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.26)] ring-1 ring-[#b8e7c5]/10 sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#b8e7c5]">
            PayShield planning app
          </p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
            Privacy Notice
          </h1>
          <p className="mt-3 text-sm text-[#b7aa9b]">
            Last updated: {lastUpdated}
          </p>

          <div className="mt-8 grid gap-8 text-base leading-7 text-[#d6c8b8]">
            <section>
              <h2 className="text-xl font-semibold text-[#fff4e8]">
                What this notice covers
              </h2>
              <p className="mt-3">
                PayShield is a private paycheck planning app. The planner can
                be used without creating an account or submitting a contact
                form. PayShield does not currently open deposit accounts, move
                money, issue cards, or collect bank credentials through this
                website.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#fff4e8]">
                Information we collect
              </h2>
              <p className="mt-3">
                Planner inputs such as paycheck amounts, bucket targets,
                purchase checks, and recovery settings are saved in your
                browser local storage so the plan can remain available on the
                same device. The website may also process basic technical
                information such as IP address, browser metadata, timestamps,
                performance data, and anti-abuse signals. Campaign links may add
                allowlisted attribution fields such as utm_source, utm_medium,
                utm_campaign, utm_content, utm_term, and the landing path
                without query parameters.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#fff4e8]">
                How we use information
              </h2>
              <p className="mt-3">
                We use technical and performance information to operate,
                secure, debug, and improve the app. Vercel Web Analytics and
                Speed Insights may process non-PII event, campaign, and
                performance metadata so PayShield can measure page experience
                and product usage patterns.
              </p>
              <p className="mt-3">
                PayShield does not send email addresses, names, bank details,
                card details, Social Security numbers, or free-text financial
                notes to analytics events.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#fff4e8]">
                Sharing and storage
              </h2>
              <p className="mt-3">
                Planner inputs remain in your browser unless you choose to
                export or share them. We do not sell personal information. Do
                not enter bank account numbers, Social Security numbers, card
                numbers, routing numbers, passwords, or other sensitive
                financial credentials into free-text fields or exported files.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#fff4e8]">
                Your choices
              </h2>
              <p className="mt-3">
                You can clear saved planner data by using your browser’s site
                data controls for PayShield. You can also choose not to export a
                plan or to delete exported files from your own device.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#fff4e8]">
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
