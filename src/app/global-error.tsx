"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("PayShield global error", {
      digest: error.digest,
      message: error.message,
    });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="pay-app-shell grid min-h-screen place-items-center bg-[#050607] px-4 py-10 text-[#f7f8fb]">
          <section className="brand-panel accent-rule w-full max-w-3xl rounded-[8px] p-6 sm:p-8">
            <AlertTriangle className="size-8 text-[#ffb237]" aria-hidden="true" />
            <p className="brand-kicker mt-4">System recovery</p>
            <h1 className="mt-3 text-4xl font-black leading-tight text-white sm:text-5xl">
              PayShield hit a system-level loading error.
            </h1>
            <p className="mt-4 text-base leading-7 text-[#c9d0da]">
              Retry the route. If the error repeats, Grayston support can trace
              it from the route, timestamp, and deployment logs.
            </p>
            <button
              className="brand-button-primary mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-[8px] px-4 text-sm font-black"
              onClick={() => unstable_retry()}
              type="button"
            >
              Retry PayShield
              <RotateCw className="size-4" aria-hidden="true" />
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
