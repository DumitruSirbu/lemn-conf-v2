import "server-only";

import type { NextResponse } from "next/server";

import { reportReadLimitOnce } from "@/lib/server/design-failure-log";
import {
  RATE_LIMIT_READ_DEADLINE_MS,
  type UnavailableCause,
} from "@/lib/server/rate-limit/enforce-rate-limit";
import {
  blockBucketRequestFor,
  judgeBlockBucket,
} from "@/lib/server/rate-limit/judge-block-bucket";
import { policyNameOf } from "@/lib/server/rate-limit/limit-policy";
import {
  selectNetworkSource,
  type HeaderReader,
} from "@/lib/server/rate-limit/network-source";
import { readLimitReachedResponse } from "@/lib/server/rate-limit/rate-limited-response";

export type ReadJudgement =
  | { readonly kind: "serve" }
  | { readonly kind: "refuse"; readonly retryAfterSeconds: number };

const SERVE: ReadJudgement = Object.freeze({ kind: "serve" });

/**
 * Judges one read by the network's block. A read fails open: whatever cannot be judged, or is not judged in the
 * read's own 300 milliseconds, is served. Under no network source nothing is asked at all, no secret and no store,
 * since the one bucket the world shares would protect nothing and could stop every page. At most one line for a
 * process and a cause is written, never one for a request.
 */
export async function judgeReadRequest(
  headers: HeaderReader,
): Promise<ReadJudgement> {
  try {
    return await judgeUnlessNoSourceIsNamed(headers);
  } catch {
    return servedUnjudged("judgement-failed");
  }
}

async function judgeUnlessNoSourceIsNamed(
  headers: HeaderReader,
): Promise<ReadJudgement> {
  const environment = process.env;
  if (selectNetworkSource(environment).kind === "none") return SERVE;
  const request = blockBucketRequestFor({
    environment,
    headers,
    purpose: "read",
    deadlineMs: RATE_LIMIT_READ_DEADLINE_MS,
    instant: new Date(),
  });
  const decision = await judgeBlockBucket(request);
  if (decision.kind === "allow") return SERVE;
  if (decision.kind === "unavailable") return servedUnjudged(decision.cause);
  reportReadLimitOnce({
    kind: "refused",
    policy: policyNameOf(request.policy),
  });
  return { kind: "refuse", retryAfterSeconds: decision.retryAfterSeconds };
}

function servedUnjudged(cause: UnavailableCause): ReadJudgement {
  reportReadLimitOnce({ kind: "served-unjudged", cause });
  return SERVE;
}

/**
 * The `429` that stops a read, or nothing when it is served (a wait that cannot be told is served too). Asked
 * before any lookup and before any credential is read, so a refusal is the same for an owner and a stranger and says
 * nothing of whether a design or a link exists.
 */
export async function refusalOfReadLimit(
  headers: HeaderReader,
): Promise<NextResponse | undefined> {
  const judgement = await judgeReadRequest(headers);
  if (judgement.kind === "serve") return undefined;
  try {
    return readLimitReachedResponse(judgement.retryAfterSeconds);
  } catch {
    return undefined;
  }
}
