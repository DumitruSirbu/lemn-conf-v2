import type { ItemRef } from "@lemnaria/configurator-domain";

import { memoizeAsync } from "./async-seams";
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

// What the screens write through. A production build has no server to write to: it answers `failed` and writes nothing.

/**
 * The draft after a write, or why it was not written. `conflict` is `changed-meanwhile`: nothing was written. `refused`
 * is a `400` naming the code the person can correct, and `candidate-refused` the `409` of a draft that no longer makes a book.
 */
export type DraftWriteOutcome =
  | { readonly kind: "changed"; readonly draft: DashboardDraftWire }
  | { readonly kind: "refused"; readonly code: DraftChangeRefusalCode }
  | { readonly kind: "candidate-refused" }
  | { readonly kind: "conflict" }
  | { readonly kind: "failed" };

/** What discarding the whole draft came to: it has no value to refuse and no book to judge. */
export type DiscardOutcome = Extract<
  DraftWriteOutcome,
  { readonly kind: "changed" | "conflict" | "failed" }
>;

/** One page of the history, or `failed` when it could not be read. */
export type VersionPageOutcome =
  | { readonly kind: "listed"; readonly list: PriceVersionListWire }
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
  | { readonly kind: "failed" };

export type RestoreOutcome =
  | {
      readonly kind: "restored";
      readonly draft: DashboardDraftWire;
      readonly addedChangeCount: number;
    }
  | { readonly kind: "nothing-differs" }
  | { readonly kind: "conflict" }
  | { readonly kind: "version-not-found" }
  | { readonly kind: "failed" };

export interface PublishClient {
  /** The dashboard's state again, after a write was refused as `changed-meanwhile`; absent when it cannot be read. */
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

export const UNAVAILABLE_PUBLISH_CLIENT: PublishClient = {
  readState: () => Promise.resolve(undefined),
  publish: () => Promise.resolve({ kind: "failed" }),
  change: () => Promise.resolve({ kind: "failed" }),
  revert: () => Promise.resolve({ kind: "failed" }),
  discardDraft: () => Promise.resolve({ kind: "failed" }),
  readVersionPage: () => Promise.resolve({ kind: "failed" }),
  restore: () => Promise.resolve({ kind: "failed" }),
};

/** A client that is loaded by its first call, so the module behind `load` is fetched only if something is written. */
export function lazyClient(load: () => Promise<PublishClient>): PublishClient {
  const client = memoizeAsync(load);
  return {
    readState: async () => (await client()).readState(),
    publish: async (request) => (await client()).publish(request),
    change: async (request) => (await client()).change(request),
    revert: async (request) => (await client()).revert(request),
    discardDraft: async (request) => (await client()).discardDraft(request),
    readVersionPage: async (page) => (await client()).readVersionPage(page),
    restore: async (versionId, request) =>
      (await client()).restore(versionId, request),
  };
}
