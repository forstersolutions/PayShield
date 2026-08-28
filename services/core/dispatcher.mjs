import {
  archivePayee,
  authorizeCard,
  cancelBillPayment,
  createBankLinkToken,
  createBillPayment,
  createCardManagementSession,
  createDirectDepositSetup,
  createPayee,
  createTransferIntent,
  createUnlock,
  detectPaycheck,
  disconnectBankConnection,
  exchangeBankPublicToken,
  getAccountClosureStatus,
  getBalances,
  getBankConnections,
  getBillingStatus,
  getBucketProfile,
  getCoreReadiness,
  getHouseholdActivation,
  getHouseholdAuditExport,
  getHouseholdControlPlan,
  getHouseholdMoneyProfile,
  getHouseholdOperations,
  getProfile,
  handleProviderWebhook,
  processAccountClosureRequests,
  processPlaidSyncJobs,
  receiveTokenVaultHandoff,
  recordBankConnection,
  recordCommercialBillingEvent,
  recordCommercialCheckoutIntent,
  recordProductionGateEvidence,
  requestAccountClosure,
  resolveReconciliationException,
  runAccountClosureWorker,
  saveBucketProfile,
  saveHouseholdMoneyProfile,
  saveHouseholdProtectionPlan,
  savePaycheckDetectionRule,
  setCardStatus,
  startOnboarding,
  startPayeeVerification,
  syncLinkedBankPaychecks,
  updatePayee,
} from "./product.mjs";

function cleanText(value, maxLength = 160) {
  return typeof value === "string"
    ? value.trim().replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").slice(0, maxLength)
    : "";
}

function normalizePath(path) {
  const pathname = String(path || "/").split("?", 1)[0];

  return pathname.startsWith("/api/") ? pathname.slice(4) : pathname;
}

function headerValue(headers, name) {
  if (!headers) {
    return "";
  }

  if (typeof headers.get === "function") {
    return cleanText(headers.get(name), name === "plaid-verification" ? 4_096 : 320);
  }

  const value = headers[name] ?? headers[name.toLowerCase()];

  return cleanText(value, name === "plaid-verification" ? 4_096 : 320);
}

function requestActor(input) {
  const session = input.session ?? {};

  return {
    authMode: cleanText(session.authMode, 40),
    clerkSubject: cleanText(session.clerkSubject, 160),
    email: cleanText(session.email, 160),
    name: cleanText(session.name, 120),
    operator: input.operator === true,
    userId: cleanText(session.userId, 160),
  };
}

function objectBody(body) {
  if (body === undefined || body === null || body === "") {
    return {};
  }

  if (typeof body === "string") {
    const parsed = JSON.parse(body);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new TypeError("Request body must be a JSON object.");
    }

    return parsed;
  }

  if (typeof body !== "object" || Array.isArray(body)) {
    throw new TypeError("Request body must be a JSON object.");
  }

  return body;
}

function bodyWithActor(input) {
  return {
    ...objectBody(input.body),
    __payshieldActor: requestActor(input),
  };
}

function signedBody(input) {
  const body = objectBody(input.body);

  return {
    ...body,
    __payshieldRawBody: input.rawBody || JSON.stringify(body),
    __payshieldSignature: headerValue(input.headers, "x-payshield-signature"),
  };
}

function providerBody(input, source) {
  const body = objectBody(input.body);

  return {
    ...body,
    __payshieldActor: requestActor(input),
    __payshieldPlaidVerification: headerValue(input.headers, "plaid-verification"),
    __payshieldProviderRawBody: input.rawBody || JSON.stringify(body),
    __payshieldProviderSignature: headerValue(
      input.headers,
      "x-payshield-provider-signature",
    ),
    ...(source === "plaid"
      ? {
          __payshieldProviderSource: "plaid",
          providerName: "plaid",
        }
      : {}),
  };
}

function response(body, status = 200, followup = null) {
  return { body, followup, status };
}

function followupFor(path, result) {
  if (
    path === "/plaid/webhooks" &&
    result?.status < 300 &&
    result?.body?.mode === "plaid_sync_queued"
  ) {
    return "plaid_sync";
  }

  if (
    path === "/app/account-closure" &&
    result?.status < 300 &&
    result?.body?.closure
  ) {
    return "account_closure";
  }

  return null;
}

