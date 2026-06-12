import Link from "next/link";
import { GraystonMark, PayShieldMark } from "@/app/components/pay-shield-mark";
import {
  GRAYSTON_COMPANY_NAME,
  GRAYSTON_SUPPORT_EMAIL,
  PAYSHIELD_OWNERSHIP_LINE,
} from "@/app/lib/brand";

export function SiteFooter() {
  return (
    <footer className="border-t border-[#284138] bg-[#101b16] text-[#b7aa9b]">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <PayShieldMark className="size-9" />
          <div>
            <p className="text-sm font-semibold text-[#f9efe1]">PayShield</p>
            <p className="text-xs leading-5">
              Protect the paycheck before ordinary spending can reach it.
            </p>
          </div>
          <span className="hidden h-9 w-px bg-[#284138] sm:block" />
          <GraystonMark className="size-9" />
          <div>
            <p className="text-sm font-semibold text-[#f9efe1]">
              {GRAYSTON_COMPANY_NAME}
            </p>
            <p className="text-xs leading-5">
              {PAYSHIELD_OWNERSHIP_LINE}{" "}
              <a className="text-[#a8c8ff] underline" href={`mailto:${GRAYSTON_SUPPORT_EMAIL}`}>
                {GRAYSTON_SUPPORT_EMAIL}
              </a>
            </p>
          </div>
        </div>
        <nav
          aria-label="Footer"
          className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium"
        >
          <Link className="hover:text-[#f9efe1]" href="/privacy">
            Privacy
          </Link>
          <Link className="hover:text-[#f9efe1]" href="/terms">
            Terms
          </Link>
          <Link className="hover:text-[#f9efe1]" href="/#product">
            Dashboard
          </Link>
        </nav>
      </div>
    </footer>
  );
}
