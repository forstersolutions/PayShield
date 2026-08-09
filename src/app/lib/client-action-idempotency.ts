export type ActionAttemptRef = {
  current: {
    fingerprint: string;
    key: string;
  } | null;
};

export function idempotencyKeyForAction(
  attempt: ActionAttemptRef,
  prefix: string,
  payload: unknown,
) {
  const fingerprint = JSON.stringify(payload);

  if (!attempt.current || attempt.current.fingerprint !== fingerprint) {
    attempt.current = {
      fingerprint,
      key: `${prefix}-${crypto.randomUUID()}`,
    };
  }

  return attempt.current.key;
}

export function completeActionAttempt(
  attempt: ActionAttemptRef,
  idempotencyKey: string,
) {
  if (attempt.current?.key === idempotencyKey) {
    attempt.current = null;
  }
}
