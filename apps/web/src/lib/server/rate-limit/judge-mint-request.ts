import "server-only";

import { readDigester } from "@/lib/server/digest/digest-secret";
import { reportE2eMintPolicyInUse } from "@/lib/server/design-failure-log";
import {
  RATE_LIMIT_DEADLINE_MS,
  type RateLimitDecision,
} from "@/lib/server/rate-limit/enforce-rate-limit";
import { judgeBlockBucket } from "@/lib/server/rate-limit/judge-block-bucket";
import {
  choosePolicy,
  E2E_MINT_POLICY_NAME,
  type PolicyChoice,
} from "@/lib/server/rate-limit/limit-policy";
import {
  identifyClientNetwork,
  selectNetworkSource,
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
  const decision = await judgeBlockBucket({
    network,
    policy,
    digester: readDigester(environment),
    store: { recordHits: (buckets) => getRateLimitStore().recordHits(buckets) },
    instant: new Date(),
    deadlineMs: RATE_LIMIT_DEADLINE_MS,
  });
  return { decision, policy };
}

function isE2ePolicy(choice: PolicyChoice): boolean {
  return (
    choice.status === "chosen" && choice.policy.name === E2E_MINT_POLICY_NAME
  );
}