export async function dispatchCoreRequest(input, env = process.env) {
  const method = String(input.method || "GET").toUpperCase();
  const path = normalizePath(input.path);
  const actor = requestActor(input);

  if (method === "GET" && path === "/health") {
    return response({ ok: true, service: "payshield-core", status: "healthy" });
  }

  if (method === "GET" && path === "/ready") {
    const readiness = getCoreReadiness(env, { coreOnline: true });

    return response(
      { readiness, service: "payshield-core" },
      readiness.liveMoneyReady ? 200 : 503,
    );
  }

  let result;

  if (method === "POST" && path === "/token-vault/plaid") {
    result = await receiveTokenVaultHandoff(signedBody(input), env);
  } else if (method === "POST" && path === "/card/authorize") {
    result = await authorizeCard(providerBody(input), env);
  } else if (method === "POST" && path === "/provider/webhooks") {
    result = await handleProviderWebhook(providerBody(input), env);
  } else if (method === "POST" && path === "/plaid/webhooks") {
    result = await handleProviderWebhook(providerBody(input, "plaid"), env);
  } else if (method === "GET" && path === "/app/me") {
    result = await getProfile(env, actor);
  } else if (method === "GET" && path === "/app/balances") {
    result = await getBalances(env, actor);
  } else if (method === "GET" && path === "/app/activation") {
    result = await getHouseholdActivation(env, actor);
  } else if (method === "GET" && path === "/app/billing/status") {
    result = await getBillingStatus(env, actor);
  } else if (method === "GET" && path === "/app/buckets") {
    result = await getBucketProfile(env, actor);
  } else if (method === "GET" && path === "/app/operations") {
    result = await getHouseholdOperations(env, actor);
  } else if (method === "GET" && path === "/app/control-plan") {
    result = await getHouseholdControlPlan(env, actor);
  } else if (method === "GET" && path === "/app/money-profile") {
    result = await getHouseholdMoneyProfile(env, actor);
  } else if (method === "GET" && path === "/app/audit/export") {
    result = await getHouseholdAuditExport(env, actor);
  } else if (method === "GET" && path === "/app/account-closure") {
    result = await getAccountClosureStatus(env, actor);
  } else if (method === "GET" && path === "/app/bank-connections") {
    result = await getBankConnections(env, actor);
  } else if (method === "POST" && path === "/app/buckets") {
    result = await saveBucketProfile(bodyWithActor(input), env);
  } else if (method === "POST" && path === "/app/control-plan") {
    const payload = bodyWithActor(input);
    result = await getHouseholdControlPlan(env, payload.__payshieldActor, payload);
  } else if (method === "POST" && path === "/app/money-profile") {
    result = await saveHouseholdMoneyProfile(bodyWithActor(input), env);
  } else if (method === "POST" && path === "/app/protection-plan") {
    result = await saveHouseholdProtectionPlan(bodyWithActor(input), env);
  } else if (method === "POST" && path === "/app/account-closure") {
    result = await requestAccountClosure(bodyWithActor(input), env);
  } else if (method === "POST" && path === "/app/bill-payments") {
    result = await createBillPayment(bodyWithActor(input), env);
  } else if (method === "POST" && path === "/app/bill-payments/cancel") {
    result = await cancelBillPayment(bodyWithActor(input), env);
  } else if (method === "POST" && path === "/app/billing/checkout") {
    result = await recordCommercialCheckoutIntent(bodyWithActor(input), env);
  } else if (method === "POST" && path === "/app/direct-deposit") {
    result = await createDirectDepositSetup(bodyWithActor(input), env);
  } else if (method === "POST" && path === "/app/bank-link/token") {
    result = await createBankLinkToken(bodyWithActor(input), env);
  } else if (method === "POST" && path === "/app/bank-link/exchange") {
    result = await exchangeBankPublicToken(bodyWithActor(input), env);
  } else if (method === "POST" && path === "/app/bank-connections") {
    result = await recordBankConnection(bodyWithActor(input), env);
  } else if (method === "DELETE" && path === "/app/bank-connections") {
    result = await disconnectBankConnection(bodyWithActor(input), env);
  } else if (method === "POST" && path === "/commercial/billing-events") {
    result = await recordCommercialBillingEvent(bodyWithActor(input), env);
  } else if (method === "POST" && path === "/app/onboarding/start") {
    result = await startOnboarding(env, actor);
  } else if (method === "POST" && path === "/app/payees") {
    result = await createPayee(bodyWithActor(input), env);
  } else if (method === "PATCH" && path === "/app/payees") {
    result = await updatePayee(bodyWithActor(input), env);
  } else if (method === "DELETE" && path === "/app/payees") {
    result = await archivePayee(bodyWithActor(input), env);
  } else if (method === "POST" && path === "/app/payees/verify") {
    result = await startPayeeVerification(bodyWithActor(input), env);
  } else if (method === "POST" && path === "/app/card/status") {
    result = await setCardStatus(bodyWithActor(input), env);
  } else if (method === "POST" && path === "/app/card/manage") {
    result = await createCardManagementSession(bodyWithActor(input), env);
  } else if (method === "POST" && path === "/app/paychecks/rules") {
    result = await savePaycheckDetectionRule(bodyWithActor(input), env);
  } else if (method === "POST" && path === "/app/paychecks/detect") {
    result = await detectPaycheck(bodyWithActor(input), env);
  } else if (method === "POST" && path === "/app/paychecks/sync") {
    result = await syncLinkedBankPaychecks(bodyWithActor(input), env);
  } else if (method === "POST" && path === "/app/transfers") {
    result = await createTransferIntent(bodyWithActor(input), env);
  } else if (method === "POST" && path === "/app/unlocks") {
    result = await createUnlock(bodyWithActor(input), env);
  } else if (method === "POST" && path === "/app/reconciliation/resolve") {
    result = await resolveReconciliationException(bodyWithActor(input), env);
  } else if (method === "POST" && path === "/launch/gate-evidence") {
    result = await recordProductionGateEvidence(bodyWithActor(input), env);
  } else if (method === "POST" && path === "/launch/account-closures/process") {
    result = await processAccountClosureRequests(bodyWithActor(input), env);
  } else {
    return response({ error: "Not found", service: "payshield-core" }, 404);
  }

  return {
    ...result,
    followup: followupFor(path, result),
  };
}

export async function runCoreFollowup(followup, env = process.env) {
  if (followup === "plaid_sync") {
    return processPlaidSyncJobs(env);
  }

  if (followup === "account_closure") {
    return runAccountClosureWorker(env);
  }

  return null;
}

export async function runCoreMaintenance(env = process.env) {
  const [accountClosures, plaidSync] = await Promise.allSettled([
    runAccountClosureWorker(env),
    processPlaidSyncJobs(env),
  ]);

  return {
    accountClosures:
      accountClosures.status === "fulfilled"
        ? accountClosures.value
        : { error: "Account closure processing failed." },
    plaidSync:
      plaidSync.status === "fulfilled"
        ? plaidSync.value
        : { error: "Linked-bank synchronization failed." },
  };
}
