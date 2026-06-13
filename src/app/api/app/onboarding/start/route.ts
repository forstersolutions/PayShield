import { NextResponse } from "next/server.js";
import { requirePaidAccessForFallback } from "../../../../lib/commercial/billing.ts";
import { getAppSession } from "../../../../lib/neobank/auth.ts";
import { forwardCoreRequest } from "../../../../lib/neobank/core-client.ts";
import { createNeobankSnapshot } from "../../../../lib/neobank/demo-state.ts";
import { getBankingProvider } from "../../../../lib/neobank/provider.ts";
import { assertLiveMoneyReady } from "../../../../lib/neobank/readiness.ts";

export async function POST() {
  try {
    const session = await getAppSession();
    const coreResponse = await forwardCoreRequest({
      body: {},
      method: "POST",
      path: "/api/app/onboarding/start",
      session,
    });

    if (coreResponse) {
      return coreResponse;
    }

    const paidAccess = requirePaidAccessForFallback("provider onboarding");

    if (!paidAccess.ok) {
      return NextResponse.json(paidAccess.body, {
        headers: {
          "cache-control": "no-store",
        },
        status: paidAccess.status,
      });
    }

    const snapshot = createNeobankSnapshot();
    const liveGate = assertLiveMoneyReady(snapshot.readiness);
    const provider = getBankingProvider();
    const customer = await provider.createCustomer(snapshot.user);
    const kyc = await provider.startKyc(snapshot.user);
    const financialAccount = await provider.openFinancialAccount({
      providerCustomerId: customer.providerCustomerId,
    });
    const directDeposit = await provider.createDirectDepositInstructions({
      providerAccountId: financialAccount.providerAccountId,
    });
    const card = await provider.issueCard({
      providerAccountId: financialAccount.providerAccountId,
      userId: snapshot.user.id,
    });

    return NextResponse.json(
      {
        card,
        customer,
        directDeposit,
        financialAccount,
        kyc,
        liveMoney: liveGate,
        message: liveGate.ok
          ? "Onboarding started with the configured provider."
          : "Onboarding is queued. Provider activation is required before account, card, and transfer setup.",
        profileAccess: snapshot.user.profileAccess,
      },
      {
        headers: {
          "cache-control": "no-store",
        },
        status: liveGate.ok ? 200 : 423,
      },
    );
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
