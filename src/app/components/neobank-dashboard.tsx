import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  CreditCard,
  Landmark,
  LockKeyhole,
  ReceiptText,
  ShieldCheck,
  Split,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import {
  PayShieldHeaderLogo,
  PayShieldMark,
} from "@/app/components/pay-shield-mark";
import { PublicCheckoutForm } from "@/app/components/public-checkout-form";
import { getCommercialReadiness } from "@/app/lib/commercial/billing.ts";
import { createNeobankSnapshot } from "@/app/lib/neobank/demo-state.ts";

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}

const differencePoints = [
  {
    body: "The number you see already excludes rent, insurance, and every other protected commitment.",
    icon: WalletCards,
    title: "An honest spending balance",
  },
  {
    body: "Every deposit follows your priorities automatically, including short-paycheck rules.",
    icon: Split,
    title: "Protection before temptation",
  },
  {
    body: "Approved bills reach their assigned money. Everyday purchases never do.",
    icon: LockKeyhole,
    title: "Boundaries that hold",
  },
];

const flow = [
  {
    body: "Securely connect the account where your income arrives.",
    icon: Landmark,
    number: "01",
    title: "Connect your paycheck",
  },
  {
    body: "Name your buckets, set priorities, limits, targets, and release rules.",
    icon: ShieldCheck,
    number: "02",
    title: "Choose what stays protected",
  },
  {
    body: "Spend from one clear number while PayShield keeps obligations out of reach.",
    icon: CreditCard,
    number: "03",
    title: "Use money without the guesswork",
  },
];

