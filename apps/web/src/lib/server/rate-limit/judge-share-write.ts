import "server-only";

import type { NextResponse } from "next/server";

import {
  reportShareWriteLimit,
  type ShareWriteOperation,
} from "@/lib/server/design-failure-log";
import { RATE_LIMIT_DEADLINE_MS } from "@/lib/server/rate-limit/enforce-rate-limit";
import {
  blockBucketRequestFor,
  judgeBlockBucket,
} from "@/lib/server/rate-limit/judge-block-bucket";
import type { HeaderReader } from "@/lib/server/rate-limit/network-source";
import {
  refusalOfWriteLimit,
  type WriteJudgement,
} from "@/lib/server/rate-limit/refusal-of-write-limit";
import {
  shareLimitReachedResponse,
  shareUnavailableResponse,
} from "@/lib/server/rate-limit/rate-limited-response";

export type ShareWriteJudgement = WriteJudgement;

/**
 * Judges one creation or revocation of a share link, by the network's block. The process environment is asked here,
 * inside the request. A write fails closed: whatever cannot be judged is unavailable, and so nothing is changed.
 */
export async function judgeShareWrite(
  headers: HeaderReader,
): Promise<ShareWriteJudgement> {
  const environment = process.env;
  const request = blockBucketRequestFor({
    environment,
    headers,
    purpose: "share-write",
    deadlineMs: RATE_LIMIT_DEADLINE_MS,
    instant: new Date(),
  });
  return { decision: await judgeBlockBucket(request), policy: request.policy };
}

/**
 * The answer that stops a share write, or nothing when it may go on. Asked after the credentials are known to be
 * present and before the repository is: a refusal reads no body, changes no link and sets no cookie. Nothing thrown
 * here is kept: it answers as unavailable.
 */
export function refusalOfShareWriteLimit(
  headers: HeaderReader,
  operation: ShareWriteOperation,
): Promise<NextResponse | undefined> {
  return refusalOfWriteLimit(() => judgeShareWrite(headers), {
    refused: shareLimitReachedResponse,
    unavailable: shareUnavailableResponse,
    reportRefused: (policy) => {
      reportShareWriteLimit({ kind: "refused", operation, policy });
    },
    reportUnavailable: (cause) => {
      reportShareWriteLimit({ kind: "unavailable", operation, cause });
    },
  });
}
