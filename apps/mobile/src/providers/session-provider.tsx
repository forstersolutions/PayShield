import { ClerkProvider, useAuth, useClerk, useUser } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type PropsWithChildren,
} from "react";

import { appConfig, authConfigured } from "@/lib/config";

type SessionContextValue = {
  displayName: string;
  email: string;
  getToken: () => Promise<string | null>;
  isConfigured: boolean;
  isDemo: boolean;
  isLoaded: boolean;
  isSignedIn: boolean;
  signOut: () => Promise<void>;
  userId: string | null;
};

const defaultSession: SessionContextValue = {
  displayName: "PayShield household",
  email: "",
  getToken: async () => null,
  isConfigured: false,
  isDemo: false,
  isLoaded: true,
  isSignedIn: false,
  signOut: async () => undefined,
  userId: null,
};

const SessionContext = createContext<SessionContextValue>(defaultSession);

function ClerkSessionBridge({ children }: PropsWithChildren) {
  const auth = useAuth();
  const { signOut } = useClerk();
  const { user } = useUser();
  const getToken = useCallback(() => auth.getToken(), [auth]);
  const value = useMemo<SessionContextValue>(
    () => ({
      displayName: user?.fullName || user?.firstName || "PayShield household",
      email: user?.primaryEmailAddress?.emailAddress ?? "",
      getToken,
      isConfigured: true,
      isDemo: false,
      isLoaded: auth.isLoaded,
      isSignedIn: Boolean(auth.isSignedIn),
      signOut: async () => {
        await signOut();
      },
      userId: auth.userId ?? null,
    }),
    [auth.isLoaded, auth.isSignedIn, auth.userId, getToken, signOut, user],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

function LocalSessionProvider({ children }: PropsWithChildren) {
  const value = useMemo<SessionContextValue>(
    () =>
      appConfig.demoMode
        ? {
            displayName: "The Forster Household",
            email: "household@example.com",
            getToken: async () => "local-demo-token",
            isConfigured: false,
            isDemo: true,
            isLoaded: true,
            isSignedIn: true,
            signOut: async () => undefined,
            userId: "review_user",
          }
        : defaultSession,
    [],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function SessionProvider({ children }: PropsWithChildren) {
  if (!authConfigured) {
    return <LocalSessionProvider>{children}</LocalSessionProvider>;
  }

  return (
    <ClerkProvider publishableKey={appConfig.clerkPublishableKey} tokenCache={tokenCache}>
      <ClerkSessionBridge>{children}</ClerkSessionBridge>
    </ClerkProvider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}

