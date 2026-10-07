import { InvalidDesignError } from "@lemnaria/configurator-domain";
import type { Metadata } from "next";

import { DesignLoadError } from "@/app/d/[id]/design-load-error";
import { SharedDesignView } from "@/app/s/[token]/shared-design-view";
import { reportDesignFailure } from "@/lib/server/design-failure-log";
import { getShareLinkRepository } from "@/lib/server/repository";
import { isWellFormedShareToken } from "@/lib/server/share-token";
import { sha256Hex } from "@/lib/server/sha256-hex";

/** Never indexed or followed, and the referrer is withheld from wherever a visitor clicks next: stricter than the
 *  site-wide default so a shared kitchen leaks not even the origin. `proxy.ts`'s `SHARE_VIEW_HEADERS` carries the
 *  response-header half. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * The share view (ADR 0114 Amendment G5): a server component that reads no cookie and imports nothing from
 * `visitor.ts`, `write-token.ts` or `fetch-configuration-repository.ts`, so nothing here can authorise or probe a
 * write.
 *
 * A malformed token issues no query: `isWellFormedShareToken` runs first and only a well-formed shape is hashed and
 * looked up. Every failure (malformed, unknown, revoked) renders the same `DesignLoadError`, byte-identical to
 * `/d/{id}`'s "not found", so none can be told apart from the response alone. The malformed branch's early return
 * skips the `await` the others take, which changes Next's RSC chunk numbering; accepted, because the token's shape is
 * public. The identity that must hold is between unknown and revoked tokens, both awaited.
 *
 * `InvalidDesignError` is a stored document failing migration on the way out, rendered as `reason="invalid"` as
 * `/d/{id}` does. Anything else is a driver failure, logged as `"share-read"` (a line with no id, since
 * `reportDesignFailure` never takes one) and rethrown, so the platform's 500 still happens and is diagnosable.
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
    // `key={token}`: the token is public, and keying by it makes each share view a fresh mount, never a re-hydrate of
    // a live instance. Without it, back/forward between two share views reused one `SharedDesignView` and called
    // `hydrate()` mid-render again: a real React warning ("cannot update a component while rendering a different one").
    return <SharedDesignView key={token} design={outcome.design} />;
  } catch (error) {
    if (error instanceof InvalidDesignError)
      return <DesignLoadError reason="invalid" />;
    reportDesignFailure("share-read", error);
    throw error;
  }
}
