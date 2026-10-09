import "server-only";

import type { RateLimitStore } from "@lemnaria/persistence";

import type { DigesterOutcome } from "@/lib/server/digest/digest-secret";
import { subjectOfNetworkBlock } from "@/lib/server/rate-limit/bucket-subject";
import {
  enforceRateLimit,
  type RateLimitDecision,
} from "@/lib/server/rate-limit/enforce-rate-limit";
import type { PolicyChoice } from "@/lib/server/rate-limit/limit-policy";
import type { ClientNetwork } from "@/lib/server/rate-limit/network-source";

export interface BlockBucketRequest {
  readonly network: ClientNetwork;
  readonly policy: PolicyChoice;
  readonly digester: DigesterOutcome;
  readonly store: Pick<RateLimitStore, "recordHits">;
  readonly instant: Date;
  readonly deadlineMs: number;
}

/**
 * Counts one hit in the client network's bucket. A source or a flag that is misconfigured is answered before the
 * secret, the window or the store is asked, the source first. The environment, the clock and the store are handed in,
 * so every judge that limits by block asks them in its own request and in one order.
 */
export async function judgeBlockBucket({
  network,
  policy,
  digester,
  store,
  instant,
  deadlineMs,
}: BlockBucketRequest): Promise<RateLimitDecision> {
  if (network.status === "misconfigured") {
    return { kind: "unavailable", cause: "source-misconfigured" };
  }
  if (policy.status === "unavailable") {
    return { kind: "unavailable", cause: "policy-misconfigured" };
  }
  return enforceRateLimit({
    subject: subjectOfNetworkBlock(network.block),
    digester,
    policy: policy.policy,
    store,
    instant,
    deadlineMs,
  });
}
