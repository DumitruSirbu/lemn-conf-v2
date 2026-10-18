import { isDesignId } from "@lemnaria/configurator-domain";
import type { PresetThumbnailType } from "@lemnaria/persistence";
import { NextResponse, type NextRequest } from "next/server";

import { reportPresetReadFailureOnce } from "@/lib/server/design-failure-log";
import { refusalOfPresetReadLimit } from "@/lib/server/rate-limit/judge-read-request";
import { getPresetRepository } from "@/lib/server/repository";
import { PRESET_IMAGE_CONTENT_SECURITY_POLICY } from "@/lib/security-headers";

// Talks to Postgres with the application role and decides per request what to count; never prerendered.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** The types an image is served as, a closed list. The table holds the same three (`presets_thumbnail_type`); the route
 *  states them again so that nothing stored, however it got there, is ever sent as another `Content-Type`. */
const SERVABLE_IMAGE_TYPES: readonly PresetThumbnailType[] = [
  "image/webp",
  "image/png",
  "image/jpeg",
];

const NOT_FOUND_STATUS = 404;

/**
 * Short, and not `immutable`: the owner hides a preset by hand and nothing here can recall a copy, so a hidden preset's
 * image may stay in a browser or a cache for this minute and no longer (plan M8C section 3.5, as the P1 security review
 * amends it). No `stale-while-revalidate`, which would double it.
 */
const IMAGE_CACHE_CONTROL = "public, max-age=60";

/**
 * One published preset's stored image, with the type it was stored as and nothing else the caller can influence. A
 * malformed id, an unknown id, a hidden preset and a store that gave no answer all answer the same `404`, byte for byte,
 * and a malformed id costs no query. The reads limiter is asked before the lookup and fails open. The image is never
 * decoded, and never a `data:` URL.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { id } = await params;
  if (!isDesignId(id)) return notFoundResponse();
  const limited = await refusalOfPresetReadLimit(request.headers);
  if (limited) return limited;

  try {
    const lookup = await getPresetRepository().loadPublishedImage(id);
    if (lookup.kind === "none" || !isServableType(lookup.type)) {
      return notFoundResponse();
    }
    return imageResponse(lookup.bytes, lookup.type);
  } catch (error) {
    reportPresetReadFailureOnce("preset-image", error);
    return notFoundResponse();
  }
}

function isServableType(type: string): type is PresetThumbnailType {
  return (SERVABLE_IMAGE_TYPES as readonly string[]).includes(type);
}

/**
 * `nosniff` is the site's (`next.config.ts`) and is stated again here so the route does not depend on it. The policy
 * is also set by `src/proxy.ts`, whose copy is the one that reaches the browser.
 */
function imageResponse(
  bytes: Uint8Array,
  type: PresetThumbnailType,
): NextResponse {
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": type,
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": PRESET_IMAGE_CONTENT_SECURITY_POLICY,
      "Cross-Origin-Resource-Policy": "same-origin",
      "Cache-Control": IMAGE_CACHE_CONTROL,
    },
  });
}

/** One body and one set of headers for every cause, so the answer says nothing of which it was; never kept. */
function notFoundResponse(): NextResponse {
  return NextResponse.json(
    { error: "Preset image not found." },
    { status: NOT_FOUND_STATUS, headers: { "Cache-Control": "no-store" } },
  );
}
