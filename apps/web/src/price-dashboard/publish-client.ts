import type { ItemRef } from "@lemnaria/configurator-domain";

import type {
  DashboardDraftWire,
  DashboardStateWire,
  DraftChangeRequestWire,
  DraftRevertRequestWire,
  PublishedWire,
  PublishRequestWire,
  PublishTextRefusalCode,
  RestoreRequestWire,
} from "./price-dashboard-wire-contract";

// What the screens write through. A production build has no server to write to: it answers `failed` and writes nothing.

/** The draft after a write, or why it was not written. `conflict` is `changed-meanwhile`: nothing was written. */
export type DraftWriteOutcome =
  | { readonly kind: "changed"; readonly draft: DashboardDraftWire }
  | { readonly kind: "conflict" }
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
  | { readonly kind: "candidate-refused" }
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
  restore(
    versionId: string,
    request: RestoreRequestWire,
  ): Promise<RestoreOutcome>;
}

/** What a call answers, or `failed` when the client throws or its promise rejects: a screen is never left waiting on one. */
export async function orFailed<Outcome>(
  call: () => Promise<Outcome>,
  failed: Outcome,
): Promise<Outcome> {
  try {
    return await call();
  } catch {
    return failed;
  }
}

export const UNAVAILABLE_PUBLISH_CLIENT: PublishClient = {
  readState: () => Promise.resolve(undefined),
  publish: () => Promise.resolve({ kind: "failed" }),
  change: () => Promise.resolve({ kind: "failed" }),
  revert: () => Promise.resolve({ kind: "failed" }),
  restore: () => Promise.resolve({ kind: "failed" }),
};

/** A client that is loaded by its first call, so the module behind `load` is fetched only if something is written. */
export function lazyClient(load: () => Promise<PublishClient>): PublishClient {
  let loaded: Promise<PublishClient> | undefined;
  const client = (): Promise<PublishClient> => (loaded ??= load());
  return {
    readState: async () => (await client()).readState(),
    publish: async (request) => (await client()).publish(request),
    change: async (request) => (await client()).change(request),
    revert: async (request) => (await client()).revert(request),
    restore: async (versionId, request) =>
      (await client()).restore(versionId, request),
  };
}
