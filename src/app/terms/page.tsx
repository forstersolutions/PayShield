import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/app/components/site-footer";
import {
  GRAYSTON_COMPANY_NAME,
  GRAYSTON_SUPPORT_EMAIL,
  PAYSHIELD_OWNERSHIP_LINE,
  REGULATED_PARTNER_DISCLOSURE,
} from "@/app/lib/brand";

export const metadata: Metadata = {
  title: "Terms | PayShield",
  description:
    "Terms for using PayShield by Grayston Technologies.",
};

const lastUpdated = "June 12, 2026";

export default function TermsPage() {
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
            Terms
          </h1>
          <p className="mt-3 text-sm text-[#aab3c2]">
            Last updated: {lastUpdated}
          </p>

          <div className="mt-8 grid gap-8 text-base leading-7 text-[#c9d0da]">
            <section>
              <h2 className="text-xl font-semibold text-white">
                Product controls
              </h2>
              <p className="mt-3">
                {PAYSHIELD_OWNERSHIP_LINE} PayShield provides paycheck control
                software for modeling protected buckets, bill rules,
                safe-to-spend decisions, and recovery plans. Product and support
                requests route to {GRAYSTON_SUPPORT_EMAIL}.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white">
                Provider-enabled services
              </h2>
              <p className="mt-3">
                {REGULATED_PARTNER_DISCLOSURE} PayShield and{" "}
                {GRAYSTON_COMPANY_NAME} do not activate account, card, transfer,
                or bill-payment workflows before those controls are in place.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white">
                No financial advice
              </h2>
              <p className="mt-3">
                Bucket examples, safe-to-spend calculations, and recovery plans
                are product tools. They are not financial, legal, accounting,
                tax, or credit advice.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white">
                Local data and exports
              </h2>
              <p className="mt-3">
                PayShield may save household profile settings in browser local
                storage and can export a profile file at your request. You are
                responsible for reviewing exported files before sharing them and
                for keeping sensitive information out of free-text fields.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white">
                Acceptable use
              </h2>
              <p className="mt-3">
                Do not misuse the site, interfere with its operation, attempt
                unauthorized access, submit unlawful content, or use automated
                systems to overload the app or its APIs.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white">
                Changes
              </h2>
              <p className="mt-3">
                These terms may be updated as PayShield adds features, partner
                onboarding, or provider-enabled product functionality.
                Continued use of the site after updates means you accept the
                updated terms.
              </p>
            </section>
          </div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
