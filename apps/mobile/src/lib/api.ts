import { appConfig } from "@/lib/config";
import { demoRequest } from "@/lib/demo-data";
import type { ApiFailure } from "@/lib/types";

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status = 0, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type ApiRequestOptions = {
  body?: unknown;
  demo?: boolean;
  method?: "DELETE" | "GET" | "PATCH" | "POST";
  token?: string | null;
};

function publicMessage(status: number, payload: ApiFailure) {
  if (status === 401) return "Your session expired. Sign in again to continue.";
  if (status === 403) return "This action needs additional account approval.";
  if (status === 409) return payload.error ?? payload.message ?? "That change conflicts with newer account activity.";
  if (status === 422) return payload.error ?? payload.message ?? "Check the details and try again.";
  if (status === 429) return "Too many attempts. Wait a moment and try again.";
  if (status >= 500) return "This action is unavailable right now. Your money was not changed.";
  return payload.error ?? payload.message ?? "The request could not be completed.";
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}) {
  const method = options.method ?? "GET";
  if (options.demo) return demoRequest<T>(path, method, options.body);

  if (!options.token) {
    throw new ApiError("Sign in to continue.", 401, "missing_session");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(`${appConfig.apiBaseUrl}${path}`, {
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${options.token}`,
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      },
      method,
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as T & ApiFailure;

    if (!response.ok) {
      throw new ApiError(publicMessage(response.status, payload), response.status, payload.code);
    }

    return payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError("PayShield took too long to respond. Nothing was changed.", 0, "timeout");
    }
    throw new ApiError("PayShield could not reach the service. Check your connection and try again.", 0, "network_error");
  } finally {
    clearTimeout(timeout);
  }
}

