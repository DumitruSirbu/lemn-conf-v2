import { type NextRequest, type NextResponse } from "next/server";

import {
  answerUnavailableOnFailure,
  readGuardedBody,
} from "@/lib/server/account/account-request";
import {
  STAFF_SEEN_EVENT,
  markKitchenSeenAsStaff,
} from "@/lib/server/staff/staff-kitchen-seen";

// Pinned, not defaulted: the Postgres driver cannot run on Edge. Dynamic, since the answer is the cookie's.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Marks a kitchen seen at the revision the page displayed (ADR 0178 A-12). Steps 1 and 2 of the common order are the
 * route's: origin, media type and bounded body. `markKitchenSeenAsStaff` owns the rest, and a mark is committed with its
 * audit row or not at all. A `POST` because it records an observation that is not the whole state of the resource.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const body = await readGuardedBody(request);
  if (body.kind === "refused") return body.response;
  const { id } = await params;
  return answerUnavailableOnFailure(STAFF_SEEN_EVENT, () =>
    markKitchenSeenAsStaff({
      cookies: request.cookies,
      headers: request.headers,
      designId: id,
      bodyText: body.text,
    }),
  );
}
