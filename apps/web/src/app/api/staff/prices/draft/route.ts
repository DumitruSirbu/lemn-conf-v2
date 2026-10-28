import { type NextRequest, type NextResponse } from "next/server";

import {
  answerUnavailableOnFailure,
  readGuardedBody,
} from "@/lib/server/account/account-request";
import {
  PRICE_DRAFT_EVENT,
  changeDraftAsStaff,
  revertDraftAsStaff,
} from "@/lib/server/price-dashboard/price-dashboard-service";

// Pinned, not defaulted: the Postgres driver cannot run on Edge. Dynamic, since the answer is the cookie's.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sets one change in the price draft, against the draft revision the page read (ADR 0178). A `PUT` because the request
 * carries the whole change and a repeat of it changes nothing further. Steps 1 and 2 of the common order are the route's:
 * origin, media type and bounded body. `changeDraftAsStaff` owns the rest.
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const body = await readGuardedBody(request);
  if (body.kind === "refused") return body.response;
  return answerUnavailableOnFailure(PRICE_DRAFT_EVENT, () =>
    changeDraftAsStaff({
      cookies: request.cookies,
      headers: request.headers,
      bodyText: body.text,
    }),
  );
}

/**
 * Takes one change out of the draft (↺). The change is named by its address, or by its group for a bulk action, in the
 * body (`DraftRevertRequestWire`): an address is not a path segment, and a revert names what it removes, never an index.
 * A body of `{expectedDraftRevision, scope: "all"}` (`DraftDiscardRequestWire`) resets the whole draft to empty without
 * reading it, which is how a draft that cannot be read is recovered.
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const body = await readGuardedBody(request);
  if (body.kind === "refused") return body.response;
  return answerUnavailableOnFailure(PRICE_DRAFT_EVENT, () =>
    revertDraftAsStaff({
      cookies: request.cookies,
      headers: request.headers,
      bodyText: body.text,
    }),
  );
}
