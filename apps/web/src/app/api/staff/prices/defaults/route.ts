import { type NextRequest, type NextResponse } from "next/server";

import {
  answerUnavailableOnFailure,
  readGuardedBody,
} from "@/lib/server/account/account-request";
import { saveKitchenDefaultsAsStaff } from "@/lib/server/price-dashboard/kitchen-defaults-save";
import { PRICE_DRAFT_EVENT } from "@/lib/server/price-dashboard/price-dashboard-service";

// Pinned, not defaulted: the Postgres driver cannot run on Edge. Dynamic, since the answer is the cookie's.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Saves the new-kitchen defaults at once, against the defaults revision and the availability head the page read (ADR
 * 0178). A `PUT`: the whole of the defaults replaces the saved whole, and a save that changes nothing writes nothing.
 * Steps 1 and 2 of the common order are the route's: origin, media type and bounded body.
 * `saveKitchenDefaultsAsStaff` owns the rest.
 */
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const body = await readGuardedBody(request);
  if (body.kind === "refused") return body.response;
  return answerUnavailableOnFailure(PRICE_DRAFT_EVENT, () =>
    saveKitchenDefaultsAsStaff({
      cookies: request.cookies,
      headers: request.headers,
      bodyText: body.text,
    }),
  );
}
