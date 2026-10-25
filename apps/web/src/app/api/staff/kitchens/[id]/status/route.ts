import { type NextRequest, type NextResponse } from "next/server";

import {
  answerUnavailableOnFailure,
  readGuardedBody,
} from "@/lib/server/account/account-request";
import {
  STAFF_WRITE_EVENTS,
  setStatusAsStaff,
} from "@/lib/server/staff/staff-kitchen-actions";

// Pinned, not defaulted: the Postgres driver cannot run on Edge. Dynamic, since the answer is the cookie's.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Sets the status of a sent kitchen's request, for staff (ADR 0173). Steps 1 and 2 of the common
 * order are the route's: origin, media type and bounded body. `setStatusAsStaff` owns the rest, and a changed status is
 * committed with its audit row or not at all. A `PUT` because the request carries the whole status and a repeat of it
 * changes nothing.
 */
export async function PUT(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const body = await readGuardedBody(request);
  if (body.kind === "refused") return body.response;
  const { id } = await params;
  return answerUnavailableOnFailure(STAFF_WRITE_EVENTS.status, () =>
    setStatusAsStaff({
      cookies: request.cookies,
      headers: request.headers,
      designId: id,
      bodyText: body.text,
    }),
  );
}
