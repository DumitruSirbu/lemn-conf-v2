import "server-only";

import type { NextResponse } from "next/server";

import { readDigester } from "@/lib/server/digest/digest-secret";
import {
  reportShareWriteLimit,
  type ShareWriteOperation,
} from "@/lib/server/design-failure-log";
import {
  RATE_LIMIT_DEADLINE_MS,
  type RateLimitDecision,
} from "@/lib/server/rate-limit/enforce-rate-limit";
import { judgeBlockBucket } from "@/lib/server/rate-limit/judge-block-bucket";
import {
  choosePolicy,
  type PolicyChoice,
} from "@/lib/server/rate-limit/limit-policy";
import {
  identifyClientNetwork,
  selectNetworkSource,
  type HeaderReader,
} from "@/lib/server/rate-limit/network-source";
import { getRateLimitStore } from "@/lib/server/rate-limit/rate-limit-store-instance";
import {
  shareLimitReachedResponse,
  shareUnavailableResponse,
} from "@/lib/server/rate-limit/rate-limited-response";

export interface ShareWriteJudgement {
  readonly decision: RateLimitDecision;
  readonly policy: PolicyChoice;
}

/**
 * Judges one creation or revocation of a share link, by the network's block. The process environment is asked here,
 * inside the request. A write fails closed: whatever cannot be judged is unavailable, and so nothing is changed.
 */
export async function judgeShareWrite(
  headers: HeaderReader,
): Promise<ShareWriteJudgement> {
  const environment = process.env;
  const policy = choosePolicy(environment, "share-write");
  const decision = await judgeBlockBucket({
    network: identifyClientNetwork(selectNetworkSource(environment), headers),
    policy,
    digester: readDigester(environment),
    store: { recordHits: (buckets) => getRateLimitStore().recordHits(buckets) },
    instant: new Date(),
    deadlineMs: RATE_LIMIT_DEADLINE_MS,
  });
  return { decision, policy };
}

/**
 * The answer that stops a share write, or nothing when it may go on. Asked after the credentials are known to be
 * present and before the repository is: a refusal reads no body, changes no link and sets no cookie. Nothing thrown
 * here is kept: it answers as unavailable.
 */
export async function refusalOfShareWriteLimit(
  headers: HeaderReader,
  operation: ShareWriteOperation,
): Promise<NextResponse | undefined> {
  try {
    const { decision, policy } = await judgeShareWrite(headers);
    if (decision.kind === "allow") return undefined;
    if (decision.kind === "refuse") {
      const response = shareLimitReachedResponse(decision.retryAfterSeconds);
      reportShareWriteLimit({
        kind: "refused",
        operation,
        policy: policy.status === "chosen" ? policy.policy.name : "none",
      });
      return response;
    }
    reportShareWriteLimit({
      kind: "unavailable",
      operation,
      cause: decision.cause,
    });
  } catch {
    reportShareWriteLimit({
      kind: "unavailable",
      operation,
      cause: "judgement-failed",
    });
  }
  return shareUnavailableResponse();
}
