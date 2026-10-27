import {
  applyChanges,
  revertChange,
  type DraftChange,
  type ItemRef,
  type PriceBook,
} from "@lemnaria/configurator-domain";

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
import { MAX_VERSION_NAME_LENGTH, planRestore } from "./publish-model";

// The screens' only way to write: publish, restore, and the two draft writes the publish page makes (a ↺ and the
// "Sume provizorii" switch). It is the one file R3 replaces, with `fetch` calls to the routes of `PublishRequestWire`,
// `DraftRevertRequestWire`, `DraftChangeRequestWire` and `RestoreRequestWire` (their answers are the wire contract's), and
// until then a production build answers `failed` to every call and any other build answers from memory, so nothing is ever
// written and no real price is claimed. The screens take a client as a prop, so a test hands them one that fails.

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
  | { readonly kind: "failed" };

export type RestoreOutcome =
  | {
      readonly kind: "restored";
      readonly draft: DashboardDraftWire;
      readonly addedChangeCount: number;
    }
  | { readonly kind: "nothing-differs" }
  | { readonly kind: "conflict" }
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

/** The client of a build that has no server to write to: every write fails and nothing changes. */
export const UNAVAILABLE_PUBLISH_CLIENT: PublishClient = {
  readState: () => Promise.resolve(undefined),
  publish: () => Promise.resolve({ kind: "failed" }),
  change: () => Promise.resolve({ kind: "failed" }),
  revert: () => Promise.resolve({ kind: "failed" }),
  restore: () => Promise.resolve({ kind: "failed" }),
};

/** What a sample desk starts from: the dashboard's state, and the archived books a restore may name by version id. */
export interface SampleDeskStart {
  readonly state: DashboardStateWire;
  readonly archived: ReadonlyMap<string, PriceBook>;
}

/** The client of this build: the failing one in a production build, which has no server to write to, else an in-memory one. */
export function defaultPublishClient(start: SampleDeskStart): PublishClient {
  return process.env.NODE_ENV === "production"
    ? UNAVAILABLE_PUBLISH_CLIENT
    : makeSamplePublishClient(start);
}

const SAMPLE_VERSION_PREFIX = "sample-version-";
const SAMPLE_VERSION_DIGITS = 8;

/** The id the sample gives version number `sequenceNumber`: the books and the client must agree on it. */
export function sampleVersionIdOf(sequenceNumber: number): string {
  return `${SAMPLE_VERSION_PREFIX}${String(sequenceNumber).padStart(SAMPLE_VERSION_DIGITS, "0")}`;
}

/** An in-memory client over the starting facts. Its draft revision is the count of writes so far, as a string. */
export function makeSamplePublishClient(start: SampleDeskStart): PublishClient {
  const desk = { state: start.state, writes: 0 };
  const isStale = (expected: string): boolean =>
    expected !== desk.state.draft.draftRevision;
  const nextRevision = (): string => {
    desk.writes += 1;
    return `sample-${String(desk.writes)}`;
  };
  const store = (changes: readonly DraftChange[]): DraftWriteOutcome => {
    if (!applyChanges(desk.state.active.book, changes).ok) {
      return { kind: "failed" };
    }
    const draft = { draftRevision: nextRevision(), changes };
    desk.state = { ...desk.state, draft };
    return { kind: "changed", draft };
  };

  return {
    readState: () => Promise.resolve(desk.state),
    change: ({ expectedDraftRevision, change }) =>
      Promise.resolve(
        isStale(expectedDraftRevision)
          ? { kind: "conflict" }
          : store([
              ...revertChange(desk.state.draft.changes, change.address),
              change,
            ]),
      ),
    revert: ({ expectedDraftRevision, target }) =>
      Promise.resolve(
        isStale(expectedDraftRevision)
          ? { kind: "conflict" }
          : store(
              target.kind === "change"
                ? revertChange(desk.state.draft.changes, target.address)
                : desk.state.draft.changes.filter(
                    (change) => change.groupId !== target.groupId,
                  ),
            ),
      ),
    publish: (request) => {
      if (isStale(request.expectedDraftRevision)) {
        return Promise.resolve({ kind: "conflict" });
      }
      const refusal = refusalOfVersionName(request.label);
      if (refusal !== undefined) {
        return Promise.resolve({ kind: "invalid", code: refusal });
      }
      const applied = applyChanges(
        desk.state.active.book,
        desk.state.draft.changes,
      );
      if (!applied.ok || desk.state.draft.changes.length === 0) {
        return Promise.resolve({ kind: "conflict" });
      }
      const sequenceNumber = desk.state.active.sequenceNumber + 1;
      const versionId = sampleVersionIdOf(sequenceNumber);
      desk.state = {
        active: {
          ...desk.state.active,
          versionId,
          sequenceNumber,
          label: request.label,
          publishedAt: new Date().toISOString(),
          book: applied.book,
        },
        draft: { draftRevision: nextRevision(), changes: [] },
      };
      return Promise.resolve({
        kind: "published",
        published: {
          versionId,
          sequenceNumber,
          availabilityRevision: request.expectedAvailabilityRevision,
        },
      });
    },
    restore: (versionId, request) => {
      const archived = start.archived.get(versionId);
      if (archived === undefined) return Promise.resolve({ kind: "failed" });
      if (isStale(request.expectedDraftRevision)) {
        return Promise.resolve({ kind: "conflict" });
      }
      const plan = planRestore({
        archived,
        active: desk.state.active.book,
        draft: desk.state.draft.changes,
      });
      if (plan.differingCount === 0) {
        return Promise.resolve({ kind: "nothing-differs" });
      }
      const outcome = store(plan.draft);
      return Promise.resolve(
        outcome.kind === "changed"
          ? {
              kind: "restored",
              draft: outcome.draft,
              addedChangeCount: plan.addedChangeCount,
            }
          : outcome,
      );
    },
  };
}

function refusalOfVersionName(
  label: string,
): PublishTextRefusalCode | undefined {
  if (label.trim() === "") return "TEXT_EMPTY";
  return label.length > MAX_VERSION_NAME_LENGTH ? "TEXT_TOO_LONG" : undefined;
}