export function NeobankDashboard() {
  const snapshot = createNeobankSnapshot();
  const commercial = getCommercialReadiness();
  const safeSpend =
    snapshot.buckets.find((bucket) => bucket.id === "safe_spending")
      ?.availableCents ?? 0;
  const protectedCents = snapshot.buckets
    .filter((bucket) => bucket.id !== "safe_spending")
    .reduce((sum, bucket) => sum + bucket.availableCents, 0);
  const featuredBuckets = snapshot.buckets
    .filter((bucket) => bucket.id !== "safe_spending")
    .slice(0, 4);

  return (
    <section className="public-shell" id="product">
      <header className="public-header">
        <a aria-label="PayShield home" className="public-brand" href="#product">
          <PayShieldHeaderLogo priority />
        </a>
        <nav aria-label="Primary" className="public-nav">
          <a href="#difference">Why PayShield</a>
          <a href="#how-it-works">How it works</a>
          <a href="#membership">Membership</a>
        </nav>
        <Link className="public-sign-in" href="/app">
          Sign in <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </header>

      <main>
        <section className="public-hero">
          <div className="public-hero-copy">
            <p className="public-kicker">
              <span /> Your paycheck, protected first
            </p>
            <h1>PayShield</h1>
            <p className="public-hero-line">
              Spend what&apos;s free. Protect what&apos;s spoken for.
            </p>
            <p className="public-hero-body">
              Your account balance shows every dollar. PayShield shows the one
              number you can actually spend, after the money you need is already
              protected.
            </p>
            <div className="public-hero-actions">
              <a className="public-primary-action" href="#membership">
                Get PayShield
                <ArrowRight className="size-4" aria-hidden="true" />
              </a>
              <Link className="public-secondary-action" href="/app">
                Open the app
              </Link>
            </div>
            <div className="public-trust-line">
              <Check className="size-4" aria-hidden="true" />
              Custom buckets
              <Check className="size-4" aria-hidden="true" />
              Paycheck rules
              <Check className="size-4" aria-hidden="true" />
              Bill-only access
            </div>
          </div>

          <div className="public-product-scene" aria-label="PayShield product preview">
            <div className="public-scene-window">
              <div className="public-scene-topbar">
                <PayShieldMark className="size-8" />
                <div>
                  <span />
                  <span />
                  <span />
                </div>
                <small>Today</small>
              </div>
              <div className="public-scene-balance">
                <div className="public-scene-balance-head">
                  <span><ShieldCheck className="size-4" /> Safe to Spend</span>
                  <small>Available now</small>
                </div>
                <strong>{formatMoney(safeSpend)}</strong>
                <p>{formatMoney(protectedCents)} protected for what comes next</p>
                <div className="public-scene-buttons">
                  <span><ArrowDownToLine className="size-4" /> Move money</span>
                  <span><ReceiptText className="size-4" /> Pay a bill</span>
                </div>
              </div>
              <div className="public-scene-label">
                <span>Protected buckets</span>
                <small>Funded from your paycheck</small>
              </div>
              <div className="public-scene-buckets">
                {featuredBuckets.map((bucket, index) => {
                  const percent = bucket.targetCents
                    ? Math.min(
                        100,
                        Math.round(
                          (bucket.availableCents / bucket.targetCents) * 100,
                        ),
                      )
                    : 100;
                  return (
                    <article key={bucket.id}>
                      <span className={`public-bucket-icon tone-${index + 1}`}>
                        {bucket.protection === "bill_only" ? (
                          <ReceiptText className="size-4" aria-hidden="true" />
                        ) : (
                          <LockKeyhole className="size-4" aria-hidden="true" />
                        )}
                      </span>
                      <small>{bucket.name}</small>
                      <strong>{formatMoney(bucket.availableCents)}</strong>
                      <div><span style={{ width: `${percent}%` }} /></div>
                    </article>
                  );
                })}
              </div>
              <div className="public-scene-card-row">
                <div className="public-scene-card">
                  <PayShieldMark className="size-7" />
                  <span>**** 4821</span>
                  <small>SAFE TO SPEND</small>
                </div>
                <p>
                  <strong>Purchase protected</strong>
                  <span>Every card decision checks your real spending balance.</span>
                </p>
              </div>
            </div>
          </div>

          <a aria-label="See why PayShield is different" className="public-scroll-cue" href="#difference">
            <span />
          </a>
        </section>

        <section className="public-difference" id="difference">
          <div className="public-section-intro">
            <p className="public-kicker"><span /> The difference</p>
            <h2>Your balance lies.<br />Safe to Spend doesn&apos;t.</h2>
            <p>
              Budget apps report what already happened. PayShield changes what
              can happen next by separating protected money before you spend.
            </p>
          </div>
          <div className="public-difference-grid">
            {differencePoints.map((point, index) => {
              const Icon = point.icon;
              return (
                <article key={point.title}>
                  <div>
                    <span className={`public-feature-icon tone-${index + 1}`}>
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <small>0{index + 1}</small>
                  </div>
                  <h3>{point.title}</h3>
                  <p>{point.body}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="public-flow" id="how-it-works">
          <div className="public-flow-heading">
            <p className="public-kicker"><span /> One simple flow</p>
            <h2>Your paycheck arrives with a plan.</h2>
          </div>
          <div className="public-flow-grid">
            {flow.map((step) => {
              const Icon = step.icon;
              return (
                <article key={step.number}>
                  <small>{step.number}</small>
                  <span><Icon className="size-6" aria-hidden="true" /></span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </article>
              );
            })}
          </div>
          <div className="public-promise-band">
            <div>
              <PayShieldMark className="size-12" />
              <p><span>Built for real life</span><strong>Short check? Surprise bill? Plans changed?</strong></p>
            </div>
            <p>Reorder priorities, adjust a bucket, or unlock money with a visible recovery plan. You stay in control.</p>
          </div>
        </section>

        <section className="public-membership" id="membership">
          <div className="public-membership-copy">
            <p className="public-kicker"><span /> PayShield membership</p>
            <h2>Stop spending tomorrow&apos;s money today.</h2>
            <p>
              One household membership includes protected buckets, paycheck
              rules, approved bill routing, Safe to Spend, card controls, and a
              complete activity record.
            </p>
            <div className="public-price">
              <strong>{commercial.priceLabel.split("/")[0]}</strong>
              <span>/month<br />per household</span>
            </div>
            <ul>
              <li><Check className="size-4" /> Customize every protection rule</li>
              <li><Check className="size-4" /> Change or cancel your membership anytime</li>
              <li><Check className="size-4" /> Support from Grayston Technologies</li>
            </ul>
          </div>
          <div className="public-checkout-wrap">
            <PublicCheckoutForm priceLabel={commercial.priceLabel} />
          </div>
        </section>
      </main>
    </section>
  );
}
