import { type NextRequest, type NextResponse } from "next/server";

import {
  answerUnavailableOnFailure,
  readGuardedBody,
} from "@/lib/server/account/account-request";
import {
  PRICE_DRAFT_EVENT,
  restoreAsStaff,
} from "@/lib/server/price-dashboard/price-dashboard-service";

// Pinned, not defaulted: the Postgres driver cannot run on Edge. Dynamic, since the answer is the cookie's.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Puts an archived version's prices in the price draft (A-15, D8C). It publishes nothing, and a restored value replaces a
 * pending one for the same field. A `POST`: it writes the draft once, against the draft revision the page read. Steps 1
 * and 2 of the common order are the route's: origin, media type and bounded body. `restoreAsStaff` owns the rest.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const body = await readGuardedBody(request);
  if (body.kind === "refused") return body.response;
  const { id } = await params;
  return answerUnavailableOnFailure(PRICE_DRAFT_EVENT, () =>
    restoreAsStaff({
      cookies: request.cookies,
      headers: request.headers,
      versionId: id,
      bodyText: body.text,
    }),
  );
}
