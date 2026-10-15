import { NextResponse, type NextRequest } from "next/server";

import { isAuthorizedCronRequest } from "@/lib/server/cron-auth";
import {
  pruneRateLimits,
  type PruneLine,
  type PruneOutcome,
} from "@/lib/server/rate-limit/prune-rate-limits";
import { getRateLimitStore } from "@/lib/server/rate-limit/rate-limit-store-instance";

// Talks to Postgres through the persistence package's driver; must not run on the Edge runtime.
export const runtime = "nodejs";
// Reads `request.headers` on every call and must never serve a cached/stale response.
export const dynamic = "force-dynamic";

/** Stable, so a status-only monitor and a log search find the same failure; never an exception's message. */
const PRUNE_FAILED_CODE = "RATE_LIMIT_PRUNE_FAILED";
const PRUNE_FAILED_STATUS = 503;

/** Grepped for in a platform log view, so it is one literal and not assembled. */
const PRUNE_LOG_LABEL = "[rate-limit]";

/**
 * Nightly removal of counter rows whose window ended more than an hour before the server's own clock, triggered by
 * the cron declared in `vercel.json`. The instant is the clock read here and never a value the request carries. A
 * failed step is `503` with a code and one line, and what the steps before it removed stands; the number answered is
 * a lower bound.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorizedCronRequest(request.headers)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const outcome = await pruneRateLimits({
    store: {
      pruneExpired: (cutoff) => getRateLimitStore().pruneExpired(cutoff),
      totalsOfWindow: (window, figure) =>
        getRateLimitStore().totalsOfWindow(window, figure),
    },
    instant: new Date(),
    report: writeLine,
  });
  return answerOf(outcome);
}

function answerOf(outcome: PruneOutcome): NextResponse {
  if (outcome.status === "pruned") {
    return NextResponse.json({
      status: "ok",
      removedAtLeast: outcome.removedAtLeast,
    });
  }
  return NextResponse.json(
    {
      status: "failed",
      errorCode: PRUNE_FAILED_CODE,
      removedAtLeast: outcome.removedAtLeast,
    },
    { status: PRUNE_FAILED_STATUS },
  );
}

/** A diagnostic that can fail must not replace what it reports, so a transport that throws is silent. */
function writeLine(line: PruneLine): void {
  const write =
    line.event === "rate-limit-prune-failed" ? console.error : console.info;
  try {
    write(PRUNE_LOG_LABEL, line);
  } catch {
    // Nothing is left to report a failed report with.
  }
}
