"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import Link from "next/link";
import { PayShieldHeaderLogo } from "@/app/components/pay-shield-mark";
import { GRAYSTON_SUPPORT_EMAIL } from "@/app/lib/brand";

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("PayShield route error", {
      digest: error.digest,
      message: error.message,
    });
  }, [error]);

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
            <AlertTriangle className="size-8 text-[#ffb237]" aria-hidden="true" />
            <p className="brand-kicker mt-4">Recovery state</p>
            <h1 className="mt-3 text-4xl font-black leading-tight text-white sm:text-5xl">
              PayShield could not finish loading this screen.
            </h1>
            <p className="mt-4 text-base leading-7 text-[#c9d0da]">
              Retry the screen. If it repeats, send the support team the current
              route and timestamp so the failed path can be traced.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <button
                className="brand-button-primary inline-flex min-h-12 items-center justify-center gap-2 rounded-[8px] px-4 text-sm font-black"
                onClick={() => unstable_retry()}
                type="button"
              >
                Retry screen
                <RotateCw className="size-4" aria-hidden="true" />
              </button>
              <a
                className="inline-flex min-h-12 items-center justify-center rounded-[8px] border border-white/12 bg-black/40 px-4 text-sm font-black text-white hover:border-[#39e8ff]/40"
                href={`mailto:${GRAYSTON_SUPPORT_EMAIL}`}
              >
                Contact Grayston support
              </a>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
