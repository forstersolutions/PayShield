import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/app/components/site-footer";

export const metadata: Metadata = {
  title: "Terms | PayShield",
  description:
    "Terms for using the PayShield paycheck planning MVP and early access form.",
};

const lastUpdated = "June 5, 2026";

export default function TermsPage() {
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
            Terms
          </h1>
          <p className="mt-3 text-sm text-[#9ca3af]">
            Last updated: {lastUpdated}
          </p>

          <div className="mt-8 grid gap-8 text-base leading-7 text-[#d4d9e2]">
            <section>
              <h2 className="text-xl font-semibold text-[#fff8eb]">
                Manual planning MVP
              </h2>
              <p className="mt-3">
                PayShield is currently a manual planning app and early access
                website. It does not provide banking, deposit, payment, debit
                card, bill-pay, or money movement services through this site.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#fff8eb]">
                No bank or insurance claim
              </h2>
              <p className="mt-3">
                PayShield is not a bank. The MVP does not represent that
                funds are held, insured, protected by FDIC insurance, or
                eligible for pass-through deposit insurance. Any future banking
                services would require approved partner-bank and compliance
                disclosures before launch.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#fff8eb]">
                No financial advice
              </h2>
              <p className="mt-3">
                The demo, pricing, bucket examples, and safe-to-spend
                calculations are illustrative. They are not financial, legal,
                accounting, tax, or credit advice.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#fff8eb]">
                Early access requests
              </h2>
              <p className="mt-3">
                Submitting an early access request does not guarantee access,
                availability, pricing, account approval, or future service
                terms. Do not submit sensitive financial information through the
                early access form.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#fff8eb]">
                Acceptable use
              </h2>
              <p className="mt-3">
                Do not misuse the site, interfere with its operation, attempt
                unauthorized access, submit unlawful content, or use automated
                systems to overload the early access endpoint.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-[#fff8eb]">
                Changes
              </h2>
              <p className="mt-3">
                These terms may be updated as PayShield moves from MVP to
                broader release, partner onboarding, or regulated financial service
                launch. Continued use of the site after updates means you accept
                the updated terms for the early access site.
              </p>
            </section>
          </div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
