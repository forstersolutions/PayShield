export type BucketProtection =
  | "bill_only"
  | "hard_lock"
  | "soft_lock"
  | "emergency"
  | "spendable";

export type BucketBalance = {
  availableCents: number;
  due: string;
  fundedCents: number;
  id: string;
  name: string;
  payeeId?: string;
  priority: number;
  protection: BucketProtection;
  shortCents: number;
  targetCents: number;
};

export type Payee = {
  allowedBucketId: string;
  id: string;
  maxCents: number;
  name: string;
  providerName?: string;
  status: "modeled" | "provider_pending" | "approved" | "rejected" | "archived";
};

export type BillPayment = {
  amountCents: number;
  bucketId?: string | null;
  canceledAt?: string | null;
  createdAt?: string;
  id: string;
  memo?: string | null;
  payeeId: string;
  scheduledFor: string;
  status: string;
};

export type TimelineItem = {
  amountCents?: number;
  at: string;
  detail?: string | null;
  id: string;
  label: string;
  rail: string;
  status: string;
};

export type BankConnection = {
  accountLast4?: string;
  accountMask?: string;
  accountName?: string;
  id: string;
  institutionName: string;
  status: string;
};

export type DirectDeposit = {
  accountLast4?: string;
  accountName?: string;
  instructionsExpiresAt?: string | null;
  instructionsUrl?: string;
  providerStatus?: string;
  routingLast4?: string;
  status?: string;
};

export type CardState = {
  authorizationMode?: string;
  cardLast4?: string;
  status?: string;
};

export type CommercialAccess = {
  currentPeriodEnd?: string | null;
  priceLabel?: string;
  state?: string;
  subscriptionStatus?: string | null;
};

export type DetectionRule = {
  employerNamePattern?: string;
  expectedFrequency?: string;
  id: string;
  minimumAmountCents?: number;
  ruleName?: string;
  status?: string;
};

export type OperationsPacket = {
  balances: {
    protectedCents: number;
    safeToSpendCents: number;
    totalCents: number;
  };
  buckets: BucketBalance[];
  card: CardState;
  commercialAccess?: CommercialAccess;
  controls?: {
    payees?: Payee[];
  };
  directDeposit?: DirectDeposit;
  generatedAt?: string;
  moneyRails?: {
    bankLinkReady?: boolean;
    paycheckDetectionReady?: boolean;
    providerAdapterConfigured?: boolean;
    transactionSyncReady?: boolean;
    transferReady?: boolean;
  };
  household?: {
    email?: string;
    householdId?: string;
    name?: string;
    userId?: string;
  };
  operations?: {
    bankConnections?: BankConnection[];
    billPayments?: BillPayment[];
    cardDecisions?: Record<string, unknown>[];
    directDepositSetups?: DirectDeposit[];
    journalEntries?: Record<string, unknown>[];
    paycheckDetectionRules?: DetectionRule[];
    paycheckDetections?: Record<string, unknown>[];
    transferIntents?: Record<string, unknown>[];
    unlockRequests?: Record<string, unknown>[];
  };
  readiness?: {
    liveMoneyReady?: boolean;
  };
  timeline?: TimelineItem[];
};

export type MoneyProfile = {
  bankConnectionId?: string | null;
  detectionRuleId?: string | null;
  employerName: string;
  expectedFrequency: "weekly" | "biweekly" | "semimonthly" | "monthly" | "unknown";
  nextPayday?: string | null;
  paycheckAmountCents: number;
  preferredPayeeId?: string | null;
  preferredTransferBucketId?: string | null;
  requestedTransferCents?: number;
};

export type MoneyProfileResponse = {
  message?: string;
  profile: MoneyProfile;
};

export type BillingStatus = {
  access?: CommercialAccess;
  active?: boolean;
  priceLabel?: string;
};

export type ApiFailure = {
  code?: string;
  error?: string;
  message?: string;
};
