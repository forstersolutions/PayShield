import Link from "next/link";
import {
  GraystonLogo,
  PayShieldHeaderLogo,
} from "@/app/components/pay-shield-mark";
import {
  GRAYSTON_SUPPORT_EMAIL,
  PAYSHIELD_OWNERSHIP_LINE,
} from "@/app/lib/brand";

export function SiteFooter({
  showLaunchLink = false,
}: {
  showLaunchLink?: boolean;
}) {
  return (
    <footer className="public-footer">
      <div className="public-footer-inner">
        <div className="public-footer-brands">
          <PayShieldHeaderLogo className="h-9 w-auto" />
          <span aria-hidden="true" />
          <div>
            <GraystonLogo className="h-7 w-auto" />
            <p>{PAYSHIELD_OWNERSHIP_LINE}</p>
          </div>
        </div>
        <nav
          aria-label="Footer"
          className="public-footer-nav"
        >
          <Link
            href="/privacy"
          >
            Privacy
          </Link>
          <Link
            href="/terms"
          >
            Terms
          </Link>
          <Link
            href="/app"
          >
            App
          </Link>
          {showLaunchLink ? (
            <Link
              href="/launch"
            >
              Launch
            </Link>
          ) : null}
          <a href={`mailto:${GRAYSTON_SUPPORT_EMAIL}`}>{GRAYSTON_SUPPORT_EMAIL}</a>
        </nav>
      </div>
    </footer>
  );
}
