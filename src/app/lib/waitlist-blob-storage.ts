import { put, type PutBlobResult } from "@vercel/blob";

export type WaitlistBlobSubmission = {
  createdAt: string;
  email: string;
  submissionId: string;
};

type PutBlob = typeof put;

let putBlobForTest: PutBlob | null = null;

export function setWaitlistBlobPutForTest(putBlob: PutBlob | null) {
  putBlobForTest = putBlob;
}

export function cleanBlobStoragePrefix(value: string) {
  return (
    value
      .trim()
      .replace(/[^A-Za-z0-9:_/-]/g, "")
      .replace(/[:/]+/g, "/")
      .replace(/^\/+|\/+$/g, "")
      .slice(0, 100) || "payshield/waitlist"
  );
}

export function waitlistBlobPathname({
  prefix = "payshield:waitlist",
  submissionId,
}: {
  prefix?: string;
  submissionId: string;
}) {
  const safeSubmissionId = submissionId
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 80);

  if (!safeSubmissionId) {
    throw new Error("A submissionId is required for Blob waitlist storage.");
  }

  return `${cleanBlobStoragePrefix(prefix)}/leads/${safeSubmissionId}.json`;
}

export async function putWaitlistBlob({
  data,
  prefix = "payshield:waitlist",
  token,
}: {
  data: WaitlistBlobSubmission;
  prefix?: string;
  token?: string;
}): Promise<PutBlobResult> {
  const pathname = waitlistBlobPathname({
    prefix,
    submissionId: data.submissionId,
  });
  const putBlob = putBlobForTest ?? put;

  return putBlob(pathname, JSON.stringify(data), {
    access: "private",
    allowOverwrite: false,
    contentType: "application/json",
    token,
  });
}
