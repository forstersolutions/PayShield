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
            PayShield by Grayston Technologies
          </p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
            Terms
          </h1>
          <p className="mt-3 text-sm text-[#b7aa9b]">
            Last updated: {lastUpdated}
          </p>

          <div className="mt-8 grid gap-8 text-base leading-7 text-[#d6c8b8]">
            <section>
              <h2 className="text-xl font-semibold text-[#fff4e8]">
                Planning product
              </h2>
              <p className="mt-3">
                {PAYSHIELD_OWNERSHIP_LINE} PayShield provides paycheck control
                software for modeling protected buckets, bill rules,
                safe-to-spend decisions, and recovery plans. Product and support
                requests route to {GRAYSTON_SUPPORT_EMAIL}.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#fff4e8]">
                Regulated partner services
              </h2>
              <p className="mt-3">
                {REGULATED_PARTNER_DISCLOSURE} PayShield and{" "}
                {GRAYSTON_COMPANY_NAME} do not represent through this site that
                funds are held, insured, or eligible for deposit insurance.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#fff4e8]">
                No financial advice
              </h2>
              <p className="mt-3">
                Bucket examples, safe-to-spend calculations, and recovery plans
                are product tools. They are not financial, legal, accounting,
                tax, or credit advice.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#fff4e8]">
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
              <h2 className="text-xl font-semibold text-[#fff4e8]">
                Acceptable use
              </h2>
              <p className="mt-3">
                Do not misuse the site, interfere with its operation, attempt
                unauthorized access, submit unlawful content, or use automated
                systems to overload the app or its APIs.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#fff4e8]">
                Changes
              </h2>
              <p className="mt-3">
                These terms may be updated as PayShield adds features, partner
                onboarding, or regulated financial-service functionality.
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
