import * as Crypto from "expo-crypto";
import { useCallback, useRef } from "react";

type Attempt = {
  fingerprint: string;
  key: string;
};

export function idempotencyKey(prefix: string) {
  return `${prefix}-${Crypto.randomUUID()}`;
}

export function useIdempotencyAttempt(prefix: string) {
  const attempt = useRef<Attempt | null>(null);

  const keyFor = useCallback(
    (payload: unknown) => {
      const fingerprint = JSON.stringify(payload);

      if (!attempt.current || attempt.current.fingerprint !== fingerprint) {
        attempt.current = {
          fingerprint,
          key: idempotencyKey(prefix),
        };
      }

      return attempt.current.key;
    },
    [prefix],
  );

  const complete = useCallback(() => {
    attempt.current = null;
  }, []);

  return { complete, keyFor };
}
