import type { PresetListing } from "@lemnaria/persistence";
import { NextResponse, type NextRequest } from "next/server";

import {
  reportPresetReadFailureOnce,
  reportUnlistedPresetsOnce,
} from "@/lib/server/design-failure-log";
import { parsePresetListQuery } from "@/lib/server/preset/preset-list-query";
import { summariesOf } from "@/lib/server/preset/preset-summary";
import { refusalOfPresetReadLimit } from "@/lib/server/rate-limit/judge-read-request";
import { getPresetRepository } from "@/lib/server/repository";
import type { PresetListResponse } from "@/preset/preset-summary-wire";
import { SERVICE_UNAVAILABLE_STATUS } from "@/preset/preset-wire-contract";

// Talks to Postgres with the application role and decides per request what to count; never prerendered.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OK_STATUS = 200;
const BAD_REQUEST_STATUS = 400;

/**
 * No cookie decides this answer, so it is public. The minute is how long a hidden preset may stay in a browser or a
 * cache (the owner hides one by hand, and nothing here can recall a copy); no `stale-while-revalidate`, which would
 * double it.
 */
const LISTING_CACHE_CONTROL = "public, max-age=60";

/** An answer that is not the listing is never kept: an outage must not be cached as "no presets". */
const NOT_CACHED = { "Cache-Control": "no-store" } as const;

const INVALID_QUERY_CODE = "PRESET_QUERY_INVALID";
const PRESETS_UNAVAILABLE_CODE = "PRESETS_UNAVAILABLE";

/**
 * The published presets near one room, newest first, at most `PRESET_LIST_LIMIT` (ADR 0112 decision 5 as Amendment A
 * amends it). It reads and nothing else, and it answers every customer alike: the summaries of
 * `preset-summary.ts`, never a hidden row, a status or a design id. The reads limiter is asked first and fails open.
 * A store that gives no answer, a missing table included, is a `503` that carries an empty list, which Step 1 reads as
 * "no presets" and goes on to composition; it is logged by the error's name alone.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const limited = await refusalOfPresetReadLimit(request.headers);
  if (limited) return limited;
  const query = parsePresetListQuery(request.nextUrl.searchParams);
  if (query.kind === "invalid") return invalidQueryResponse();

  try {
    const listing = await getPresetRepository().listPublishedNear(
      query.neighbourhood,
    );
    return listingResponse(listing);
  } catch (error) {
    reportPresetReadFailureOnce("preset-list", error);
    return unavailableResponse();
  }
}

function listingResponse(listing: PresetListing): NextResponse {
  const { summaries, oversizedCount } = summariesOf(listing.presets);
  reportUnlistedPresetsOnce({
    unreadableCount: listing.unreadableCount,
    oversizedCount,
  });
  const body: PresetListResponse = { presets: summaries };
  return NextResponse.json(body, {
    status: OK_STATUS,
    headers: { "Cache-Control": LISTING_CACHE_CONTROL },
  });
}

function invalidQueryResponse(): NextResponse {
  return NextResponse.json(
    {
      code: INVALID_QUERY_CODE,
      error: "The preset query was not understood.",
      presets: [],
    },
    { status: BAD_REQUEST_STATUS, headers: NOT_CACHED },
  );
}

function unavailableResponse(): NextResponse {
  return NextResponse.json(
    {
      code: PRESETS_UNAVAILABLE_CODE,
      error: "Presets cannot be listed right now.",
      presets: [],
    },
    { status: SERVICE_UNAVAILABLE_STATUS, headers: NOT_CACHED },
  );
}
