import type { ItemRef } from "@lemnaria/configurator-domain";

import type {
  CandidateRefusalWire,
  DashboardDraftWire,
  DashboardStateWire,
  DraftChangeRefusalCode,
  DraftChangeRequestWire,
  DraftDiscardRequestWire,
  DraftRevertRequestWire,
  PriceVersionListWire,
  PublishedWire,
  PublishRequestWire,
  PublishTextRefusalCode,
  RestoreRequestWire,
} from "./price-dashboard-wire-contract";

// What the screens write through. Each outcome names every answer a route can give that the screen tells apart; any other
// answer is `failed`, and `session-ended` is a `401` that the screen raises to the staff frame.

/**
 * A `409` that says the page cannot go on as drawn: the stored draft cannot be read (the revision is what giving it up is
 * made at), or no version was ever published.
 */
export type DraftStateRefusal =
  | { readonly kind: "draft-unreadable"; readonly draftRevision: string }
  | { readonly kind: "no-active-version" };

/**
 * The draft after a write, or why it was not written. `conflict` is `changed-meanwhile`: nothing was written. `refused`
 * is a `400` naming the code the person can correct, and `candidate-refused` the `409` of a draft that no longer makes a book.
 */
export type DraftWriteOutcome =
  | { readonly kind: "changed"; readonly draft: DashboardDraftWire }
  | { readonly kind: "refused"; readonly code: DraftChangeRefusalCode }
  | { readonly kind: "candidate-refused" }
  | { readonly kind: "conflict" }
  | DraftStateRefusal
  | { readonly kind: "session-ended" }
  | { readonly kind: "failed" };

/** What discarding the whole draft came to: it has no value to refuse and no book to judge. */
export type DiscardOutcome = Extract<
  DraftWriteOutcome,
  { readonly kind: "changed" | "conflict" | "session-ended" | "failed" }
>;

/** One page of the history, or `failed` when it could not be read. */
export type VersionPageOutcome =
  | { readonly kind: "listed"; readonly list: PriceVersionListWire }
  | { readonly kind: "session-ended" }
  | { readonly kind: "failed" };

export type PublishBlock =
  | { readonly kind: "in-use"; readonly items: readonly ItemRef[] }
  | { readonly kind: "is-default"; readonly item: ItemRef };

export type PublishOutcome =
  | { readonly kind: "published"; readonly published: PublishedWire }
  | { readonly kind: "conflict" }
  | { readonly kind: "invalid"; readonly code: PublishTextRefusalCode }
  | { readonly kind: "blocked"; readonly block: PublishBlock }
  /** The book the draft makes failed the catalogue's judgement: retrying cannot succeed until the draft changes. */
  | {
      readonly kind: "candidate-refused";
      readonly refusals: readonly CandidateRefusalWire[];
    }
  | DraftStateRefusal
  | { readonly kind: "session-ended" }
  | { readonly kind: "failed" };

export type RestoreOutcome =
  | {
      readonly kind: "restored";
      readonly draft: DashboardDraftWire;
      readonly addedChangeCount: number;
    }
  | { readonly kind: "nothing-differs" }
  | { readonly kind: "conflict" }
  /** The draft with the restored prices no longer makes a book: retrying cannot succeed until the draft changes. */
  | { readonly kind: "candidate-refused" }
  | { readonly kind: "version-not-found" }
  | DraftStateRefusal
  | { readonly kind: "session-ended" }
  | { readonly kind: "failed" };

export interface PublishClient {
  /**
   * The dashboard's state again, after a write was refused as `changed-meanwhile`; absent when it cannot be read, a stored
   * draft that cannot be read included. A read refused because the session ended raises the staff frame's sheet itself.
   */
  readState(): Promise<DashboardStateWire | undefined>;
  publish(request: PublishRequestWire): Promise<PublishOutcome>;
  change(request: DraftChangeRequestWire): Promise<DraftWriteOutcome>;
  revert(request: DraftRevertRequestWire): Promise<DraftWriteOutcome>;
  /** Resets the draft to empty without reading it, so it works on a draft that cannot be read. */
  discardDraft(request: DraftDiscardRequestWire): Promise<DiscardOutcome>;
  /** One page of the published versions, newest first; pages count from 1. */
  readVersionPage(page: number): Promise<VersionPageOutcome>;
  restore(
    versionId: string,
    request: RestoreRequestWire,
  ): Promise<RestoreOutcome>;
}
