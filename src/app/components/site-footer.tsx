import Link from "next/link";
import {
  GraystonLogo,
  PayShieldMark,
} from "@/app/components/pay-shield-mark";
import {
  GRAYSTON_COMPANY_NAME,
  GRAYSTON_SUPPORT_EMAIL,
  PAYSHIELD_OWNERSHIP_LINE,
} from "@/app/lib/brand";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-[#050607] text-[#aab3c2]">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <PayShieldMark className="size-9" />
          <div>
            <p className="text-sm font-semibold text-white">PayShield</p>
            <p className="text-xs leading-5">
              Protect the paycheck before ordinary spending can reach it.
            </p>
          </div>
          <span className="hidden h-9 w-px bg-white/10 sm:block" />
          <div className="flex h-11 items-center rounded-[8px] border border-white/10 bg-black/50 px-3">
            <GraystonLogo className="h-8 w-auto" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">
              {GRAYSTON_COMPANY_NAME}
            </p>
            <p className="text-xs leading-5">
              {PAYSHIELD_OWNERSHIP_LINE}{" "}
              <a
                className="inline-flex min-h-9 items-center text-[#39e8ff] underline"
                href={`mailto:${GRAYSTON_SUPPORT_EMAIL}`}
              >
                {GRAYSTON_SUPPORT_EMAIL}
              </a>
            </p>
          </div>
        </div>
        <nav
          aria-label="Footer"
          className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium"
        >
          <Link
            className="inline-flex min-h-9 items-center px-2 hover:text-white"
            href="/privacy"
          >
            Privacy
          </Link>
          <Link
            className="inline-flex min-h-9 items-center px-2 hover:text-white"
            href="/terms"
          >
            Terms
          </Link>
          <Link
            className="inline-flex min-h-9 items-center px-2 hover:text-white"
            href="/app"
          >
            App
          </Link>
          <Link
            className="inline-flex min-h-9 items-center px-2 hover:text-white"
            href="/launch"
          >
            Launch
          </Link>
          <Link
            className="inline-flex min-h-9 items-center px-2 hover:text-white"
            href="/#product"
          >
            Product
          </Link>
        </nav>
      </div>
    </footer>
  );
}
