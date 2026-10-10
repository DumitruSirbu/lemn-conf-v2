import "server-only";

import {
  buildKitchenLBodyCatalog,
  cabinetDepthMmOf,
  isDesignId,
  snapshotSubmission,
  type ContactSubmissionRequest,
  type DesignReference,
  type PriceBook,
  type SubmissionRefusal,
} from "@lemnaria/configurator-domain";
import type { ContactSubmissionToRecord } from "@lemnaria/persistence";

import { ContactFailure } from "@/lib/server/contact/contact-failure";
import type { DesignRefusal } from "@/lib/server/contact/contact-responses";
import type { OwnedDesignLoad } from "@/lib/server/load-owned-design";

/** What the design is read and priced from: the owned load, handed in, and the one book taken for the request. */
export interface SubmissionSources {
  readonly book: PriceBook;
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
  const owned = await ownedDesignAt(target.design, loadOwned);
  if (owned === undefined) return refusedAsNotCurrent();
  const result = snapshotSubmission({
    design: owned,
    catalog: buildKitchenLBodyCatalog(cabinetDepthMmOf(owned)),
    book,
    pricingVersion: book.version,
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
