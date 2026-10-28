import "server-only";

import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  isDesignId,
  snapshotSubmission,
  type ContactSubmissionRequest,
  type CatalogueAvailability,
  type DesignReference,
  type PriceBook,
  type SubmissionRefusal,
} from "@lemnaria/configurator-domain";
import type { ContactSubmissionToRecord } from "@lemnaria/persistence";

import { ContactFailure } from "@/lib/server/contact/contact-failure";
import type { DesignRefusal } from "@/lib/server/contact/contact-responses";
import type { OwnedDesignLoad } from "@/lib/server/load-owned-design";
import { shippedDeepeningRows } from "@/price/deepening-rows";

/**
 * Nothing switched off, because this route has no availability source yet: `SubmissionSources` carries the book and not
 * the availability read beside it (A-17). A-17 has the contact route price under the *current* availability, so a kitchen
 * using an item switched off mid-session is refused `REPLACEMENT_REQUIRED` at send. Until the sources carry it, such a
 * kitchen is priced and sent as if the item were still on offer. The route's owner (R4a or S2) replaces this with the
 * availability read for the request's book; it is deliberately local and not exported.
 */
const AVAILABILITY_NOT_YET_SOURCED: CatalogueAvailability = {
  revision: "not-sourced",
  disabled: [],
};

/**
 * What the design is read and priced from: the owned load, handed in, and the one book taken for the request, with the
 * id of the version it was read as (`active-price-book.ts`). The id is what the request's digest covers (ADR 0157
 * decision 2). A request that names no design prices nothing and is handed no book; a request that names one and is handed
 * none is `no-price-book`.
 */
export interface SubmissionSources {
  readonly book: PriceBook | undefined;
  readonly bookVersionId: string | undefined;
  readonly loadOwned: (designId: string) => Promise<OwnedDesignLoad>;
}

export type PreparedSubmission =
  | {
      readonly kind: "ready";
      readonly submission: ContactSubmissionToRecord;
    }
  | { readonly kind: "refused"; readonly refusal: DesignRefusal };

/**
 * What would be stored: the request, and for a design the snapshot of the one row the owned load read, priced under the
 * one book the digest was made with. The revision is compared as text; the design is read once; and before anything is
 * stored or sent the snapshot's own version is compared with the book's, so the digested version and the priced one
 * cannot differ. Every way the design cannot be read is one refusal; a kitchen past its wall is another.
 */
export async function prepareSubmission(
  request: ContactSubmissionRequest,
  payloadDigest: string,
  { book, loadOwned }: SubmissionSources,
): Promise<PreparedSubmission> {
  const { clientRequestId, contact, locale, target } = request;
  const stored = { clientRequestId, payloadDigest, contact, locale, target };
  if (target.kind === "intent") {
    return ready({ ...stored, snapshot: undefined });
  }
  if (book === undefined) throw new ContactFailure("no-price-book");
  const owned = await ownedDesignAt(target.design, loadOwned);
  if (owned === undefined) return refusedAsNotCurrent();
  const result = snapshotSubmission({
    design: owned,
    catalog: buildKitchenLBodyCatalog(cabinetDepthMmOf(owned)),
    book,
    pricingVersion: book.version,
    deepeningRows: shippedDeepeningRows(),
    availability: AVAILABILITY_NOT_YET_SOURCED,
  });
  if (!result.ok) return refusalOf(result.refusal);
  requireTheBooksVersion(result.snapshot.priced.pricingVersion, book);
  return ready({ ...stored, snapshot: result.snapshot });
}

/** The caller's own design at the stated revision, or nothing, which is one answer however it came about. */
async function ownedDesignAt(
  { id, revision }: DesignReference,
  loadOwned: SubmissionSources["loadOwned"],
) {
  if (!isDesignId(id)) return undefined;
  const loaded = await loadOwned(id);
  if (loaded.kind !== "found") return undefined;
  return loaded.revision === revision ? loaded.design : undefined;
}

function requireTheBooksVersion(pricedAt: string, book: PriceBook): void {
  if (pricedAt !== book.version) {
    throw new ContactFailure("price-book-mismatch");
  }
}

function refusalOf(refusal: SubmissionRefusal): PreparedSubmission {
  if (refusal.code === "BODIES_PAST_WALL") {
    return {
      kind: "refused",
      refusal: {
        code: "CONTACT_DESIGN_DOES_NOT_FIT",
        placementIds: refusal.placementIds,
      },
    };
  }
  if (refusal.code === "NO_CABINET") return refusedAsNotCurrent();
  throw new ContactFailure(
    refusal.failure.code === "PRICING_VERSION_MISMATCH"
      ? "price-book-mismatch"
      : "unexpected",
  );
}

function refusedAsNotCurrent(): PreparedSubmission {
  return { kind: "refused", refusal: { code: "CONTACT_DESIGN_NOT_CURRENT" } };
}

function ready(submission: ContactSubmissionToRecord): PreparedSubmission {
  return { kind: "ready", submission };
}
