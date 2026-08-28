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
import {
  getProviderAdapterConfig,
  joinProviderPath,
} from "./provider-adapter.ts";

export type ProviderCustomer = {
  providerCustomerId: string;
  providerRequestId?: string;
  status: "blocked" | "created";
};

export type ProviderKycSession = {
  providerApplicationId: string;
  providerRequestId?: string;
  status: "blocked" | "started";
};

export type ProviderFinancialAccount = {
  providerAccountId: string;
  providerRequestId?: string;
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
    void this.blocked();

    return {
      providerCustomerId: "provider-contract-required",
      status: "blocked",
    } as ProviderCustomer;
  }

  async startKyc(user: PayShieldUser) {
    void user;
    void this.blocked();

    return {
      providerApplicationId: "kyc-provider-contract-required",
      status: "blocked",
    } as ProviderKycSession;
  }

  async openFinancialAccount(input: { providerCustomerId: string }) {
    void input;
    void this.blocked();

    return {
      providerAccountId: "financial-account-provider-contract-required",
      status: "blocked",
    } as ProviderFinancialAccount;
  }

  async createDirectDepositInstructions(input: { providerAccountId: string }) {
    void input;
    void this.blocked();

    return {
      accountLast4: "----",
      accountName: "PayShield protected paycheck account",
      providerStatus: "gated",
      routingLast4: "----",
    } as DirectDepositInstructions;
  }

  async issueCard(input: { providerAccountId: string; userId: string }) {
    void input;
    void this.blocked();

    return {
      cardLast4: "----",
      providerCardId: "card-provider-contract-required",
      status: "blocked",
    } as const;
  }

  async createAchTransfer(input: {
    amountCents: number;
    destinationPayeeId: string;
    idempotencyKey: string;
    sourceBucketId: string;
  }) {
    void input;
    void this.blocked();

    return {
      providerTransferId: "ach-provider-contract-required",
      status: "blocked",
    } as const;
  }

  async createBillPayment(input: {
    amountCents: number;
    idempotencyKey: string;
    payee: Payee;
  }) {
    void input;
    void this.blocked();

    return {
      providerBillPaymentId: "bill-pay-provider-contract-required",
      status: "blocked",
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

function textField(value: unknown, maxLength = 240) {
  return typeof value === "string" && value.trim()
    ? value.trim().replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").slice(0, maxLength)
    : "";
}

function hostedProviderUrl(value: unknown) {
  const raw = textField(value, 2000);

  if (!raw) {
    return "";
  }

  try {
    const url = new URL(raw);
    const localHttp =
      url.protocol === "http:" &&
      ["127.0.0.1", "::1", "localhost"].includes(url.hostname) &&
      process.env.VERCEL_ENV !== "production";

    if (
      url.username ||
      url.password ||
      (url.protocol !== "https:" && !localHttp)
    ) {
      return "";
    }

    return url.toString();
  } catch {
    return "";
  }
}

function hostedProviderExpiry(value: unknown) {
  const raw = textField(value, 80);

  if (!raw) {
    return null;
  }

  const timestamp = Date.parse(raw);

  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function providerRequestId(payload: Record<string, unknown>) {
  return (
    textField(payload.providerRequestId) ||
    textField(payload.requestId) ||
    textField(payload.id)
  );
}

function cardDecisionCode(value: unknown, approved: boolean): CardAuthorizationDecision["code"] {
  const code = textField(value, 80);

  if (
    code === "approved" ||
    code === "payee_not_allowed" ||
    code === "insufficient_safe_spend" ||
    code === "live_money_gated"
  ) {
    return code;
  }

  return approved ? "approved" : "live_money_gated";
}

export class ProviderAdapterError extends Error {
  constructor(message = "Configured provider adapter request failed.") {
    super(message);
    this.name = "ProviderAdapterError";
  }
}

const maxProviderAdapterResponseBytes = 256 * 1024;

async function readBoundedProviderResponseText(
  response: Response,
  operation: string,
) {
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      byteLength += value.byteLength;

      if (byteLength > maxProviderAdapterResponseBytes) {
        await reader.cancel().catch(() => {});
        throw new ProviderAdapterError(
          `Provider ${operation} response is too large.`,
        );
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(bytes);
}

async function readProviderJsonPayload(response: Response, operation: string) {
  const text = await readBoundedProviderResponseText(response, operation);

  if (!text) {
    return {};
  }

  try {
    const payload = JSON.parse(text) as unknown;

    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  } catch {
    if (!response.ok) {
      return {};
    }

    throw new ProviderAdapterError(
      `Provider ${operation} did not return a valid JSON response.`,
    );
  }
}

class HttpJsonBankingProvider implements BankingProvider {
  private readonly config = getProviderAdapterConfig();

  private async request(
    operation: string,
    path: string,
    body: Record<string, unknown>,
  ) {
    let response: Response;

    try {
      response = await fetch(joinProviderPath(this.config.apiBaseUrl, path), {
        body: JSON.stringify({
          ...body,
          operation,
          providerName: this.config.providerName,
        }),
        cache: "no-store",
        headers: {
          "authorization": `Bearer ${process.env.PAYSHIELD_BAAS_API_KEY?.trim()}`,
          "content-type": "application/json",
          "x-payshield-provider": this.config.providerName,
          "x-payshield-provider-operation": operation,
        },
        method: "POST",
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch {
      throw new ProviderAdapterError(
        `Provider ${operation} request could not be completed.`,
      );
    }

    const payload = await readProviderJsonPayload(response, operation);

    if (!response.ok) {
      throw new ProviderAdapterError(
        `Provider ${operation} rejected the request.`,
      );
    }

    return payload;
  }

  async createCustomer(user: PayShieldUser) {
    const payload = await this.request(
      "createCustomer",
      this.config.endpoints.customer,
      {
        email: user.email,
        idempotencyKey: `customer:${user.id}`,
        name: user.name,
        userId: user.id,
      },
    );
    const providerCustomerId =
      textField(payload.providerCustomerId) ||
      textField(payload.customerId);

    if (!providerCustomerId) {
      throw new ProviderAdapterError("Provider customer response did not include a customer id.");
    }

    return {
      providerCustomerId,
      providerRequestId: providerRequestId(payload),
      status: "created" as const,
    };
  }

  async startKyc(user: PayShieldUser) {
    const payload = await this.request("startKyc", this.config.endpoints.kyc, {
      email: user.email,
      idempotencyKey: `kyc:${user.id}`,
      name: user.name,
      userId: user.id,
    });
    const providerApplicationId =
      textField(payload.providerApplicationId) ||
      textField(payload.applicationId);

    if (!providerApplicationId) {
      throw new ProviderAdapterError("Provider KYC response did not include an application id.");
    }

    return {
      providerApplicationId,
      providerRequestId: providerRequestId(payload),
      status: "started" as const,
    };
  }

  async openFinancialAccount(input: { providerCustomerId: string }) {
    const payload = await this.request(
      "openFinancialAccount",
      this.config.endpoints.financialAccount,
      {
        idempotencyKey: `financial-account:${input.providerCustomerId}`,
        providerCustomerId: input.providerCustomerId,
      },
    );
    const providerAccountId =
      textField(payload.providerAccountId) ||
      textField(payload.accountId);

    if (!providerAccountId) {
      throw new ProviderAdapterError("Provider account response did not include an account id.");
    }

    return {
      providerAccountId,
      providerRequestId: providerRequestId(payload),
      status: "opened" as const,
    };
  }

  async createDirectDepositInstructions(input: { providerAccountId: string }) {
    const payload = await this.request(
      "createDirectDepositInstructions",
      this.config.endpoints.directDeposit,
      {
        idempotencyKey: `direct-deposit:${input.providerAccountId}`,
        providerAccountId: input.providerAccountId,
      },
    );
    const accountLast4 = textField(payload.accountLast4, 4);
    const routingLast4 = textField(payload.routingLast4, 4);
    const hostedInstructions =
      payload.hostedInstructions &&
      typeof payload.hostedInstructions === "object" &&
      !Array.isArray(payload.hostedInstructions)
        ? (payload.hostedInstructions as Record<string, unknown>)
        : {};
    const instructionsUrl = hostedProviderUrl(
      payload.instructionsUrl ||
        payload.payrollSwitchUrl ||
        payload.setupUrl ||
        payload.url ||
        hostedInstructions.url,
    );
    const instructionsExpiresAt = hostedProviderExpiry(
      payload.instructionsExpiresAt ||
        payload.expiresAt ||
        hostedInstructions.expiresAt,
    );

    if (!/^\d{4}$/.test(accountLast4) || !/^\d{4}$/.test(routingLast4)) {
      throw new ProviderAdapterError(
        "Provider direct-deposit response did not include masked routing details.",
      );
    }

    if (!instructionsUrl) {
      throw new ProviderAdapterError(
        "Provider direct-deposit response did not include a secure hosted instructions URL.",
      );
    }

    if (
      instructionsExpiresAt &&
      Date.parse(instructionsExpiresAt) <= Date.now()
    ) {
      throw new ProviderAdapterError(
        "Provider direct-deposit instructions were already expired.",
      );
    }

    return {
      accountLast4,
      accountName:
        textField(payload.accountName, 80) ||
        "PayShield protected paycheck account",
      instructionsExpiresAt,
      instructionsUrl,
      providerStatus: "live" as const,
      routingLast4,
    };
  }

  async issueCard(input: { providerAccountId: string; userId: string }) {
    const payload = await this.request("issueCard", this.config.endpoints.cardIssue, {
      idempotencyKey: `card:${input.userId}:${input.providerAccountId}`,
      providerAccountId: input.providerAccountId,
      userId: input.userId,
    });
    const cardLast4 = textField(payload.cardLast4, 4);
    const providerCardId =
      textField(payload.providerCardId) ||
      textField(payload.cardId);

    if (!providerCardId || !/^\d{4}$/.test(cardLast4)) {
      throw new ProviderAdapterError("Provider card response did not include card identifiers.");
    }

    return {
      cardLast4,
      providerCardId,
      status: "issued" as const,
    };
  }

  async createAchTransfer(input: {
    amountCents: number;
    destinationPayeeId: string;
    idempotencyKey: string;
    sourceBucketId: string;
  }) {
    const payload = await this.request(
      "createAchTransfer",
      this.config.endpoints.transfer,
      input,
    );
    const providerTransferId =
      textField(payload.providerTransferId) ||
      textField(payload.transferId);

    if (!providerTransferId) {
      throw new ProviderAdapterError("Provider transfer response did not include a transfer id.");
    }

    return {
      providerTransferId,
      status: "created" as const,
    };
  }

  async createBillPayment(input: {
    amountCents: number;
    idempotencyKey: string;
    payee: Payee;
  }) {
    const payload = await this.request(
      "createBillPayment",
      this.config.endpoints.billPayment,
      input,
    );
    const providerBillPaymentId =
      textField(payload.providerBillPaymentId) ||
      textField(payload.billPaymentId);

    if (!providerBillPaymentId) {
      throw new ProviderAdapterError(
        "Provider bill-payment response did not include a bill payment id.",
      );
    }

    return {
      providerBillPaymentId,
      status: "created" as const,
    };
  }

  async handleProviderWebhook(input: unknown) {
    return new GatedBankingProvider().handleProviderWebhook(input);
  }

  async respondToCardAuthorization(input: CardAuthorizationInput) {
    const payload = await this.request(
      "respondToCardAuthorization",
      this.config.endpoints.cardAuthorization,
      input as unknown as Record<string, unknown>,
    );
    const approvedAmountCents =
      typeof payload.approvedAmountCents === "number"
        ? payload.approvedAmountCents
        : 0;

    if (
      !Number.isInteger(approvedAmountCents) ||
      approvedAmountCents < 0 ||
      approvedAmountCents > input.amountCents
    ) {
      throw new ProviderAdapterError(
        "Provider card authorization response included an invalid approved amount.",
      );
    }

    return {
      approved: payload.approved === true,
      approvedAmountCents: payload.approved === true ? approvedAmountCents : 0,
      code: cardDecisionCode(payload.code, payload.approved === true),
      reason: textField(payload.reason, 240) || "Provider decision returned.",
    };
  }
}

export function getBankingProvider() {
  const readiness = getNeobankReadiness();
  const adapter = getProviderAdapterConfig();

  if (readiness.liveMoneyReady && adapter.ok) {
    return new HttpJsonBankingProvider();
  }

  return new GatedBankingProvider(readiness);
}
