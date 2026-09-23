import { InvalidDesignError } from "@lemnaria/configurator-domain";
import type { Metadata } from "next";

import { DesignLoadError } from "@/app/d/[id]/design-load-error";
import { SharedDesignView } from "@/app/s/[token]/shared-design-view";
import { reportDesignFailure } from "@/lib/server/design-failure-log";
import { getShareLinkRepository } from "@/lib/server/repository";
import { isWellFormedShareToken } from "@/lib/server/share-token";
import { sha256Hex } from "@/lib/server/sha256-hex";

/** D6/D7: never indexed, never followed, and the referrer is withheld from wherever a visitor clicks
 *  next — stricter than the site-wide `strict-origin-when-cross-origin` a shared kitchen must not
 *  leak even the origin past. `proxy.ts`'s `SHARE_VIEW_HEADERS` carries the response-header half of
 *  the same contract. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * The share view (M7 wave 7E3c D6) — a server component that reads no cookie and imports nothing
 * from `visitor.ts`, `write-token.ts` or `fetch-configuration-repository.ts` (criterion 9: nothing
 * here may authorise or probe a write).
 *
 * **A malformed token issues no query at all** (criterion 10): `isWellFormedShareToken` runs first,
 * and only a well-formed shape is ever hashed and looked up. Every failure — malformed, unknown or
 * revoked (`loadShared`'s `"none"`) — renders the same `DesignLoadError`, byte-identical to `/d/{id}`'s
 * own "not found" (no new copy), so none of them can be told apart from the response alone.
 *
 * **Ruling (coordinator, 2026-09-23):** the malformed branch's early return skips the `await` the
 * other two take, which changes Next's internal RSC chunk numbering even though the rendered page and
 * props are identical — measured in a production build. Accepted without change: the token's shape is
 * public, so telling "malformed" apart from "well-formed but unknown" leaks nothing. Criterion 10's
 * identity is required, and pinned, between **unknown and revoked** tokens — both well-formed, both
 * awaited — which the production measurement found byte-identical.
 *
 * `InvalidDesignError` means a *stored* document failed migration on the way out — the server's own
 * problem, reachable only once a token is live — and renders `reason="invalid"`, exactly as `/d/{id}`
 * does for the same failure. Anything else is a driver failure: logged as `"share-read"` (criterion
 * 15: the line carries no id, because `reportDesignFailure` never takes one) and rethrown, so the
 * platform's own 500 still happens and is now diagnosable.
 */
export default async function SharedDesignPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!isWellFormedShareToken(token))
    return <DesignLoadError reason="not-found" />;

  try {
    const outcome = await getShareLinkRepository().loadShared(sha256Hex(token));
    if (outcome.kind === "none") return <DesignLoadError reason="not-found" />;
    // `key={token}` (criterion 13): the token is public (it is the URL), and keying by it is what
    // makes two share views a fresh mount each, never a re-hydrate of one already-live instance —
    // the same single-fire shape `HydrateAndConfigure` gets from a route change. Without it, back/
    // forward between two share views in one tab reused the same `SharedDesignView` instance and
    // called `hydrate()` mid-render a second time, which is a real React warning ("cannot update a
    // component while rendering a different component"), not merely a cosmetic one.
    return <SharedDesignView key={token} design={outcome.design} />;
  } catch (error) {
    if (error instanceof InvalidDesignError)
      return <DesignLoadError reason="invalid" />;
    reportDesignFailure("share-read", error);
    throw error;
  }
}
