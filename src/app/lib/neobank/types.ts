export type StandardBucketId =
  | "rent"
  | "vehicle"
  | "insurance"
  | "kids"
  | "vacation"
  | "emergency"
  | "safe_spending";

export type BucketId = StandardBucketId | `custom_${string}`;

export type BucketProtection =
  | "bill_only"
  | "hard_lock"
  | "soft_lock"
  | "emergency"
  | "spendable";

export type KycStatus =
  | "not_started"
  | "provider_pending"
  | "submitted"
  | "approved"
  | "rejected"
  | "manual_review";

export type ProfileAccessStatus = "approved" | "pending" | "blocked";

export type MoneyRailStatus = "gated" | "sandbox" | "live";

export type LedgerAccountId =
  | "asset:program_cash"
  | "liability:card_settlement"
  | "liability:bill_pay_pending"
  | `liability:bucket:${BucketId}`;

export type JournalEntryType =
  | "paycheck_deposit"
  | "card_authorization"
  | "bill_payment"
  | "bucket_unlock"
  | "reversal";

export type JournalLine = {
  accountId: LedgerAccountId;
  amountCents: number;
};

export type JournalEntry = {
  createdAt: string;
  id: string;
  idempotencyKey: string;
  lines: JournalLine[];
  memo: string;
  metadata?: Record<string, string | number | boolean | null>;
  reversedEntryId?: string;
  type: JournalEntryType;
};

export type BucketDefinition = {
  id: BucketId;
  name: string;
  targetCents: number;
  priority: number;
  protection: BucketProtection;
  due: string;
  payeeId?: string;
};

export type BucketBalance = BucketDefinition & {
  availableCents: number;
  fundedCents: number;
  shortCents: number;
};

export type PayShieldUser = {
  email: string;
  householdId: string;
  id: string;
  kycStatus: KycStatus;
  name: string;
  profileAccess: ProfileAccessStatus;
};

export type Payee = {
  allowedBucketId: BucketId;
  id: string;
  maxCents: number;
  name: string;
  status: "modeled" | "provider_pending" | "approved";
};

export type DirectDepositInstructions = {
  accountLast4: string;
  accountName: string;
  providerStatus: MoneyRailStatus;
  routingLast4: string;
};

export type CardStatus = {
  authorizationMode: "simulation" | "provider_gateway";
  cardLast4: string;
  status: MoneyRailStatus;
};

export type NeobankReadinessGate = {
  description: string;
  id:
    | "provider_contract"
    | "provider_credentials"
    | "sponsor_disclosures"
    | "counsel_signoff"
    | "operations_runbooks"
    | "postgres_ledger"
    | "dedicated_backend"
    | "clerk_auth";
  ok: boolean;
};

export type NeobankReadiness = {
  backendConfigured: boolean;
  clerkConfigured: boolean;
  gates: NeobankReadinessGate[];
  liveMoneyReady: boolean;
  mode: "architecture" | "sandbox" | "live";
  postgresConfigured: boolean;
  postgresSchemaVerified: boolean;
  postgresSchemaVersion: string;
  providerConfigured: boolean;
};

export type NeobankSnapshot = {
  buckets: BucketBalance[];
  card: CardStatus;
  directDeposit: DirectDepositInstructions;
  householdId: string;
  ledgerEntries: JournalEntry[];
  payees: Payee[];
  readiness: NeobankReadiness;
  user: PayShieldUser;
};

export type PaycheckDepositInput = {
  amountCents: number;
  employerName: string;
  idempotencyKey: string;
  receivedAt: string;
};

export type BillPaymentInput = {
  amountCents: number;
  idempotencyKey: string;
  memo?: string;
  payeeId: string;
  scheduledFor: string;
};

export type BillPaymentDecision = {
  accepted: boolean;
  amountCents: number;
  bucketId?: BucketId;
  code:
    | "scheduled"
    | "payee_not_allowed"
    | "amount_exceeds_payee_limit"
    | "insufficient_bucket_funds";
  payeeId?: string;
  providerStatus: "blocked" | "created";
  reason: string;
  scheduledFor?: string;
};

export type CardAuthorizationInput = {
  amountCents: number;
  idempotencyKey: string;
  merchantCategoryCode?: string;
  merchantName: string;
  payeeId?: string;
};

export type CardAuthorizationDecision = {
  approved: boolean;
  approvedAmountCents: number;
  bucketId?: BucketId;
  code: "approved" | "insufficient_safe_spend" | "payee_not_allowed" | "live_money_gated";
  reason: string;
};

export type UnlockMode = "slow_free" | "instant_fixed_fee";

export type UnlockInput = {
  amountCents: number;
  bucketId: BucketId;
  idempotencyKey: string;
  mode: UnlockMode;
  reason: string;
};

export type UnlockResult = {
  recoveryPerCheckCents: number;
  recoveryChecks: number;
  unlockedCents: number;
};
