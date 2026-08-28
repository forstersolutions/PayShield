import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/app/components/site-footer";
import {
  GRAYSTON_COMPANY_NAME,
  GRAYSTON_SUPPORT_EMAIL,
  PAYSHIELD_OWNERSHIP_LINE,
} from "@/app/lib/brand";

export const metadata: Metadata = {
  title: "Terms | PayShield",
  description: "Terms for using PayShield by Grayston Technologies.",
};

const lastUpdated = "August 8, 2026";

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
          <p className="brand-kicker">PayShield by Grayston Technologies</p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
            Terms of Use
          </h1>
          <p className="mt-3 text-sm text-[#aab3c2]">
            Last updated: {lastUpdated}
          </p>

          <div className="mt-8 grid gap-8 text-base leading-7 text-[#c9d0da]">
            <section>
              <h2 className="text-xl font-semibold text-white">Agreement</h2>
              <p className="mt-3">
                These terms govern your use of PayShield. By creating an
                account or using the service, you agree to these terms and the
                Privacy Notice. {PAYSHIELD_OWNERSHIP_LINE}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white">
                Eligibility and account security
              </h2>
              <p className="mt-3">
                You must be at least 18 years old, reside in the United States,
                provide accurate information, complete required verification,
                and be legally able to enter this agreement. Keep your sign-in
                credentials and devices secure, and notify us promptly of
                suspected unauthorized access.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white">
                PayShield services
              </h2>
              <p className="mt-3">
                PayShield lets you connect eligible accounts, recognize
                paycheck deposits, assign money to protected buckets, approve
                payment destinations, schedule bills and transfers, control an
                eligible card, review Safe to Spend, and create recovery plans.
                Available services, limits, timing, and eligibility may vary by
                account and provider.
              </p>
              <p className="mt-3">
                You authorize PayShield and its service providers to act on
                instructions submitted through your account. Review amounts,
                destinations, dates, and bucket assignments before confirming a
                transaction. Transactions may be delayed, declined, reversed,
                or restricted for security, legal, provider, balance, or
                operational reasons.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white">
                Membership and billing
              </h2>
              <p className="mt-3">
                Paid memberships renew automatically at the price and interval
                shown at checkout until canceled. You authorize the payment
                provider to charge your selected payment method. You can manage
                or cancel billing through the App Store or Google Play account
                used to subscribe. Unless
                required by law or stated at checkout, fees already charged are
                nonrefundable.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white">
                Errors, disputes, and support
              </h2>
              <p className="mt-3">
                Review your activity and report suspected errors or
                unauthorized transactions promptly. Different deadlines and
                procedures may apply to particular account, card, or payment
                services. Instructions shown with those services are part of
                these terms. Contact{" "}
                <a
                  className="text-[#39e8ff] hover:text-[#9bf4ff]"
                  href={`mailto:${GRAYSTON_SUPPORT_EMAIL}`}
                >
                  {GRAYSTON_SUPPORT_EMAIL}
                </a>{" "}
                for assistance.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white">
                Acceptable use
              </h2>
              <p className="mt-3">
                Do not use PayShield for unlawful activity, fraud, abuse,
                unauthorized access, money movement for another person,
                interference with service operation, automated overload,
                reverse engineering prohibited by law, or evasion of security,
                identity, account, transaction, or provider controls.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white">
                Service availability and changes
              </h2>
              <p className="mt-3">
                We may maintain, modify, suspend, restrict, or discontinue a
                feature when reasonably necessary for security, reliability,
                provider availability, legal compliance, or product operation.
                We may update these terms and will provide notice when required.
                Continued use after an effective update constitutes acceptance.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white">
                No professional advice
              </h2>
              <p className="mt-3">
                PayShield calculations and controls are tools for carrying out
                your instructions. They are not financial, legal, accounting,
                tax, investment, or credit advice.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white">
                Ownership and termination
              </h2>
              <p className="mt-3">
                PayShield software, branding, and content belong to{" "}
                {GRAYSTON_COMPANY_NAME} or its licensors. We grant you a
                personal, limited, revocable, nontransferable right to use the
                service under these terms. You may stop using PayShield at any
                time. We may restrict or close an account that violates these
                terms or creates legal, security, fraud, or operational risk.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white">
                Disclaimers and liability
              </h2>
              <p className="mt-3">
                To the extent permitted by law, PayShield is provided without
                warranties not expressly stated in these terms. Grayston
                Technologies is not liable for indirect, incidental, special,
                consequential, or punitive damages, or for losses caused by
                events outside its reasonable control. Rights that cannot be
                waived under applicable law remain unaffected.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white">Contact</h2>
              <p className="mt-3">
                Questions about these terms may be sent to{" "}
                <a
                  className="text-[#39e8ff] hover:text-[#9bf4ff]"
                  href={`mailto:${GRAYSTON_SUPPORT_EMAIL}`}
                >
                  {GRAYSTON_SUPPORT_EMAIL}
                </a>
                .
              </p>
            </section>
          </div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
