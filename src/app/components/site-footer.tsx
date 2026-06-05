import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-[#08110f] text-[#cfc6b7]">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-[8px] bg-[#9ee6d6] text-[#07110f]">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-[#fff7ea]">PayShield</p>
            <p className="text-xs leading-5">
              Manual planning MVP. PayShield is not a bank.
            </p>
          </div>
        </div>
        <nav
          aria-label="Footer"
          className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium"
        >
          <Link className="hover:text-[#fff7ea]" href="/privacy">
            Privacy
          </Link>
          <Link className="hover:text-[#fff7ea]" href="/terms">
            Terms
          </Link>
          <Link className="hover:text-[#fff7ea]" href="/#early-access">
            Early access
          </Link>
        </nav>
      </div>
    </footer>
  );
}
