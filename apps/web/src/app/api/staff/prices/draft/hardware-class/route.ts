import { type NextRequest, type NextResponse } from "next/server";

import {
  answerUnavailableOnFailure,
  readGuardedBody,
} from "@/lib/server/account/account-request";
import {
  PRICE_DRAFT_EVENT,
  createHardwareClassAsStaff,
} from "@/lib/server/price-dashboard/price-dashboard-service";

// Pinned, not defaulted: the Postgres driver cannot run on Edge. Dynamic, since the answer is the cookie's.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Creates a hardware class in the price draft, with a rate for each mechanism, against the draft revision the page read
 * (ADR 0178). A `POST`: each request mints an id of its own. Steps 1 and 2 of the common order are the route's: origin,
 * media type and bounded body. `createHardwareClassAsStaff` owns the rest.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await readGuardedBody(request);
  if (body.kind === "refused") return body.response;
  return answerUnavailableOnFailure(PRICE_DRAFT_EVENT, () =>
    createHardwareClassAsStaff({
      cookies: request.cookies,
      headers: request.headers,
      bodyText: body.text,
    }),
  );
}
