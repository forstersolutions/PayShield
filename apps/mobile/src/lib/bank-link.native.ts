import {
  createPlaidLinkSession,
  type LinkExit,
  type LinkSuccess,
} from "react-native-plaid-link-sdk";

export async function openBankLink({
  linkToken,
  onSuccess,
}: {
  linkToken: string;
  onSuccess: (result: LinkSuccess) => Promise<void>;
}) {
  return new Promise<{ connected: boolean }>((resolve, reject) => {
    void createPlaidLinkSession({
      onEvent: () => undefined,
      onExit: (result: LinkExit) => {
        if (result.error) {
          reject(new Error(result.error.displayMessage || "Bank connection could not be completed."));
        } else {
          resolve({ connected: false });
        }
      },
      onSuccess: (result: LinkSuccess) => {
        void onSuccess(result).then(() => resolve({ connected: true })).catch(reject);
      },
      token: linkToken,
    })
      .then((session) => session.open(true))
      .catch(reject);
  });
}
