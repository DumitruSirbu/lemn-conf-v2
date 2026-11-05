import { type NextRequest, type NextResponse } from "next/server";

import {
  answerUnavailableOnFailure,
  readGuardedBody,
} from "@/lib/server/account/account-request";
import { setItemActiveAsStaff } from "@/lib/server/catalogue-availability";
import { PRICE_DRAFT_EVENT } from "@/lib/server/price-dashboard/price-dashboard-service";

// Pinned, not defaulted: the Postgres driver cannot run on Edge. Dynamic, since the answer is the cookie's.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Switches one item on or off at once, against the availability revision the page read (ADR 0178). A `POST`: it
 * writes a row to the availability log, unless the item already is as asked. Steps 1 and 2 of the common order are the
 * route's: origin, media type and bounded body. `setItemActiveAsStaff` owns the rest.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await readGuardedBody(request);
  if (body.kind === "refused") return body.response;
  return answerUnavailableOnFailure(PRICE_DRAFT_EVENT, () =>
    setItemActiveAsStaff({
      cookies: request.cookies,
      headers: request.headers,
      bodyText: body.text,
    }),
  );
}
