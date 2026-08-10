import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/lib/api";
import type { MoneyProfileResponse, OperationsPacket } from "@/lib/types";
import { useSession } from "@/providers/session-provider";

export function usePayShieldApi() {
  const session = useSession();

  return async function request<T>(
    path: string,
    options: { body?: unknown; method?: "DELETE" | "GET" | "PATCH" | "POST" } = {},
  ) {
    const token = await session.getToken();
    return apiRequest<T>(path, {
      ...options,
      demo: session.isDemo,
      token,
    });
  };
}

export function useOperations() {
  const session = useSession();
  const request = usePayShieldApi();
  return useQuery({
    enabled: session.isLoaded && session.isSignedIn,
    queryFn: () => request<OperationsPacket>("/api/app/operations"),
    queryKey: ["operations", session.userId],
  });
}

export function useMoneyProfile() {
  const session = useSession();
  const request = usePayShieldApi();
  return useQuery({
    enabled: session.isLoaded && session.isSignedIn,
    queryFn: () => request<MoneyProfileResponse>("/api/app/money-profile"),
    queryKey: ["money-profile", session.userId],
  });
}

export function usePayShieldMutation<TResponse = unknown, TVariables = unknown>(
  path: string,
  method: "DELETE" | "PATCH" | "POST" = "POST",
) {
  const request = usePayShieldApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: TVariables) => request<TResponse>(path, { body, method }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["operations"] });
      if (path.includes("money-profile")) {
        await queryClient.invalidateQueries({ queryKey: ["money-profile"] });
      }
    },
  });
}

