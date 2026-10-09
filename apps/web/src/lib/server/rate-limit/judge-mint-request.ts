import "server-only";

import { readDigester } from "@/lib/server/digest/digest-secret";
import {
  enforceRateLimit,
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
  type HeaderReader,
} from "@/lib/server/rate-limit/network-source";
import { reportE2eMintPolicyInUse } from "@/lib/server/design-failure-log";
import { getRateLimitStore } from "@/lib/server/repository";

export interface MintJudgement {
  readonly decision: RateLimitDecision;
  readonly policy: PolicyChoice;
}

/**
 * Judges one mint. The process environment is asked here, inside the request, and never at module level: the block is
 * read from the request's own headers, and the store is made when the first hit is counted. Whatever goes wrong is
 * unavailable.
 */
export async function judgeMintRequest(
  headers: HeaderReader,
): Promise<MintJudgement> {
  const environment = process.env;
  const policy = choosePolicy(environment);
  if (
    policy.status === "chosen" &&
    policy.policy.name === E2E_MINT_POLICY_NAME
  ) {
    reportE2eMintPolicyInUse();
  }
  const decision = await enforceRateLimit({
    network: identifyClientNetwork(selectNetworkSource(environment), headers),
    digester: readDigester(environment),
    policy,
    store: { recordHits: (buckets) => getRateLimitStore().recordHits(buckets) },
    instant: new Date(),
  });
  return { decision, policy };
}
