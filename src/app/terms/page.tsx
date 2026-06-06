import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/app/components/site-footer";

export const metadata: Metadata = {
  title: "Terms | PayShield",
  description:
    "Terms for using the PayShield paycheck planning app.",
};

const lastUpdated = "June 6, 2026";

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
            PayShield planning app
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
                PayShield is a paycheck planning app for modeling bills,
                reserves, safe-to-spend decisions, and recovery plans. It does
                not provide banking, deposit, payment, debit card, bill-pay, or
                money movement services through this site.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#fff4e8]">
                No bank or insurance claim
              </h2>
              <p className="mt-3">
                PayShield is not a bank. The planning app does not represent
                that funds are held, insured, protected by FDIC insurance, or
                eligible for pass-through deposit insurance. Any future banking
                services would require approved partner-bank and compliance
                disclosures before launch.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#fff4e8]">
                No financial advice
              </h2>
              <p className="mt-3">
                Bucket examples and safe-to-spend calculations are planning
                tools. They are not financial, legal, accounting, tax, or credit
                advice.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#fff4e8]">
                Local data and exports
              </h2>
              <p className="mt-3">
                PayShield saves planner settings in browser local storage and
                can export a plan file at your request. You are responsible for
                reviewing exported files before sharing them and for keeping
                sensitive information out of free-text fields.
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
