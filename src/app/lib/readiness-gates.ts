export function friendlyGateLabel(gate: string) {
  const value = gate.trim();

  if (!value) {
    return "Setup gate";
  }

  if (
    value.includes("TOKEN_VAULT_WEBHOOK_URL or PAYSHIELD_CORE_API_URL") ||
    (value.includes("TOKEN_VAULT") && value.includes("PAYSHIELD_CORE_API_URL"))
  ) {
    return "Token custody receiver";
  }

  if (value === "core_service_auth") {
    return "Server-side operation boundary";
  }

  if (value.includes("STRIPE_SECRET_KEY")) {
    return "Stripe API key";
  }

  if (value.includes("STRIPE_WEBHOOK_SECRET")) {
    return "Stripe webhook signing";
  }

  if (value.includes("PAYSHIELD_COMMERCIAL_PRICE_ID")) {
    return "Checkout price or payment link";
  }

  if (value.includes("PAYSHIELD_CORE_API_URL")) {
    return "Money-control runtime";
  }

  if (value.includes("PAYSHIELD_CORE_SERVICE_TOKEN")) {
    return "Remote runtime authentication";
  }

  if (value.includes("live-mode") || value.includes("Stripe live-mode")) {
    return "Live Stripe mode";
  }

  if (value.includes("PLAID_CLIENT_ID") || value.includes("PLAID_SECRET")) {
    return "Plaid credentials";
  }

  if (value.includes("TOKEN_VAULT_ENCRYPTION_KEY")) {
    return "Token custody encryption key";
  }

  if (value.includes("TOKEN_VAULT_WEBHOOK")) {
    return "Signed token-vault handoff";
  }

  if (value.includes("TOKEN_VAULT") || value.includes("token vault")) {
    return "Token vault custody";
  }

  if (value.includes("PROVIDER_WEBHOOK")) {
    return "Provider webhook signing";
  }

  if (value.includes("PAYSHIELD_BAAS_ADAPTER")) {
    return "Provider adapter type";
  }

  if (value.includes("PAYSHIELD_BAAS_API_BASE_URL")) {
    return "Provider adapter URL";
  }

  if (value.includes("PAYSHIELD_BAAS_API_KEY")) {
    return "Provider API key";
  }

  if (value.includes("PAYSHIELD_BAAS_PROVIDER")) {
    return "Provider name";
  }

  if (
    value.includes("TRANSFER") ||
    value.includes("transfer") ||
    value.includes("transfer/BaaS")
  ) {
    return "Transfer rail credentials";
  }

  if (value === "provider_adapter") {
    return "Provider adapter";
  }

  if (value === "provider_contract") {
    return "Provider contract";
  }

  if (value === "provider_credentials") {
    return "Provider credentials";
  }

  if (value === "sponsor_disclosures") {
    return "Approved sponsor disclosures";
  }

  if (value === "counsel_signoff") {
    return "Counsel signoff";
  }

  if (value === "operations_runbooks") {
    return "Operations runbooks";
  }

  if (value === "postgres_ledger") {
    return "Verified Supabase ledger";
  }

  if (value === "dedicated_backend") {
    return "Vercel money-control runtime";
  }

  if (value === "clerk_auth") {
    return "Clerk authentication";
  }

  return value.replace(/^PAYSHIELD_/, "").replace(/_/g, " ").toLowerCase();
}

export function gateCategory(gate: string) {
  if (gate.includes("STRIPE") || gate.includes("COMMERCIAL")) {
    return "Revenue";
  }

  if (
    gate.includes("PLAID") ||
    gate.includes("TOKEN_VAULT") ||
    gate.includes("token vault")
  ) {
    return "Bank link";
  }

  if (gate.includes("TRANSFER") || gate.includes("BaaS")) {
    return "Movement";
  }

  if (
    [
      "provider_contract",
      "provider_credentials",
      "sponsor_disclosures",
      "counsel_signoff",
      "operations_runbooks",
      "postgres_ledger",
      "dedicated_backend",
      "core_service_auth",
      "clerk_auth",
    ].includes(gate)
  ) {
    return "Live control";
  }

  return "Setup";
}

export function uniqueFriendlyGateLabels(gates: string[]) {
  return [...new Set(gates.map(friendlyGateLabel))].filter(Boolean);
}
