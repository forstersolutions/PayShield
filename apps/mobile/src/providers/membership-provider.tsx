import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesPackage,
} from "react-native-purchases";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { Platform } from "react-native";

import { appConfig } from "@/lib/config";
import { useSession } from "@/providers/session-provider";

type MembershipContextValue = {
  active: boolean;
  available: boolean;
  error: string;
  loading: boolean;
  manage: () => Promise<void>;
  price: string;
  purchase: () => Promise<boolean>;
  refresh: () => Promise<void>;
  restore: () => Promise<boolean>;
};

const MembershipContext = createContext<MembershipContextValue>({
  active: false,
  available: false,
  error: "",
  loading: false,
  manage: async () => undefined,
  price: "$19/month",
  purchase: async () => false,
  refresh: async () => undefined,
  restore: async () => false,
});

let configured = false;
let configuredUserId = "";

function hasEntitlement(customerInfo: Awaited<ReturnType<typeof Purchases.getCustomerInfo>>) {
  return Boolean(customerInfo.entitlements.active[appConfig.revenueCatEntitlementId]);
}

export function MembershipProvider({ children }: PropsWithChildren) {
  const session = useSession();
  const [active, setActive] = useState(session.isDemo);
  const [available, setAvailable] = useState(session.isDemo);
  const [currentPackage, setCurrentPackage] = useState<PurchasesPackage | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [price, setPrice] = useState("$19/month");

  const refresh = useCallback(async () => {
    if (session.isDemo) {
      setActive(true);
      setAvailable(true);
      return;
    }

    if (
      Platform.OS === "web" ||
      !session.userId ||
      !appConfig.revenueCatApiKey
    ) {
      setAvailable(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      if (!configured) {
        Purchases.configure({
          apiKey: appConfig.revenueCatApiKey,
          appUserID: session.userId,
        });
        configured = true;
        configuredUserId = session.userId;
        if (__DEV__) await Purchases.setLogLevel(LOG_LEVEL.DEBUG);
      } else if (configuredUserId !== session.userId) {
        await Purchases.logIn(session.userId);
        configuredUserId = session.userId;
      }

      const [offerings, customerInfo] = await Promise.all([
        Purchases.getOfferings(),
        Purchases.getCustomerInfo(),
      ]);
      const purchasePackage =
        offerings.current?.monthly ??
        offerings.current?.availablePackages[0] ??
        null;
      setCurrentPackage(purchasePackage);
      setPrice(purchasePackage?.product.priceString ?? "$19/month");
      setActive(hasEntitlement(customerInfo));
      setAvailable(Boolean(purchasePackage));
    } catch {
      setAvailable(false);
      setError("Membership details could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [session.isDemo, session.userId]);

  useEffect(() => {
    if (
      !session.isSignedIn ||
      session.isDemo ||
      Platform.OS === "web" ||
      !appConfig.revenueCatApiKey
    ) {
      return;
    }

    let listening = false;
    const listener = (customerInfo: CustomerInfo) => {
      setActive(hasEntitlement(customerInfo));
    };
    const refreshTimer = setTimeout(() => {
      void refresh().then(() => {
        if (!configured) return;
        Purchases.addCustomerInfoUpdateListener(listener);
        listening = true;
      });
    }, 0);

    return () => {
      clearTimeout(refreshTimer);
      if (listening) Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [refresh, session.isDemo, session.isSignedIn]);

  const purchase = useCallback(async () => {
    if (session.isDemo) {
      setActive(true);
      return true;
    }
    if (!currentPackage) return false;
    setLoading(true);
    setError("");
    try {
      const result = await Purchases.purchasePackage(currentPackage);
      const entitled = hasEntitlement(result.customerInfo);
      setActive(entitled);
      return entitled;
    } catch (purchaseError) {
      const canceled =
        typeof purchaseError === "object" &&
        purchaseError !== null &&
        "userCancelled" in purchaseError &&
        Boolean(purchaseError.userCancelled);
      if (!canceled) setError("The purchase could not be completed. You were not charged.");
      return false;
    } finally {
      setLoading(false);
    }
  }, [currentPackage, session.isDemo]);

  const restore = useCallback(async () => {
    if (session.isDemo) return true;
    if (!configured) return false;
    setLoading(true);
    setError("");
    try {
      const customerInfo = await Purchases.restorePurchases();
      const entitled = hasEntitlement(customerInfo);
      setActive(entitled);
      if (!entitled) setError("No active PayShield membership was found for this store account.");
      return entitled;
    } catch {
      setError("Purchases could not be restored.");
      return false;
    } finally {
      setLoading(false);
    }
  }, [session.isDemo]);

  const manage = useCallback(async () => {
    if (!session.isDemo && configured) await Purchases.showManageSubscriptions();
  }, [session.isDemo]);

  const value = useMemo(
    () => ({ active, available, error, loading, manage, price, purchase, refresh, restore }),
    [active, available, error, loading, manage, price, purchase, refresh, restore],
  );

  return <MembershipContext.Provider value={value}>{children}</MembershipContext.Provider>;
}

export function useMembership() {
  return useContext(MembershipContext);
}
