import { isDesignId } from "@lemnaria/configurator-domain";
import { type NextRequest, type NextResponse } from "next/server";

import { designNotFoundResponse } from "@/lib/server/design-errors";
import { acknowledgePrices } from "@/lib/server/price-notice";
import {
  acknowledgementResponse,
  editCredentialOf,
  readAcknowledgedPair,
} from "@/lib/server/price-notice-request";
import { refusalOfSaveLimit } from "@/lib/server/rate-limit/judge-save-request";

// Pinned, not defaulted: the Postgres driver cannot run on Edge. Dynamic, since the answer is the cookie's.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Records the pair of prices the page displayed as acknowledged (A-11), never the pair now in force. It never touches the
 * design and writes no audit row. Authorised like a save and refused as the notice `GET` is.
 *
 * The order: the id's shape, the credential, the save limiter (so an unauthorised request spends no token), the media
 * type, the body's bound and members, then the design under the credential, then the marker. A limiter that cannot judge
 * is `503`, since a write that cannot be counted is not made.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { id } = await params;
  if (!isDesignId(id)) return designNotFoundResponse(id);
  const credential = await editCredentialOf(request, id);
  if (credential === undefined) return designNotFoundResponse(id);
  const limited = await refusalOfSaveLimit(request.headers, credential);
  if (limited) return limited;
  const reading = await readAcknowledgedPair(request);
  if (reading.kind === "refused") return reading.response;
  return acknowledgementResponse(
    await acknowledgePrices({ id, credential, pair: reading.pair }),
    id,
  );
}
