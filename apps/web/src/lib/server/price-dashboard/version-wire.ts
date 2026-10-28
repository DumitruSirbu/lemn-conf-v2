import "server-only";

import type { PriceBook } from "@lemnaria/configurator-domain";
import type {
  PriceVersionPage,
  PriceVersionSummary,
  StoredPriceVersion,
} from "@lemnaria/persistence";

import { parseStoredBook } from "@/lib/server/active-price-book";
import { readStoredDraft } from "@/lib/server/price-dashboard/stored-draft";
import type {
  PriceVersionListWire,
  PriceVersionSummaryWire,
  PriceVersionWire,
} from "@/price-dashboard/price-dashboard-wire-contract";

// A stored version as a staff screen reads it. The book and the change summary are jsonb, written by this build but not part
// of its type system, so they are parsed before anything is served or restored from them (the plan's R rule on stored books
// and drafts): the book through the application's one parse and projected onto the declared members, the changes rebuilt
// member by member. A version that does not read back as one is a defect of ours and is thrown, so the route answers
// `503` with no detail, and never a partial version.

class StoredVersionUnreadableError extends Error {
  constructor(what: "book" | "change summary") {
    super(
      `A stored price version's ${what} is not what the store declares it to be.`,
    );
    this.name = "StoredVersionUnreadableError";
  }
}

/** The archived version's book, parsed and projected. Its `version` member is not compared to its id: only the version
 *  that prices customers must name its own identity (`readActivePriceBook`). */
export function readVersionBook(version: StoredPriceVersion): PriceBook {
  const book = parseStoredBook(version.book);
  if (book === undefined) throw new StoredVersionUnreadableError("book");
  return book;
}

export function versionListWireOf(
  page: PriceVersionPage,
): PriceVersionListWire {
  return {
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
    versions: page.versions.map(summaryWireOf),
  };
}

function summaryWireOf(summary: PriceVersionSummary): PriceVersionSummaryWire {
  return {
    versionId: summary.versionId,
    sequenceNumber: summary.sequenceNumber,
    label: summary.label,
    state: summary.state,
    publishedAt: summary.publishedAt.toISOString(),
    changeCount: summary.changeCount,
  };
}

export function versionWireOf(version: StoredPriceVersion): PriceVersionWire {
  const changes = readStoredDraft(version.changeSummary);
  if (!changes.ok) throw new StoredVersionUnreadableError("change summary");
  return {
    versionId: version.versionId,
    sequenceNumber: version.sequenceNumber,
    label: version.label,
    note: version.note,
    state: version.state,
    publishedAt: version.publishedAt.toISOString(),
    book: readVersionBook(version),
    changes: changes.changes,
  };
}
