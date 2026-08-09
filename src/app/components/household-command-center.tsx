import { HouseholdMoneyWorkspace } from "@/app/components/household-money-workspace";
import { getCommercialReadiness } from "@/app/lib/commercial/billing.ts";
import type { AppSession } from "@/app/lib/neobank/auth.ts";
import { createNeobankSnapshot } from "@/app/lib/neobank/demo-state.ts";
import { createHouseholdOperationsPacket } from "@/app/lib/neobank/operations.ts";

export function HouseholdCommandCenter({ session }: { session?: AppSession }) {
  const snapshot = createNeobankSnapshot();
  const commercial = getCommercialReadiness();
  const reviewMode = session?.authMode === "demo";
  const operations = reviewMode
    ? createHouseholdOperationsPacket(session)
    : undefined;
  const buckets = reviewMode
    ? snapshot.buckets
    : snapshot.buckets.map((bucket) => ({
        ...bucket,
        availableCents: 0,
        fundedCents: 0,
        shortCents: bucket.targetCents,
      }));
  const householdName =
    session?.name || operations?.household.name || "Your household";

  return (
    <HouseholdMoneyWorkspace
      buckets={buckets}
      householdName={householdName}
      initialOperations={operations}
      payees={reviewMode ? snapshot.payees : []}
      priceLabel={commercial.priceLabel}
    />
  );
}
