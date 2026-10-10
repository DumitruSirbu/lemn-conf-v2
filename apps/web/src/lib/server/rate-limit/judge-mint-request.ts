import "server-only";

import {
  RATE_LIMIT_DEADLINE_MS,
  type RateLimitDecision,
} from "@/lib/server/rate-limit/enforce-rate-limit";
import {
  blockBucketRequestFor,
  judgeBlockBucket,
} from "@/lib/server/rate-limit/judge-block-bucket";
import type { PolicyChoice } from "@/lib/server/rate-limit/limit-policy";
import type { HeaderReader } from "@/lib/server/rate-limit/network-source";

export interface MintJudgement {
  readonly decision: RateLimitDecision;
  readonly policy: PolicyChoice;
}

/**
 * Judges one mint. The process environment is asked here, inside the request, and never at module level: the block is
 * read from the request's own headers, and the store is made when the first hit is counted. Whatever goes wrong is
 * unavailable. A source or a flag that is misconfigured is answered before the secret, the window or the store is
 * asked, the source first.
 */
export async function judgeMintRequest(
  headers: HeaderReader,
): Promise<MintJudgement> {
  const environment = process.env;
  const request = blockBucketRequestFor({
    environment,
    headers,
    purpose: "mint",
    deadlineMs: RATE_LIMIT_DEADLINE_MS,
    instant: new Date(),
  });
  return { decision: await judgeBlockBucket(request), policy: request.policy };
}
