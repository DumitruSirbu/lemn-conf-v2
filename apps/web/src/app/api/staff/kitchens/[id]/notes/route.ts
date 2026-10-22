import { type NextRequest, type NextResponse } from "next/server";

import {
  answerUnavailableOnFailure,
  readGuardedBody,
} from "@/lib/server/account/account-request";
import {
  STAFF_WRITE_EVENTS,
  addNoteAsStaff,
} from "@/lib/server/staff/staff-kitchen-actions";

// Pinned, not defaulted: the Postgres driver cannot run on Edge. Dynamic, since the answer is the cookie's.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Adds a note to a client's kitchen, for staff (ADR 0173). Steps 1 and 2 of the common order are
 * the route's: origin, media type and bounded body. `addNoteAsStaff` owns the rest, and the note is committed with its
 * audit row or not at all. There is no `PATCH` and no `DELETE`: a note is not edited or removed.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const body = await readGuardedBody(request);
  if (body.kind === "refused") return body.response;
  const { id } = await params;
  return answerUnavailableOnFailure(STAFF_WRITE_EVENTS.note, () =>
    addNoteAsStaff({
      cookies: request.cookies,
      headers: request.headers,
      designId: id,
      bodyText: body.text,
    }),
  );
}
