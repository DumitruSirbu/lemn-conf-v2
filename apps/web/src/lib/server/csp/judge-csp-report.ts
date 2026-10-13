import "server-only";

import { NextResponse } from "next/server";

import { reportCspReportUnavailable } from "@/lib/server/csp/csp-report-log";
import {
  RATE_LIMIT_DEADLINE_MS,
  type WriteJudgement,
} from "@/lib/server/rate-limit/enforce-rate-limit";
import {
  blockBucketRequestFor,
  judgeBlockBucket,
} from "@/lib/server/rate-limit/judge-block-bucket";
import { limitedAnswerHeaders } from "@/lib/server/rate-limit/page-limit-page";
import type { HeaderReader } from "@/lib/server/rate-limit/network-source";
import { refusalOfWriteLimit } from "@/lib/server/rate-limit/refusal-of-write-limit";

const REFUSED_STATUS = 429;
const UNAVAILABLE_STATUS = 503;

/**
 * Counts one report in the network block's bucket, under the `csp-report` policy. The process environment is asked
 * here, inside the request. Whatever cannot be judged is unavailable, so a request that cannot be judged is refused
 * and not taken: the sink fails closed, as every write does (ADR 0156).
 */
export async function judgeCspReport(
  headers: HeaderReader,
): Promise<WriteJudgement> {
  const request = blockBucketRequestFor({
    environment: process.env,
    headers,
    purpose: "csp-report",
    deadlineMs: RATE_LIMIT_DEADLINE_MS,
    instant: new Date(),
  });
  return { decision: await judgeBlockBucket(request), policy: request.policy };
}

/**
 * The answer that stops a report, or nothing when it may go on: `429` with the wait, or `503`, both without a body.
 * A refusal writes no line (a flood past the figure must buy no log write) and an unjudged request writes one for a
 * process and a cause. Nothing thrown here is kept: it answers as unavailable.
 */
export function refusalOfCspReportLimit(
  headers: HeaderReader,
): Promise<NextResponse | undefined> {
  return refusalOfWriteLimit(() => judgeCspReport(headers), {
    refused: (retryAfterSeconds) =>
      new NextResponse(null, {
        status: REFUSED_STATUS,
        headers: limitedAnswerHeaders({ retryAfterSeconds }),
      }),
    unavailable: () =>
      new NextResponse(null, {
        status: UNAVAILABLE_STATUS,
        headers: limitedAnswerHeaders(),
      }),
    reportRefused: () => undefined,
    reportUnavailable: reportCspReportUnavailable,
  });
}
