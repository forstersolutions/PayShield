import Link from "next/link";
import { PayShieldMark } from "@/app/components/pay-shield-mark";

export function SiteFooter() {
  return (
    <footer className="border-t border-[#3a3027] bg-[#17130f] text-[#b7aa9b]">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex items-center gap-3">
          <PayShieldMark className="size-9" />
          <div>
            <p className="text-sm font-semibold text-[#f9efe1]">PayShield</p>
            <p className="text-xs leading-5">
              Know what is safe to spend before the week gets busy.
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
            Planner
          </Link>
        </nav>
      </div>
    </footer>
  );
}
