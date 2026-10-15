import "server-only";

import type { RateLimitStore } from "@lemnaria/persistence";

import {
  readDigester,
  type DigesterOutcome,
} from "@/lib/server/digest/digest-secret";
import { reportE2ePolicyInUse } from "@/lib/server/design-failure-log";
import {
  subjectOfNetworkBlock,
  type BucketSubject,
} from "@/lib/server/rate-limit/bucket-subject";
import {
  enforceRateLimit,
  type PolicyStep,
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
export async function judgeBlockBucket(
  request: BlockBucketRequest,
): Promise<RateLimitDecision> {
  const { network } = request;
  if (network.status === "misconfigured") {
    return { kind: "unavailable", cause: "source-misconfigured" };
  }
  return judgeSubjectBucket(request, () =>
    subjectOfNetworkBlock(network.block),
  );
}

/**
 * Counts one hit for a subject handed in, under the request's policy, with its secret, store, instant and deadline: the
 * one rule for every bucket a judge counts, the block's and a subject's of its own alike. A policy that cannot be
 * chosen is answered before anything is made or asked, and the first time an e2e twin decides in a process one line
 * says its figure is not the production one. The subject is made only when this is called, through its constructor, so
 * a text a constructor refuses is a judgement that failed and nothing is counted for it.
 */
export async function judgeSubjectBucket(
  { policy, digester, store, instant, deadlineMs }: BlockBucketRequest,
  makeSubject: () => BucketSubject,
): Promise<RateLimitDecision> {
  if (policy.status === "unavailable") {
    return { kind: "unavailable", cause: "policy-misconfigured" };
  }
  if (isE2eTwin(policy.policy)) reportE2ePolicyInUse();
  return enforceRateLimit({
    subject: makeSubject(),
    digester,
    policy: policy.policy,
    store,
    instant,
    deadlineMs,
  });
}

/** The step of a sequence that counts the network's block, under the request's policy. */
export function blockStep(request: BlockBucketRequest): PolicyStep {
  return { policy: request.policy, judge: () => judgeBlockBucket(request) };
}

/** The step that counts a subject of its own, made through its constructor only when the step is asked. */
export function subjectStep(
  request: BlockBucketRequest,
  makeSubject: () => BucketSubject,
): PolicyStep {
  return {
    policy: request.policy,
    judge: () => judgeSubjectBucket(request, makeSubject),
  };
}
