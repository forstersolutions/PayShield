import Link from "next/link";
import { PayShieldMark } from "@/app/components/pay-shield-mark";

export function SiteFooter() {
  return (
    <footer className="border-t border-[#2d281f] bg-[#070604] text-[#b9ad99]">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex items-center gap-3">
          <PayShieldMark className="size-9" />
          <div>
            <p className="text-sm font-semibold text-[#fff6e8]">PayShield</p>
            <p className="text-xs leading-5">
              Spend from the money left after life is covered.
            </p>
          </div>
        </div>
        <nav
          aria-label="Footer"
          className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium"
        >
          <Link className="hover:text-[#fff6e8]" href="/privacy">
            Privacy
          </Link>
          <Link className="hover:text-[#fff6e8]" href="/terms">
            Terms
          </Link>
          <Link className="hover:text-[#fff6e8]" href="/#product">
            Planner
          </Link>
        </nav>
      </div>
    </footer>
  );
}
