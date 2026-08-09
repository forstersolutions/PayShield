"use client";

import {
  BillPaymentPanel,
  type BillPaymentRecord,
} from "@/app/components/bill-payment-panel";
import { PayeeControlPanel } from "@/app/components/payee-control-panel";
import type { BucketBalance, Payee } from "@/app/lib/neobank/types.ts";

export function BillRoutingWorkspace({
  billPayments,
  buckets,
  onOperationsRefresh,
  onPayeesChanged,
  payees,
}: {
  billPayments?: BillPaymentRecord[];
  buckets: BucketBalance[];
  onOperationsRefresh?: () => Promise<void> | void;
  onPayeesChanged?: (payees: Payee[]) => void;
  payees: Payee[];
}) {
  return (
    <>
      <PayeeControlPanel
        buckets={buckets}
        onPayeesChanged={onPayeesChanged}
        payees={payees}
      />
      <BillPaymentPanel
        billPayments={billPayments}
        buckets={buckets}
        onRefresh={onOperationsRefresh}
        payees={payees}
      />
    </>
  );
}
