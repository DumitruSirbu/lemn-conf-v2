import { type NextRequest, type NextResponse } from "next/server";

import {
  answerUnavailableOnFailure,
  readGuardedBody,
} from "@/lib/server/account/account-request";
import {
  PRICE_USAGE_EVENT,
  readItemUsageAsStaff,
} from "@/lib/server/price-dashboard/staff-item-usage";

// Pinned, not defaulted: the Postgres driver cannot run on Edge. Dynamic, since the answer is the cookie's.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Counts the saved designs that use each of up to 50 items. A `POST` though it only reads: it carries structured refs,
 * which belong in a body. Steps 1 and 2 of the common order are the route's: origin, media type and bounded body.
 * `readItemUsageAsStaff` owns the rest.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await readGuardedBody(request);
  if (body.kind === "refused") return body.response;
  return answerUnavailableOnFailure(PRICE_USAGE_EVENT, () =>
    readItemUsageAsStaff({
      cookies: request.cookies,
      headers: request.headers,
      bodyText: body.text,
    }),
  );
}
