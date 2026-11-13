import { NextResponse, type NextRequest } from "next/server";

import { isAuthorizedCronRequest } from "@/lib/server/cron-auth";
import { createMailSender } from "@/lib/server/mail/create-mail-sender";
import { staffChangeDigestCopy } from "@/lib/server/mail/staff-change-digest";
import { readPublicOrigin } from "@/lib/server/public-origin";
import {
  runStaffChangeDigest,
  type StaffChangeDigestOutcome,
} from "@/lib/server/staff/run-staff-change-digest";
import { getKitchenChangeStore } from "@/lib/server/staff/kitchen-change-store-instance";

// Talks to Postgres through the persistence package's driver; must not run on the Edge runtime.
export const runtime = "nodejs";
// Reads `request.headers` on every call and must never serve a cached/stale response.
export const dynamic = "force-dynamic";

const DIGEST_FAILED_STATUS = 503;

/** Grepped for in a platform log view, so it is one literal and not assembled. */
const DIGEST_LOG_LABEL = "[staff-change-digest]";

/**
 * The daily e-mail to the shop about kitchens a client changed after staff saw them, triggered by the cron declared in
 * `vercel.json`. It reads nothing from the request but the authorization header: the day, the instant, the kitchens
 * and the address of the one recipient all come from the server. A failure is `503` with a stable code, never a cause.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorizedCronRequest(request.headers)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const outcome = await runStaffChangeDigest({
    openStore: getKitchenChangeStore,
    now: () => new Date(),
    createSender: () => createMailSender(process.env),
    readPublicOrigin: () => readPublicOrigin(process.env),
    copy: staffChangeDigestCopy,
  });
  return answerOf(outcome);
}

function answerOf(outcome: StaffChangeDigestOutcome): NextResponse {
  if (outcome.status !== "failed") return NextResponse.json(outcome);
  reportFailure(outcome);
  return NextResponse.json(outcome, { status: DIGEST_FAILED_STATUS });
}

/** A diagnostic that can fail must not replace what it reports, so a transport that throws is silent. */
function reportFailure(outcome: StaffChangeDigestOutcome): void {
  try {
    console.error(DIGEST_LOG_LABEL, outcome);
  } catch {
    // Nothing is left to report a failed report with.
  }
}
