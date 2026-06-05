import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/app/components/site-footer";

export const metadata: Metadata = {
  title: "Terms | PayShield",
  description:
    "Terms for using the PayShield protected paycheck prototype and pilot request form.",
};

const lastUpdated = "June 5, 2026";

export default function TermsPage() {
  return (
    <main className="bg-[#070807] text-[#f4f1e8]">
      <section className="mx-auto min-h-screen max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <Link
          className="text-sm font-semibold text-emerald-300 hover:text-emerald-200"
          href="/"
        >
          Back to PayShield
        </Link>

        <div className="mt-8 rounded-[8px] border border-white/10 bg-[#101410] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.38)] sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-300">
            PayShield prototype
          </p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
            Terms
          </h1>
          <p className="mt-3 text-sm text-[#9c9588]">
            Last updated: {lastUpdated}
          </p>

          <div className="mt-8 grid gap-8 text-base leading-7 text-[#c8c0af]">
            <section>
              <h2 className="text-xl font-semibold text-[#f4f1e8]">
                Prototype only
              </h2>
              <p className="mt-3">
                PayShield is currently a product prototype and pilot request
                website. It does not provide banking, deposit, payment, debit
                card, bill-pay, or money movement services through this site.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#f4f1e8]">
                No bank or insurance claim
              </h2>
              <p className="mt-3">
                PayShield is not a bank. The prototype does not represent that
                funds are held, insured, protected by FDIC insurance, or
                eligible for pass-through deposit insurance. Any future banking
                services would require approved partner-bank and compliance
                disclosures before launch.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#f4f1e8]">
                No financial advice
              </h2>
              <p className="mt-3">
                The demo, pricing, bucket examples, and safe-to-spend
                calculations are illustrative. They are not financial, legal,
                accounting, tax, or credit advice.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#f4f1e8]">
                Pilot requests
              </h2>
              <p className="mt-3">
                Submitting a pilot request does not guarantee access,
                availability, pricing, account approval, or future service
                terms. Do not submit sensitive financial information through the
                pilot form.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#f4f1e8]">
                Acceptable use
              </h2>
              <p className="mt-3">
                Do not misuse the site, interfere with its operation, attempt
                unauthorized access, submit unlawful content, or use automated
                systems to overload the pilot request endpoint.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#f4f1e8]">
                Changes
              </h2>
              <p className="mt-3">
                These terms may be updated as PayShield moves from prototype to
                pilot, partner onboarding, or regulated financial service
                launch. Continued use of the site after updates means you accept
                the updated terms for the prototype site.
              </p>
            </section>
          </div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
