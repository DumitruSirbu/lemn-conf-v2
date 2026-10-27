import {
  applyChanges,
  MAX_BOOK_NAME_LENGTH,
  revertChange,
  type DraftChange,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import type {
  DashboardStateWire,
  PublishTextRefusalCode,
} from "./price-dashboard-wire-contract";
import type {
  DraftWriteOutcome,
  PublishClient,
  RestoreOutcome,
} from "./publish-client";
import { planRestore, type VersionDetailInput } from "./publish-model";

// A client over memory for builds that show samples. Loaded only outside production, next to `publish-sample.ts`.

/** What a sample desk starts from: the dashboard's state, and the archived books a restore may name by version id. */
export interface SampleDeskStart {
  readonly state: DashboardStateWire;
  readonly archived: ReadonlyMap<string, PriceBook>;
}

const SAMPLE_VERSION_PREFIX = "sample-version-";
const SAMPLE_VERSION_DIGITS = 8;

/** Control, surrogate and line-separator characters: the text rule of the contact fields, which a version's name follows. */
const FORBIDDEN_CHARACTER = /[\p{Cc}\p{Cs}\p{Zl}\p{Zp}]/u;

/** The id the sample gives version number `sequenceNumber`: the books and the client must agree on it. */
export function sampleVersionIdOf(sequenceNumber: number): string {
  return `${SAMPLE_VERSION_PREFIX}${String(sequenceNumber).padStart(SAMPLE_VERSION_DIGITS, "0")}`;
}

/** The client for the version page: its desk is the active book and the draft the page read, and it may restore that version. */
export function makeSampleVersionClient(
  input: VersionDetailInput,
): PublishClient {
  return makeSamplePublishClient({
    state: {
      active: {
        versionId: sampleVersionIdOf(input.active.sequenceNumber),
        book: input.active.book,
        availability: { revision: "0", disabled: [] },
        sequenceNumber: input.active.sequenceNumber,
        label: "",
        publishedAt: "",
      },
      draft: input.draft,
    },
    archived: new Map([[input.version.versionId, input.version.book]]),
  });
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
      if (desk.state.draft.changes.length === 0) {
        return Promise.resolve({ kind: "conflict" });
      }
      const applied = applyChanges(
        desk.state.active.book,
        desk.state.draft.changes,
      );
      if (!applied.ok) return Promise.resolve({ kind: "candidate-refused" });
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
      if (archived === undefined) {
        return Promise.resolve({ kind: "version-not-found" });
      }
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
      const restored: RestoreOutcome =
        outcome.kind === "changed"
          ? {
              kind: "restored",
              draft: outcome.draft,
              addedChangeCount: plan.addedChangeCount,
            }
          : outcome;
      return Promise.resolve(restored);
    },
  };
}

function refusalOfVersionName(
  label: string,
): PublishTextRefusalCode | undefined {
  if (label.trim() === "") return "TEXT_EMPTY";
  if (label.length > MAX_BOOK_NAME_LENGTH) return "TEXT_TOO_LONG";
  return FORBIDDEN_CHARACTER.test(label)
    ? "TEXT_FORBIDDEN_CHARACTER"
    : undefined;
}
