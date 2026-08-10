import NetInfo from "@react-native-community/netinfo";
import {
  focusManager,
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore, type PropsWithChildren } from "react";
import { AppState, Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SessionProvider } from "@/providers/session-provider";
import { MembershipProvider } from "@/providers/membership-provider";
import { BiometricGate } from "@/components/biometric-gate";

onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(Boolean(state.isConnected))),
);

const subscribeToHydration = () => () => undefined;
const clientHydrated = () => true;
const serverHydrated = () => false;

export function AppProvider({ children }: PropsWithChildren) {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    clientHydrated,
    serverHydrated,
  );
  const webMounted = Platform.OS !== "web" || hydrated;
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          mutations: { retry: false },
          queries: {
            gcTime: 5 * 60 * 1000,
            refetchOnReconnect: true,
            retry: (count, error) => {
              const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 0;
              return status !== 401 && status !== 403 && count < 2;
            },
            staleTime: 15_000,
          },
        },
      }),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status) => {
      if (Platform.OS !== "web") focusManager.setFocused(status === "active");
    });
    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <SessionProvider>
        <QueryClientProvider client={queryClient}>
          <MembershipProvider>
            <BiometricGate>{webMounted ? children : null}</BiometricGate>
          </MembershipProvider>
        </QueryClientProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
