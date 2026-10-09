import "server-only";

import {
  readDigester,
  type DigesterOutcome,
} from "@/lib/server/digest/digest-secret";
import { reportE2eMintPolicyInUse } from "@/lib/server/design-failure-log";
import { subjectOfNetworkBlock } from "@/lib/server/rate-limit/bucket-subject";
import {
  enforceRateLimit,
  RATE_LIMIT_DEADLINE_MS,
  type RateLimitDecision,
} from "@/lib/server/rate-limit/enforce-rate-limit";
import {
  choosePolicy,
  E2E_MINT_POLICY_NAME,
  type PolicyChoice,
} from "@/lib/server/rate-limit/limit-policy";
import {
  identifyClientNetwork,
  selectNetworkSource,
  type ClientNetwork,
  type HeaderReader,
} from "@/lib/server/rate-limit/network-source";
import { getRateLimitStore } from "@/lib/server/rate-limit/rate-limit-store-instance";

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
  const policy = choosePolicy(environment, "mint");
  if (isE2ePolicy(policy)) reportE2eMintPolicyInUse();
  const network = identifyClientNetwork(
    selectNetworkSource(environment),
    headers,
  );
  const decision = await judgeBucket({
    network,
    policy,
    digester: readDigester(environment),
  });
  return { decision, policy };
}

interface MintBucket {
  readonly network: ClientNetwork;
  readonly policy: PolicyChoice;
  readonly digester: DigesterOutcome;
}

async function judgeBucket({
  network,
  policy,
  digester,
}: MintBucket): Promise<RateLimitDecision> {
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
    store: { recordHits: (buckets) => getRateLimitStore().recordHits(buckets) },
    instant: new Date(),
    deadlineMs: RATE_LIMIT_DEADLINE_MS,
  });
}

function isE2ePolicy(choice: PolicyChoice): boolean {
  return (
    choice.status === "chosen" && choice.policy.name === E2E_MINT_POLICY_NAME
  );
}
