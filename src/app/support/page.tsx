import type { Metadata } from "next";
import { ArrowLeft, ExternalLink, LifeBuoy, Mail, Trash2 } from "lucide-react";
import Link from "next/link";

import { SiteFooter } from "@/app/components/site-footer";
import { GRAYSTON_SUPPORT_EMAIL } from "@/app/lib/brand";

export const metadata: Metadata = {
  title: "PayShield Support",
  description: "Account, billing, bank connection, and deletion support for PayShield.",
};

export default function SupportPage() {
  return (
    <main className="bg-[#0d1210] text-[#f7faf8]">
      <section className="mx-auto min-h-screen max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <Link className="inline-flex items-center gap-2 text-sm font-bold text-[#8fe0c0] hover:text-white" href="/">
          <ArrowLeft aria-hidden="true" size={16} />
          Back to PayShield
        </Link>

        <div className="mt-10 border-b border-white/10 pb-8">
          <p className="text-xs font-black uppercase text-[#e5b85d]">Grayston Technologies support</p>
          <h1 className="mt-3 text-4xl font-black leading-tight sm:text-5xl">PayShield Support</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[#b9c5bf]">
            Get help with account access, connected institutions, money controls,
            subscriptions, privacy requests, or account deletion.
          </p>
        </div>

        <div className="grid gap-5 py-8 sm:grid-cols-2">
          <section className="rounded-[8px] border border-white/10 bg-[#151b18] p-6">
            <LifeBuoy aria-hidden="true" className="text-[#79d7b4]" size={23} />
            <h2 className="mt-5 text-xl font-black">Customer help</h2>
            <p className="mt-3 leading-7 text-[#b9c5bf]">
              Include the email on your PayShield account and a short description.
              Never send passwords, full account numbers, card numbers, or identity documents.
            </p>
            <a className="mt-5 inline-flex items-center gap-2 font-black text-[#8fe0c0] hover:text-white" href={`mailto:${GRAYSTON_SUPPORT_EMAIL}`}>
              <Mail aria-hidden="true" size={17} />
              {GRAYSTON_SUPPORT_EMAIL}
            </a>
          </section>

          <section className="rounded-[8px] border border-white/10 bg-[#151b18] p-6">
            <Trash2 aria-hidden="true" className="text-[#ef9a8d]" size={23} />
            <h2 className="mt-5 text-xl font-black">Delete your account</h2>
            <p className="mt-3 leading-7 text-[#b9c5bf]">
              In PayShield, open Account, choose Profile and account, then Delete account.
              You can also request deletion from the account email through support.
            </p>
            <a className="mt-5 inline-flex items-center gap-2 font-black text-[#8fe0c0] hover:text-white" href={`mailto:${GRAYSTON_SUPPORT_EMAIL}?subject=PayShield%20account%20deletion`}>
              Request deletion
              <ExternalLink aria-hidden="true" size={16} />
            </a>
          </section>
        </div>

        <section className="border-t border-white/10 py-8">
          <h2 className="text-xl font-black">Subscription billing</h2>
          <p className="mt-3 max-w-2xl leading-7 text-[#b9c5bf]">
            Purchases, cancellations, and refunds are managed by the App Store or
            Google Play account used to subscribe. Use Restore purchase in PayShield
            when moving to a new phone or reinstalling the app.
          </p>
        </section>
      </section>
      <SiteFooter />
    </main>
  );
}
