import { type NextRequest, type NextResponse } from "next/server";

import {
  answerUnavailableOnFailure,
  readGuardedBody,
} from "@/lib/server/account/account-request";
import {
  PRICE_DRAFT_EVENT,
  bulkChangeDraftAsStaff,
} from "@/lib/server/price-dashboard/price-dashboard-service";

// Pinned, not defaulted: the Postgres driver cannot run on Edge. Dynamic, since the answer is the cookie's.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Changes cabinet prices by a whole percentage over a scope, as one group in the price draft (A-14, ADR 0178). A `POST`:
 * each request mints a group of its own. Steps 1 and 2 of the common order are the route's: origin, media type and bounded
 * body. `bulkChangeDraftAsStaff` owns the rest.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await readGuardedBody(request);
  if (body.kind === "refused") return body.response;
  return answerUnavailableOnFailure(PRICE_DRAFT_EVENT, () =>
    bulkChangeDraftAsStaff({
      cookies: request.cookies,
      headers: request.headers,
      bodyText: body.text,
    }),
  );
}
