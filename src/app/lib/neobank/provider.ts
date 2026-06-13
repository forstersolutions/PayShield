import type {
  CardAuthorizationDecision,
  CardAuthorizationInput,
  DirectDepositInstructions,
  NeobankReadiness,
  Payee,
  PayShieldUser,
} from "./types.ts";
import { assertLiveMoneyReady, getNeobankReadiness } from "./readiness.ts";
import {
  classifyProviderEvent,
  type ProviderEventClassification,
} from "./provider-events.ts";

export type ProviderCustomer = {
  providerCustomerId: string;
  status: "blocked" | "created";
};

export type ProviderKycSession = {
  providerApplicationId: string;
  status: "blocked" | "started";
};

export type ProviderFinancialAccount = {
  providerAccountId: string;
  status: "blocked" | "opened";
};

export type ProviderWebhookResult = ProviderEventClassification & {
  accepted: boolean;
  mode: "blocked" | "processed";
  reason?: string;
};

export type BankingProvider = {
  createAchTransfer(input: {
    amountCents: number;
    destinationPayeeId: string;
    idempotencyKey: string;
    sourceBucketId: string;
  }): Promise<{ providerTransferId: string; status: "blocked" | "created" }>;
  createBillPayment(input: {
    amountCents: number;
    idempotencyKey: string;
    payee: Payee;
  }): Promise<{ providerBillPaymentId: string; status: "blocked" | "created" }>;
  createCustomer(user: PayShieldUser): Promise<ProviderCustomer>;
  createDirectDepositInstructions(input: {
    providerAccountId: string;
  }): Promise<DirectDepositInstructions>;
  handleProviderWebhook(input: unknown): Promise<ProviderWebhookResult>;
  issueCard(input: {
    providerAccountId: string;
    userId: string;
  }): Promise<{ cardLast4: string; providerCardId: string; status: "blocked" | "issued" }>;
  openFinancialAccount(input: {
    providerCustomerId: string;
  }): Promise<ProviderFinancialAccount>;
  respondToCardAuthorization(
    input: CardAuthorizationInput,
  ): Promise<CardAuthorizationDecision>;
  startKyc(user: PayShieldUser): Promise<ProviderKycSession>;
};

export class GatedBankingProvider implements BankingProvider {
  private readonly readiness: NeobankReadiness;

  constructor(readiness: NeobankReadiness = getNeobankReadiness()) {
    this.readiness = readiness;
  }

  private blocked() {
    const gate = assertLiveMoneyReady(this.readiness);

    if (gate.ok) {
      return null;
    }

    return gate;
  }

  async createCustomer(user: PayShieldUser) {
    void user;
    const gate = this.blocked();

    return {
      providerCustomerId: gate ? "provider-contract-required" : "provider-customer-live",
      status: gate ? "blocked" : "created",
    } as ProviderCustomer;
  }

  async startKyc(user: PayShieldUser) {
    void user;
    const gate = this.blocked();

    return {
      providerApplicationId: gate
        ? "kyc-provider-contract-required"
        : "kyc-provider-application-live",
      status: gate ? "blocked" : "started",
    } as ProviderKycSession;
  }

  async openFinancialAccount(input: { providerCustomerId: string }) {
    void input;
    const gate = this.blocked();

    return {
      providerAccountId: gate
        ? "financial-account-provider-contract-required"
        : "financial-account-live",
      status: gate ? "blocked" : "opened",
    } as ProviderFinancialAccount;
  }

  async createDirectDepositInstructions(input: { providerAccountId: string }) {
    void input;
    const gate = this.blocked();

    return {
      accountLast4: gate ? "----" : "4421",
      accountName: "PayShield protected paycheck account",
      providerStatus: gate ? "gated" : "live",
      routingLast4: gate ? "----" : "0210",
    } as DirectDepositInstructions;
  }

  async issueCard(input: { providerAccountId: string; userId: string }) {
    void input;
    const gate = this.blocked();

    return {
      cardLast4: gate ? "----" : "9244",
      providerCardId: gate ? "card-provider-contract-required" : "card-live",
      status: gate ? "blocked" : "issued",
    } as const;
  }

  async createAchTransfer(input: {
    amountCents: number;
    destinationPayeeId: string;
    idempotencyKey: string;
    sourceBucketId: string;
  }) {
    void input;
    const gate = this.blocked();

    return {
      providerTransferId: gate
        ? "ach-provider-contract-required"
        : "ach-transfer-live",
      status: gate ? "blocked" : "created",
    } as const;
  }

  async createBillPayment(input: {
    amountCents: number;
    idempotencyKey: string;
    payee: Payee;
  }) {
    void input;
    const gate = this.blocked();

    return {
      providerBillPaymentId: gate
        ? "bill-pay-provider-contract-required"
        : "bill-pay-live",
      status: gate ? "blocked" : "created",
    } as const;
  }

  async handleProviderWebhook(input: unknown) {
    const classification = classifyProviderEvent(input);
    const gate = this.blocked();

    if (gate) {
      return {
        ...classification,
        accepted: true,
        mode: "blocked" as const,
        reason: classification.detectionCount
          ? "Provider paycheck events were classified, but live money movement is blocked until provider, ledger, auth, counsel, disclosure, and operations gates are complete."
          : gate.reason,
      };
    }

    return {
      ...classification,
      accepted: true,
      mode: "processed" as const,
      reason: classification.detectionCount
        ? "Provider paycheck events were classified and are ready for the ledger processing path."
        : "Provider webhook accepted; no paycheck-like transactions were present.",
    };
  }

  async respondToCardAuthorization(
    input: CardAuthorizationInput,
  ): Promise<CardAuthorizationDecision> {
    void input;
    const gate = this.blocked();

    if (gate) {
      return {
        approved: false,
        approvedAmountCents: 0,
        code: "live_money_gated",
        reason: gate.reason,
      };
    }

    return {
      approved: false,
      approvedAmountCents: 0,
      code: "live_money_gated",
      reason:
        "No live provider adapter is configured. Use the PayShield ledger decision path before enabling card gateway responses.",
    };
  }
}

export function getBankingProvider() {
  return new GatedBankingProvider();
}
