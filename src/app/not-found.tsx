import { ArrowRight, Home, LifeBuoy } from "lucide-react";
import Link from "next/link";
import { PayShieldHeaderLogo } from "@/app/components/pay-shield-mark";
import { GRAYSTON_SUPPORT_EMAIL } from "@/app/lib/brand";

export default function NotFound() {
  return (
    <main className="pay-app-shell relative min-h-screen overflow-hidden text-[#f7f8fb]">
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="pay-header">
          <Link
            aria-label="PayShield home"
            className="pay-header-brand min-w-0"
            href="/"
          >
            <PayShieldHeaderLogo priority />
          </Link>
        </header>

        <section className="grid flex-1 place-items-center py-10">
          <div className="brand-panel accent-rule max-w-3xl rounded-[8px] p-6 sm:p-8">
            <p className="brand-kicker">Route unavailable</p>
            <h1 className="mt-4 text-4xl font-black leading-tight text-white sm:text-5xl">
              This PayShield page could not be found.
            </h1>
            <p className="mt-4 text-base leading-7 text-[#c9d0da]">
              Download the mobile app, return to the PayShield website, or
              contact Grayston support for account help.
            </p>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <Link
                className="brand-button-primary inline-flex min-h-12 items-center justify-center gap-2 rounded-[8px] px-4 text-sm font-black"
                href="/download"
              >
                Get PayShield
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link
                className="brand-button-blue inline-flex min-h-12 items-center justify-center gap-2 rounded-[8px] px-4 text-sm font-black"
                href="/"
              >
                PayShield home
                <Home className="size-4" aria-hidden="true" />
              </Link>
              <a
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[8px] border border-white/12 bg-black/40 px-4 text-sm font-black text-white hover:border-[#39e8ff]/40"
                href={`mailto:${GRAYSTON_SUPPORT_EMAIL}`}
              >
                Support
                <LifeBuoy className="size-4" aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
