import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/app/components/site-footer";
import {
  GRAYSTON_COMPANY_NAME,
  GRAYSTON_SUPPORT_EMAIL,
  PAYSHIELD_OWNERSHIP_LINE,
} from "@/app/lib/brand";

export const metadata: Metadata = {
  title: "Privacy Notice | PayShield",
  description: "How PayShield handles personal and financial information.",
};

const lastUpdated = "August 8, 2026";

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
          <p className="brand-kicker">PayShield by Grayston Technologies</p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
            Privacy Notice
          </h1>
          <p className="mt-3 text-sm text-[#aab3c2]">
            Last updated: {lastUpdated}
          </p>

          <div className="mt-8 grid gap-8 text-base leading-7 text-[#c9d0da]">
            <section>
              <h2 className="text-xl font-semibold text-white">Scope</h2>
              <p className="mt-3">
                {PAYSHIELD_OWNERSHIP_LINE} This notice covers the PayShield
                website, account, membership, money controls, communications,
                and support services.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white">
                Information we collect
              </h2>
              <p className="mt-3">
                We collect account information such as your name, email
                address, authentication identifiers, household settings, and
                support communications. Identity-verification providers may
                collect information needed to verify eligibility and return
                verification status and provider references to PayShield.
              </p>
              <p className="mt-3">
                When you use money controls, we process linked-account
                references, transaction activity, paycheck-recognition rules,
                direct-deposit status, protected bucket settings, approved
                destinations, bill instructions, transfers, card decisions,
                unlock and recovery records, balances, and audit history. We
                also process membership and billing status from our payment
                provider. PayShield does not store full payment-card numbers,
                online-banking passwords, or identity documents in the web
                application.
              </p>
              <p className="mt-3">
                We receive device, browser, IP address, request, performance,
                security, and diagnostic data needed to operate and protect the
                service. Product analytics exclude names, email addresses,
                account and routing numbers, card numbers, government
                identifiers, and free-text financial notes.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white">
                How we use information
              </h2>
              <p className="mt-3">
                We use information to authenticate users, verify identity,
                connect accounts, recognize deposits, maintain ledger balances,
                enforce bucket and card rules, execute authorized instructions,
                manage subscriptions, prevent fraud, reconcile provider events,
                resolve disputes, provide support, meet legal obligations, and
                improve reliability.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white">
                When information is shared
              </h2>
              <p className="mt-3">
                We share information only as needed with service providers that
                support authentication, payment processing, bank connectivity,
                identity verification, account and card services, cloud
                hosting, security, analytics, communications, and customer
                support. We may also disclose information to comply with law,
                protect users and the service, complete a business transaction,
                or act on your direction. We do not sell personal information.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white">
                Storage, retention, and security
              </h2>
              <p className="mt-3">
                PayShield separates the public web application from the core
                ledger and provider services. Sensitive provider credentials
                are kept in server-side custody, data is encrypted in transit,
                and money events are recorded with audit and reconciliation
                controls. We retain records for as long as needed to provide
                the service, meet financial and legal obligations, resolve
                disputes, prevent abuse, and enforce agreements. No security
                system can eliminate every risk.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white">
                Your choices and rights
              </h2>
              <p className="mt-3">
                You may update account settings in PayShield, manage membership
                billing through the App Store or Google Play, request disconnection
                of eligible linked accounts, and request access, correction, or deletion where
                applicable. Some financial, security, compliance, and dispute
                records must be retained. To make a privacy request, email{" "}
                <a
                  className="text-[#39e8ff] hover:text-[#9bf4ff]"
                  href={`mailto:${GRAYSTON_SUPPORT_EMAIL}`}
                >
                  {GRAYSTON_SUPPORT_EMAIL}
                </a>
                . We may verify your identity before completing a request.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white">
                Children and updates
              </h2>
              <p className="mt-3">
                PayShield is not intended for children under 18. We may update
                this notice as the service or legal requirements change. We
                will post the current version here and provide additional
                notice when required.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-white">Contact</h2>
              <p className="mt-3">
                Privacy questions may be sent to {GRAYSTON_COMPANY_NAME} at{" "}
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
