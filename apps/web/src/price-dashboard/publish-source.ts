import "server-only";

import {
  readAdmitted,
  readDeletionFactsOfPage,
  readFirstVersionPage,
  readPredecessorOf,
  readStateReading,
  readVersion,
} from "./admitted-state-read";
import { pendingPriceCountOf } from "./cabinet-list-model";
import type {
  DashboardStateWire,
  PriceVersionWire,
} from "./price-dashboard-wire-contract";
import { readDashboardStateWire } from "./price-dashboard-wire-reading";
import type { DeletionFacts } from "./publish-deletions";
import type { PublishPageInput, VersionDetailInput } from "./publish-model";
import { romanianCabinetNamesOf } from "./romanian-cabinet-names";

// The one place the publish screens' facts come from: the dashboard's state and the history, read for a page whose
// staff gate (`price.edit`) has already admitted the reader. A render reads and never writes: no session, no limiter
// bucket, no audit row. What cannot be read is `unavailable` and no price is claimed; a draft that cannot be read is
// told apart, because the one thing that works on it is giving it up, at the revision it names.

export type PublishPageRead =
  | { readonly kind: "ready"; readonly input: PublishPageInput }
  /** The store holds a draft it cannot read; the revision is what giving it up is made at. */
  | { readonly kind: "draft-unreadable"; readonly draftRevision: string }
  | { readonly kind: "unavailable" };

export type VersionDetailRead =
  | { readonly kind: "ready"; readonly input: VersionDetailInput }
  | { readonly kind: "draft-unreadable"; readonly draftRevision: string }
  | { readonly kind: "not-found" }
  | { readonly kind: "unavailable" };

/** What the state came to for a page: the state, or why the page cannot be drawn from it. */
type StateOfPage =
  | { readonly kind: "ready"; readonly state: DashboardStateWire }
  | Exclude<PublishPageRead, { readonly kind: "ready" }>;

/** The page's input, its cabinets named in Romanian on both routes. */
export async function readPublishPage(): Promise<PublishPageRead> {
  const read = await readStateOfPage();
  if (read.kind !== "ready") return read;
  const { state } = read;
  const versions = await readAdmitted(readFirstVersionPage);
  if (versions.kind === "unavailable") return versions;
  return {
    kind: "ready",
    input: {
      state,
      versions: versions.value,
      cabinetNames: romanianCabinetNamesOf(state.active.book),
      deletionFacts: await readDeletionFactsOrNothing(state),
    },
  };
}

/**
 * What the draft's deletions are counted and defaulted by, for display only: the publish counts again in its own request.
 * `undefined` where that cannot be had, so the page can judge nothing.
 */
async function readDeletionFactsOrNothing({
  active,
  draft,
}: DashboardStateWire): Promise<DeletionFacts | undefined> {
  const read = await readAdmitted(() =>
    readDeletionFactsOfPage({ book: active.book, changes: draft.changes }),
  );
  return read.kind === "read" ? read.value : undefined;
}

export async function readVersionDetail(
  versionId: string,
): Promise<VersionDetailRead> {
  const found = await readAdmitted(() => readVersion(versionId));
  if (found.kind === "unavailable") return found;
  const { value: version } = found;
  if (version === undefined) return { kind: "not-found" };
  const read = await readStateOfPage();
  if (read.kind !== "ready") return read;
  const predecessor = await readAdmitted(() =>
    readPredecessorOf(version.sequenceNumber),
  );
  if (predecessor.kind === "unavailable") return predecessor;
  return {
    kind: "ready",
    input: versionDetailInputOf({
      version,
      predecessor: predecessor.value,
      state: read.state,
    }),
  };
}

function versionDetailInputOf({
  version,
  predecessor,
  state,
}: {
  readonly version: PriceVersionWire;
  readonly predecessor: PriceVersionWire | undefined;
  readonly state: DashboardStateWire;
}): VersionDetailInput {
  return {
    version,
    predecessor:
      predecessor === undefined
        ? undefined
        : {
            sequenceNumber: predecessor.sequenceNumber,
            book: predecessor.book,
          },
    active: {
      sequenceNumber: state.active.sequenceNumber,
      book: state.active.book,
    },
    draft: state.draft,
    cabinetNames: {
      ...(predecessor === undefined
        ? {}
        : romanianCabinetNamesOf(predecessor.book)),
      ...romanianCabinetNamesOf(version.book),
      ...romanianCabinetNamesOf(state.active.book),
    },
  };
}

/**
 * How many prices the draft holds, or nothing when that cannot be known. The staff frame draws a number, or the
 * "all published" line for a known zero, and draws nothing at all for an unknown count: an unreadable store, an
 * unreadable draft and a dashboard with no version are never reported as an empty draft.
 */
export async function readPendingPriceCount(): Promise<number | undefined> {
  const read = await readStateOfPage();
  return read.kind === "ready"
    ? pendingPriceCountOf(read.state.draft)
    : undefined;
}

async function readStateOfPage(): Promise<StateOfPage> {
  const read = await readStateReading();
  if (read.kind === "unavailable") return read;
  const reading = read.value;
  if (reading.kind === "draft-unreadable") return reading;
  if (reading.kind === "no-active-version") return { kind: "unavailable" };
  const state = readDashboardStateWire(reading.wire);
  return state === undefined
    ? { kind: "unavailable" }
    : { kind: "ready", state };
}
