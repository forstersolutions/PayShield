import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-[#070807] text-[#b9b2a3]">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-[8px] bg-emerald-300 text-[#07110f]">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-[#f4f1e8]">PayShield</p>
            <p className="text-xs leading-5">
              Prototype only. PayShield is not a bank.
            </p>
          </div>
        </div>
        <nav
          aria-label="Footer"
          className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium"
        >
          <Link className="hover:text-[#f4f1e8]" href="/privacy">
            Privacy
          </Link>
          <Link className="hover:text-[#f4f1e8]" href="/terms">
            Terms
          </Link>
          <Link className="hover:text-[#f4f1e8]" href="/#pilot">
            Pilot access
          </Link>
        </nav>
      </div>
    </footer>
  );
}
