import {
  CheckCircle2,
  Home,
  ShieldCheck,
  TimerReset,
  WalletCards,
} from "lucide-react";
import { PaycheckPlanner } from "@/app/components/paycheck-planner";
import { SiteFooter } from "@/app/components/site-footer";
import { WaitlistForm } from "@/app/components/waitlist-form";

export default function HomePage() {
  return (
    <main className="bg-[#08110f] text-[#fff7ea]">
      <PaycheckPlanner />

      <section className="border-b border-white/10 bg-[#101817]">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9ee6d6]">
              MVP workflow
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
              A calmer paycheck routine in four steps.
            </h2>
            <p className="mt-4 text-lg leading-8 text-[#cfc6b7]">
              PayShield starts as a manual planning app: add the paycheck, fund
              the bills first, see what is truly safe to spend, and create a
              recovery plan when money has to move.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {workflow.map((item) => {
              const Icon = item.icon;

              return (
                <article
                  className="rounded-[8px] border border-white/10 bg-[#16231f] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]"
                  key={item.title}
                >
                  <Icon className="size-6 text-[#9ee6d6]" aria-hidden="true" />
                  <h3 className="mt-5 text-lg font-semibold text-[#fff7ea]">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-[#cfc6b7]">
                    {item.body}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-b border-white/10 bg-[#0b1412]">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#ffbf91]">
              Built for real households
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
              Friendly enough for Sunday night. Clear enough for payday.
            </h2>
            <p className="mt-4 text-lg leading-8 text-[#cfc6b7]">
              The app avoids bank-speak and spreadsheet chores. It shows the
              practical answers people need before spending starts.
            </p>
          </div>

          <div className="grid gap-3">
            {outcomes.map((line) => (
              <div
                className="flex items-start gap-3 rounded-[8px] border border-white/10 bg-[#17201b] p-4"
                key={line}
              >
                <CheckCircle2
                  className="mt-0.5 size-5 shrink-0 text-[#9ee6d6]"
                  aria-hidden="true"
                />
                <p className="text-base leading-7 text-[#efe6d7]">{line}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="early-access" className="bg-[#08110f] text-[#fff7ea]">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:px-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9ee6d6]">
              Early access
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
              Help shape the first shipped version.
            </h2>
            <p className="mt-4 max-w-3xl text-lg leading-8 text-[#cfc6b7]">
              We are collecting real household, worker, employer, and partner
              feedback around the MVP workflow: bills first, safe-to-spend
              clarity, shared planning, and recovery after an unlock.
            </p>
            <div className="mt-8 grid gap-3 text-sm leading-6 text-[#d7ccbb] sm:grid-cols-3">
              <p className="rounded-[8px] border border-white/10 bg-white/[0.04] p-3">
                Bring one real paycheck week and see where the plan helps.
              </p>
              <p className="rounded-[8px] border border-white/10 bg-white/[0.04] p-3">
                Tell us which bills need the clearest protection.
              </p>
              <p className="rounded-[8px] border border-white/10 bg-white/[0.04] p-3">
                Join the first feedback group before broader release.
              </p>
            </div>
          </div>
          <WaitlistForm />
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

const workflow = [
  {
    title: "Add the paycheck",
    body: "Enter the check amount and pick a scenario that matches the week: normal, tight, or variable income.",
    icon: Home,
  },
  {
    title: "Reserve bills first",
    body: "Rent, vehicle, insurance, family needs, goals, and flexible money get funded in order.",
    icon: ShieldCheck,
  },
  {
    title: "Check spending",
    body: "The app compares a purchase against the safe-to-spend number so the decision is obvious.",
    icon: WalletCards,
  },
  {
    title: "Plan recovery",
    body: "Emergency unlocks show the refill amount before a household commits to moving money.",
    icon: TimerReset,
  },
];

const outcomes = [
  "The big number is not the total balance. It is what can be spent after the important stuff is covered.",
  "Short paychecks become visible early, with the first underfunded bill called out before the week gets messy.",
  "A shared household view can focus on coverage, shortfalls, and recovery instead of blaming individual purchases.",
  "The MVP works as a planning layer first, with no bank login or sensitive account numbers required.",
  "Reminders, safe-to-spend checks, and unlock plans are built around how people already think about payday.",
];
