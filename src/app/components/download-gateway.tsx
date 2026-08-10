import Image from "next/image";
import Link from "next/link";
import {
  Apple,
  ArrowDownToLine,
  Landmark,
  Play,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";

import {
  GraystonLogo,
  PayShieldHeaderLogo,
} from "@/app/components/pay-shield-mark";
import {
  GRAYSTON_SUPPORT_EMAIL,
  PAYSHIELD_OWNERSHIP_LINE,
} from "@/app/lib/brand";
import { getStoreLinks } from "@/app/lib/store-links";

const productPoints = [
  {
    body: "Income follows your priorities before everyday spending begins.",
    icon: ArrowDownToLine,
    title: "Paychecks protected",
  },
  {
    body: "Name every bucket, set its target, and change the order anytime.",
    icon: SlidersHorizontal,
    title: "Rules that fit your life",
  },
  {
    body: "Your card checks one honest balance while bills keep their money.",
    icon: ShieldCheck,
    title: "Safe to Spend",
  },
];

export function DownloadGateway() {
  const stores = getStoreLinks();

  return (
    <div className="download-shell">
      <header className="download-header">
        <Link aria-label="PayShield home" className="download-brand" href="/">
          <PayShieldHeaderLogo className="h-9 w-auto" priority />
        </Link>
        <a className="download-support" href={`mailto:${GRAYSTON_SUPPORT_EMAIL}`}>
          Support
        </a>
      </header>

      <main>
        <section className="download-hero">
          <div className="download-copy">
            <p className="download-kicker">PayShield for iPhone and Android</p>
            <h1>Spend what&apos;s free. Protect what&apos;s spoken for.</h1>
            <p className="download-lede">
              Every paycheck arrives with a plan. Bills keep their money, custom
              buckets stay protected, and you always know what is safe to spend.
            </p>

            <div className="download-store-actions" id="stores">
              <a
                aria-label="Download PayShield on the App Store"
                className="download-store-button download-store-primary"
                href={stores.appStoreUrl}
              >
                <Apple aria-hidden="true" size={27} strokeWidth={2.1} />
                <span>
                  <small>Download on the</small>
                  App Store
                </span>
              </a>
              <a
                aria-label="Get PayShield on Google Play"
                className="download-store-button"
                href={stores.playStoreUrl}
              >
                <Play aria-hidden="true" fill="currentColor" size={24} strokeWidth={1.8} />
                <span>
                  <small>Get it on</small>
                  Google Play
                </span>
              </a>
            </div>

            <div className="download-membership-line">
              <ShieldCheck aria-hidden="true" size={17} />
              <span>One household membership</span>
              <span aria-hidden="true">•</span>
              <strong>$19/month</strong>
            </div>
          </div>

          <div aria-label="PayShield mobile app showing Safe to Spend and protected buckets" className="download-device-stage">
            <div className="download-device-accent download-device-accent-blue" />
            <div className="download-device-accent download-device-accent-gold" />
            <div className="download-device">
              <div aria-hidden="true" className="download-device-speaker" />
              <Image
                alt="PayShield home screen with a $1,450 Safe to Spend balance and six protected buckets"
                className="download-device-screen"
                height={1688}
                priority
                sizes="(max-width: 700px) 72vw, 390px"
                src="/images/payshield-mobile-home.png"
                width={780}
              />
            </div>
          </div>
        </section>

        <section aria-label="PayShield benefits" className="download-proof">
          {productPoints.map(({ body, icon: Icon, title }) => (
            <article className="download-proof-item" key={title}>
              <span className="download-proof-icon"><Icon aria-hidden="true" size={20} /></span>
              <div>
                <h2>{title}</h2>
                <p>{body}</p>
              </div>
            </article>
          ))}
        </section>
      </main>

      <footer className="download-footer">
        <div className="download-owner">
          <GraystonLogo className="h-7 w-auto" />
          <span>{PAYSHIELD_OWNERSHIP_LINE}</span>
        </div>
        <nav aria-label="Footer">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <a href={`mailto:${GRAYSTON_SUPPORT_EMAIL}`}>{GRAYSTON_SUPPORT_EMAIL}</a>
        </nav>
      </footer>

      <div aria-hidden="true" className="download-bank-signal">
        <Landmark size={16} /> Built for real paycheck and account connections
      </div>
    </div>
  );
}
