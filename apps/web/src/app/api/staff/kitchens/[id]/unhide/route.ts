import { type NextRequest, type NextResponse } from "next/server";

import {
  answerUnavailableOnFailure,
  readGuardedBody,
} from "@/lib/server/account/account-request";
import {
  STAFF_WRITE_EVENTS,
  unhideKitchenAsStaff,
} from "@/lib/server/staff/staff-kitchen-actions";

// Pinned, not defaulted: the Postgres driver cannot run on Edge. Dynamic, since the answer is the cookie's.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Makes a kitchen its client hid visible to its client again, for staff (ADR 0173). It clears
 * the hide mark and nothing else, and commits with its audit row or not at all. It takes no body, but it asks for the same
 * guards as the other staff writes: the origin, a JSON media type (an empty body is fine) and a bounded body, which is read
 * and not looked at.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const body = await readGuardedBody(request);
  if (body.kind === "refused") return body.response;
  const { id } = await params;
  return answerUnavailableOnFailure(STAFF_WRITE_EVENTS.unhide, () =>
    unhideKitchenAsStaff({
      cookies: request.cookies,
      headers: request.headers,
      designId: id,
    }),
  );
}
