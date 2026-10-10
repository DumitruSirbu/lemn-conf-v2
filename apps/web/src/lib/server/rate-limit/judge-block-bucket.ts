import "server-only";

import type { RateLimitStore } from "@lemnaria/persistence";

import {
  readDigester,
  type DigesterOutcome,
} from "@/lib/server/digest/digest-secret";
import { reportE2ePolicyInUse } from "@/lib/server/design-failure-log";
import { subjectOfNetworkBlock } from "@/lib/server/rate-limit/bucket-subject";
import {
  enforceRateLimit,
  type RateLimitDecision,
} from "@/lib/server/rate-limit/enforce-rate-limit";
import {
  choosePolicy,
  isE2eTwin,
  type PolicyChoice,
  type PolicyPurpose,
} from "@/lib/server/rate-limit/limit-policy";
import {
  identifyClientNetwork,
  selectNetworkSource,
  type ClientNetwork,
  type HeaderReader,
  type NetworkEnvironment,
} from "@/lib/server/rate-limit/network-source";
import { getRateLimitStore } from "@/lib/server/rate-limit/rate-limit-store-instance";

export interface BlockBucketRequest {
  readonly network: ClientNetwork;
  readonly policy: PolicyChoice;
  readonly digester: DigesterOutcome;
  readonly store: Pick<RateLimitStore, "recordHits">;
  readonly instant: Date;
  readonly deadlineMs: number;
}

/** What a judge hands over: the environment and the clock, read inside its request, the request's own headers, and the
 *  purpose and the deadline that are its own. */
export interface BlockBucketAsk {
  readonly environment: NetworkEnvironment;
  readonly headers: HeaderReader;
  readonly purpose: PolicyPurpose;
  readonly deadlineMs: number;
  readonly instant: Date;
}

/** The one maker of a block judge's request, so that the mint, a share write and a read ask the same way. The store is
 *  made when the first hit is counted and not before. */
export function blockBucketRequestFor({
  environment,
  headers,
  purpose,
  deadlineMs,
  instant,
}: BlockBucketAsk): BlockBucketRequest {
  return {
    network: identifyClientNetwork(selectNetworkSource(environment), headers),
    policy: choosePolicy(environment, purpose),
    digester: readDigester(environment),
    store: { recordHits: (buckets) => getRateLimitStore().recordHits(buckets) },
    instant,
    deadlineMs,
  };
}

/**
 * Counts one hit in the client network's bucket. A source or a flag that is misconfigured is answered before the
 * secret, the window or the store is asked, the source first. The first time an e2e twin decides in a process, one
 * line says its figure is not the production one. The environment, the clock and the store are handed in,
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
  if (isE2eTwin(policy.policy)) reportE2ePolicyInUse();
  return enforceRateLimit({
    subject: subjectOfNetworkBlock(network.block),
    digester,
    policy: policy.policy,
    store,
    instant,
    deadlineMs,
  });
}
