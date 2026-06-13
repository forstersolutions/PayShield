"use client";

import { useState } from "react";
import { BillPaymentPanel } from "@/app/components/bill-payment-panel";
import { PayeeControlPanel } from "@/app/components/payee-control-panel";
import type { BucketBalance, Payee } from "@/app/lib/neobank/types.ts";

function mergePayee(payees: Payee[], payee: Payee) {
  const byId = new Map(payees.map((item) => [item.id, item]));
  byId.set(payee.id, payee);

  return [...byId.values()];
}

export function BillRoutingWorkspace({
  buckets,
  payees,
}: {
  buckets: BucketBalance[];
  payees: Payee[];
}) {
  const [payeeList, setPayeeList] = useState(payees);

  return (
    <>
      <PayeeControlPanel
        buckets={buckets}
        onPayeeSaved={(payee) => {
          setPayeeList((current) => mergePayee(current, payee));
        }}
        payees={payeeList}
      />
      <BillPaymentPanel buckets={buckets} payees={payeeList} />
    </>
  );
}
