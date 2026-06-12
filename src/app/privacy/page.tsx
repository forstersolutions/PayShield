import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/app/components/site-footer";
import {
  GRAYSTON_COMPANY_NAME,
  REGULATED_PARTNER_DISCLOSURE,
} from "@/app/lib/brand";

export const metadata: Metadata = {
  title: "Privacy Notice | PayShield",
  description:
    "How PayShield by Grayston Technologies handles product and support information.",
};

const lastUpdated = "June 12, 2026";

export default function PrivacyPage() {
  return (
    <main className="bg-[#050607] text-[#f7f8fb]">
      <section className="mx-auto min-h-screen max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <Link
          className="text-sm font-semibold text-[#39e8ff] hover:text-[#9bf4ff]"
          href="/"
        >
          Back to PayShield
        </Link>

        <div className="brand-panel mt-8 rounded-[8px] p-6 sm:p-8">
          <p className="brand-kicker">
            PayShield by Grayston Technologies
          </p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
            Privacy Notice
          </h1>
          <p className="mt-3 text-sm text-[#aab3c2]">
            Last updated: {lastUpdated}
          </p>

          <div className="mt-8 grid gap-8 text-base leading-7 text-[#c9d0da]">
            <section>
              <h2 className="text-xl font-semibold text-white">
                What this notice covers
              </h2>
              <p className="mt-3">
                PayShield is operated by Grayston Technologies. This notice
                covers the product website, household profile tools, support
                requests, analytics, and private beta onboarding.{" "}
                {REGULATED_PARTNER_DISCLOSURE}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white">
                Information we collect
              </h2>
              <p className="mt-3">
                Profile inputs such as paycheck amounts, bucket targets,
                protection modes, due rules, purchase checks, and recovery
                settings may be saved in browser local storage so the household
                rules remain available on the same device. The website may also
                process basic technical information such as IP address, browser
                metadata, timestamps, performance data, and anti-abuse signals.
                Campaign links may add allowlisted attribution fields such as
                utm_source, utm_medium, utm_campaign, utm_content, utm_term, and
                the landing path without query parameters.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white">
                How we use information
              </h2>
              <p className="mt-3">
                We use technical and performance information to operate,
                secure, debug, and improve the app. Vercel Web Analytics and
                Speed Insights may process non-PII event, campaign, and
                performance metadata so PayShield can measure page experience
                and product usage patterns. Product and support requests route
                to support@graystontechnologies.com.
              </p>
              <p className="mt-3">
                PayShield does not send email addresses, names, bank details,
                card details, Social Security numbers, or free-text financial
                notes to analytics events. {GRAYSTON_COMPANY_NAME} applies the
                same boundary to PayShield product analytics.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white">
                Sharing and storage
              </h2>
              <p className="mt-3">
                Household profile inputs remain in your browser unless you
                submit a product/support request, save through an authenticated
                app workflow, export them, or share them. We do not sell
                personal information. Do not enter bank account numbers, Social
                Security numbers, card numbers, routing numbers, passwords, or
                other sensitive financial credentials into free-text fields or
                exported files.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white">
                Your choices
              </h2>
              <p className="mt-3">
                You can clear saved profile data by using your browser’s site
                data controls for PayShield. Product and support questions can
                be sent to support@graystontechnologies.com.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white">
                Provider-enabled controls
              </h2>
              <p className="mt-3">
                If provider-enabled account, card, or payment controls are
                activated, additional privacy, compliance, consent, support, and
                product notices will be shown before activation.
              </p>
            </section>
          </div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
