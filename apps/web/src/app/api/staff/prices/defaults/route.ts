import { NextResponse, type NextRequest } from "next/server";

import {
  answerUnavailableOnFailure,
  readGuardedBody,
} from "@/lib/server/account/account-request";
import {
  ACCOUNT_RESPONSE_HEADERS,
  crossSiteResponse,
} from "@/lib/server/account/account-responses";
import { isCrossSiteRequest } from "@/lib/server/cross-site-request";
import { dashboardConflictResponse } from "@/lib/server/price-dashboard/dashboard-responses";
import { saveKitchenDefaultsAsStaff } from "@/lib/server/price-dashboard/kitchen-defaults-save";
import { readKitchenDefaultsForAdmittedPage } from "@/lib/server/price-dashboard/new-kitchen-defaults";
import {
  answerReadForStaff,
  PRICE_DRAFT_EVENT,
  PRICE_READ_EVENT,
  type StaffReadAnswer,
} from "@/lib/server/price-dashboard/price-dashboard-service";
import { staffHeadRefusedResponse } from "@/lib/server/staff/staff-responses";
import type { KitchenDefaultsStateWire } from "@/price-dashboard/price-dashboard-wire-contract";

// Pinned, not defaulted: the Postgres driver cannot run on Edge. Dynamic, since the answer is the cookie's.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What a `HEAD` is told the route takes: its `GET` and its `PUT`. */
const ALLOWED_METHODS = "GET, PUT";

/**
 * The saved defaults, completed from the fixed fallbacks, with the revisions a save is made against. Admitted, limited
 * and audited exactly as `GET /api/staff/prices` is, and it holds no tier offers (ADR 0178).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (isCrossSiteRequest(request)) return crossSiteResponse();
  return answerUnavailableOnFailure(PRICE_READ_EVENT, () =>
    answerReadForStaff(
      { cookies: request.cookies, headers: request.headers },
      readDefaultsAnswer,
    ),
  );
}

/** Declared so the framework does not run `GET` for it: that would spend a bucket and write a row for a request that
 *  wants no body. */
export function HEAD(): NextResponse {
  return staffHeadRefusedResponse(ALLOWED_METHODS);
}

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

/** With no published version there is no book to complete the defaults from: a state of the data, `409`, and no row. */
async function readDefaultsAnswer(): Promise<StaffReadAnswer> {
  const page = await readKitchenDefaultsForAdmittedPage();
  if (page === undefined) {
    return {
      kind: "refused",
      response: dashboardConflictResponse("no-active-version"),
    };
  }
  return {
    kind: "served",
    response: stateResponse(page.state),
    section: "defaults",
  };
}

/** `200`: shaped member by member, so that nothing else the read holds (the tier offers, what is switched off) is sent. */
function stateResponse({
  revision,
  availabilityRevision,
  saved,
  defaults,
}: KitchenDefaultsStateWire): NextResponse {
  const body: KitchenDefaultsStateWire = {
    revision,
    availabilityRevision,
    saved,
    defaults: {
      materialTierId: defaults.materialTierId,
      hardwareTierId: defaults.hardwareTierId,
      cabinetDepthMm: defaults.cabinetDepthMm,
      finish: { ...defaults.finish },
      handle: defaults.handle,
      topRowHandle: defaults.topRowHandle,
    },
  };
  return NextResponse.json(body, {
    status: 200,
    headers: ACCOUNT_RESPONSE_HEADERS,
  });
}
