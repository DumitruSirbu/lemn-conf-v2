import "server-only";

import {
  InvalidDesignError,
  isDesignId,
  type Design,
} from "@lemnaria/configurator-domain";
import type { DesignRevision } from "@lemnaria/persistence";
import { cookies } from "next/headers";

import { getRepository } from "./repository";
import { readVisitorHash } from "./visitor";

/** Why a design page shows the load-error page instead of a design. */
export type OwnedDesignRefusal = "unavailable" | "invalid";

export type OwnedDesignLoad =
  | {
      readonly kind: "found";
      readonly design: Design;
      readonly revision: DesignRevision;
    }
  | { readonly kind: "refused"; readonly reason: OwnedDesignRefusal };

/**
 * The one answer every `/[locale]/d/{id}…` page gives to "may this browser see this design?" (ADR 0114 decision 5,
 * Amendment H2). Each page that opens a stored design calls this and renders its own screen for `found`, so two
 * routes cannot answer one request differently.
 *
 * A missing or malformed visitor cookie, a segment that is not a design id's shape (the domain's `isDesignId`; this
 * file states no shape of its own, 8L.13), a foreign cookie and an unknown id are one outcome, `"unavailable"`; the
 * no-cookie, malformed-cookie and malformed-id cases never reach the repository. The cookie is read first on purpose:
 * it is what makes a page that calls this one per-request, whatever the segment.
 *
 * `loadOwned` performs parse, migrate and validate as one step for a matched row, so `found` is a fully-formed
 * `Design`, and a stored row the load seam refuses (an unknown body, say) is `"invalid"` for its owner alone. Any
 * other failure is a driver failure and is rethrown.
 */
export async function loadOwnedDesign(id: string): Promise<OwnedDesignLoad> {
  const visitorHash = readVisitorHash(await cookies());
  if (visitorHash === undefined || !isDesignId(id))
    return { kind: "refused", reason: "unavailable" };

  try {
    const outcome = await getRepository().loadOwned({ id, visitorHash });
    if (outcome.kind === "none")
      return { kind: "refused", reason: "unavailable" };
    return {
      kind: "found",
      design: outcome.design,
      revision: outcome.revision,
    };
  } catch (error) {
    if (error instanceof InvalidDesignError)
      return { kind: "refused", reason: "invalid" };
    throw error;
  }
}
