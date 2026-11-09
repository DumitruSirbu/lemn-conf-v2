import { isDesignId } from "@lemnaria/configurator-domain";
import { type NextRequest, type NextResponse } from "next/server";

import { designNotFoundResponse } from "@/lib/server/design-errors";
import { readPriceNotice } from "@/lib/server/price-notice";
import {
  editCredentialOf,
  priceNoticeResponse,
} from "@/lib/server/price-notice-request";
import { refusalOfReadLimit } from "@/lib/server/rate-limit/judge-read-request";

// Pinned, not defaulted: the Postgres driver cannot run on Edge. Dynamic, since the answer is the cookie's.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * What the owner of a saved kitchen is told on opening it: whether its price changed since they last looked, what they
 * must replace before a price shows, and which accessories were removed (see ADR 0178 A-11).
 * Authorised exactly like a save, the cross-site refusal first and on both credentials, and read by `loadEditable` before a
 * marker is touched. Every refusal for want of that authority is `designNotFoundResponse`, byte for byte.
 *
 * The order: the read limiter (before any cookie or lookup, and failing open), the id's shape, the credential, then the
 * design and the judgement. The one write is the first open's marker, at most one row for a design's whole life.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { id } = await params;
  const limited = await refusalOfReadLimit(request.headers);
  if (limited) return limited;
  if (!isDesignId(id)) return designNotFoundResponse(id);
  const credential = await editCredentialOf(request, id);
  if (credential === undefined) return designNotFoundResponse(id);
  return priceNoticeResponse(await readPriceNotice({ id, credential }), id);
}
