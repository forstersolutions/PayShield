import Link from "next/link";
import { PayShieldMark } from "@/app/components/pay-shield-mark";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-[#05070a] text-[#b9c3d0]">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex items-center gap-3">
          <PayShieldMark className="size-9" />
          <div>
            <p className="text-sm font-semibold text-[#fff8eb]">PayShield</p>
            <p className="text-xs leading-5">
              Manual planning MVP. PayShield is not a bank.
            </p>
          </div>
        </div>
        <nav
          aria-label="Footer"
          className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium"
        >
          <Link className="hover:text-[#fff8eb]" href="/privacy">
            Privacy
          </Link>
          <Link className="hover:text-[#fff8eb]" href="/terms">
            Terms
          </Link>
          <Link className="hover:text-[#fff8eb]" href="/#early-access">
            Early access
          </Link>
        </nav>
      </div>
    </footer>
  );
}
