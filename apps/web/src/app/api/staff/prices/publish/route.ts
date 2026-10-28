import { type NextRequest, type NextResponse } from "next/server";

import {
  answerUnavailableOnFailure,
  readGuardedBody,
} from "@/lib/server/account/account-request";
import {
  PRICE_DRAFT_EVENT,
  publishAsStaff,
} from "@/lib/server/price-dashboard/price-dashboard-service";

// Pinned, not defaulted: the Postgres driver cannot run on Edge. Dynamic, since the answer is the cookie's.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Publishes the price draft as a new version (A-15, ADR 0178). A `POST`: each request creates a version. The body names the
 * draft revision, the active sequence and the availability head the page read, and carries the version's label and note and
 * nothing else: the server computes the book from the stored draft, so a request that names a book or the provisional flag
 * is refused. Steps 1 and 2 of the common order are the route's: origin, media type and bounded body. `publishAsStaff` owns
 * the rest.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await readGuardedBody(request);
  if (body.kind === "refused") return body.response;
  return answerUnavailableOnFailure(PRICE_DRAFT_EVENT, () =>
    publishAsStaff({
      cookies: request.cookies,
      headers: request.headers,
      bodyText: body.text,
    }),
  );
}
