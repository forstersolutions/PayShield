import { NextResponse } from "next/server.js";
import { getAppSession, type AppSession } from "./auth.ts";

export class OperatorAccessDeniedError extends Error {
  constructor() {
    super("Operator access required");
    this.name = "OperatorAccessDeniedError";
  }
}

function envTrue(name: string) {
  return process.env[name]?.trim().toLowerCase() === "true";
}

function envList(name: string) {
  return new Set(
    (process.env[name] || "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function operatorSessionAllowed(session: AppSession) {
  if (session.authMode === "demo") {
    return envTrue("PAYSHIELD_ALLOW_OPERATOR_REVIEW_ACCESS");
  }

  const operatorEmails = envList("PAYSHIELD_OPERATOR_EMAILS");
  const operatorUserIds = envList("PAYSHIELD_OPERATOR_USER_IDS");

  return (
    operatorEmails.has(session.email.trim().toLowerCase()) ||
    operatorUserIds.has(
      (session.clerkSubject || session.userId).trim().toLowerCase(),
    )
  );
}

export async function getOperatorSession() {
  const session = await getAppSession();

  if (!operatorSessionAllowed(session)) {
    throw new OperatorAccessDeniedError();
  }

  return session;
}

export function operatorAccessDeniedResponse(error: unknown) {
  if (!(error instanceof OperatorAccessDeniedError)) {
    return null;
  }

  return NextResponse.json(
    {
      error: "Forbidden",
      service: "payshield-operator-access",
    },
    {
      headers: {
        "cache-control": "no-store",
      },
      status: 403,
    },
  );
}
