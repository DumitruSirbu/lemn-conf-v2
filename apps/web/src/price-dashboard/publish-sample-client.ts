import {
  applyChanges,
  type ApplyChangesResult,
  judgeVersionLabel,
  revertChange,
  type DraftChange,
  type PriceBook,
} from "@lemnaria/configurator-domain";

import { judgeDraft } from "./draft-judgement";
import {
  MAX_VERSION_PAGE,
  type CandidateRefusalWire,
  type DashboardStateWire,
  type PriceVersionSummaryWire,
  type PublishRequestWire,
} from "./price-dashboard-wire-contract";
import type {
  DiscardOutcome,
  DraftWriteOutcome,
  PublishClient,
  PublishOutcome,
  RestoreOutcome,
  VersionPageOutcome,
} from "./publish-client";
import { planRestore, type VersionDetailInput } from "./publish-model";
import { publishTextRefusalCodeOf } from "./publish-text-refusal";

// A client over memory for builds that show samples. Loaded only outside production, next to `publish-sample.ts`.

/** What a sample desk starts from: the dashboard's state, and the archived books a restore may name by version id. */
export interface SampleDeskStart {
  readonly state: DashboardStateWire;
  readonly archived: ReadonlyMap<string, PriceBook>;
  /** Every version of the history, newest first, and how many a page holds. Left out, the history is empty. */
  readonly history?: {
    readonly versions: readonly PriceVersionSummaryWire[];
    readonly pageSize: number;
  };
}

/** What a write of the sample desk comes to: it stores the draft or it does not. */
type StoredOutcome = Extract<
  DraftWriteOutcome,
  { readonly kind: "changed" | "failed" }
>;

const SAMPLE_VERSION_PREFIX = "sample-version-";
const SAMPLE_VERSION_DIGITS = 8;
const FIRST_VERSION_PAGE = 1;

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
  const desk = {
    state: start.state,
    writes: 0,
    versions: start.history?.versions ?? [],
  };
  const pageSize = start.history?.pageSize ?? 1;
  const isStale = (expected: string): boolean =>
    expected !== desk.state.draft.draftRevision;
  const nextRevision = (): string => {
    desk.writes += 1;
    return `sample-${String(desk.writes)}`;
  };
  const store = (changes: readonly DraftChange[]): StoredOutcome => {
    if (!applyChanges(desk.state.active.book, changes).ok) {
      return { kind: "failed" };
    }
    const draft = { draftRevision: nextRevision(), changes };
    desk.state = { ...desk.state, draft };
    return { kind: "changed", draft };
  };

  const storeChange = (change: DraftChange): DraftWriteOutcome => {
    const kept = revertChange(desk.state.draft.changes, change.address);
    const changes = [...kept, change];
    const judgement = judgeDraft({
      book: desk.state.active.book,
      changes,
      firstNewIndex: kept.length,
      stored: desk.state.draft.changes,
    });
    switch (judgement.kind) {
      case "refused-new-change":
        return { kind: "refused", code: judgement.code };
      case "candidate-refused":
        return { kind: "candidate-refused" };
      case "applies":
        return store(changes);
    }
  };

  const discarded = (): DiscardOutcome => {
    const draft = { draftRevision: nextRevision(), changes: [] };
    desk.state = { ...desk.state, draft };
    return { kind: "changed", draft };
  };

  const publish = (request: PublishRequestWire): PublishOutcome => {
    const label = judgeVersionLabel(request.label);
    if (!label.ok) {
      return { kind: "invalid", code: publishTextRefusalCodeOf(label.code) };
    }
    const { active, draft } = desk.state;
    const isStalePublish =
      isStale(request.expectedDraftRevision) ||
      request.expectedActiveSequence !== active.sequenceNumber;
    if (isStalePublish || draft.changes.length === 0) {
      return { kind: "conflict" };
    }
    const applied = applyChanges(active.book, draft.changes);
    if (!applied.ok) {
      return { kind: "candidate-refused", refusals: refusalsOf(applied) };
    }
    if (request.expectedAvailabilityRevision !== active.availability.revision) {
      return { kind: "conflict" };
    }
    return publishVersion({ label: label.text, book: applied.book, request });
  };

  const publishVersion = ({
    label,
    book,
    request,
  }: {
    readonly label: string;
    readonly book: PriceBook;
    readonly request: PublishRequestWire;
  }): PublishOutcome => {
    const sequenceNumber = desk.state.active.sequenceNumber + 1;
    const versionId = sampleVersionIdOf(sequenceNumber);
    const publishedAt = new Date().toISOString();
    desk.versions = [
      {
        versionId,
        sequenceNumber,
        label,
        state: "active",
        publishedAt,
        changeCount: desk.state.draft.changes.length,
      },
      ...desk.versions.map((version) => ({
        ...version,
        state: "archived" as const,
      })),
    ];
    desk.state = {
      active: {
        ...desk.state.active,
        versionId,
        sequenceNumber,
        label,
        publishedAt,
        book,
      },
      draft: { draftRevision: nextRevision(), changes: [] },
    };
    return {
      kind: "published",
      published: {
        versionId,
        sequenceNumber,
        availabilityRevision: request.expectedAvailabilityRevision,
      },
    };
  };

  return {
    readState: () => Promise.resolve(desk.state),
    change: ({ expectedDraftRevision, change }) =>
      Promise.resolve(
        isStale(expectedDraftRevision)
          ? { kind: "conflict" }
          : storeChange(change),
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
    discardDraft: ({ expectedDraftRevision }) =>
      Promise.resolve<DiscardOutcome>(
        isStale(expectedDraftRevision) ? { kind: "conflict" } : discarded(),
      ),
    readVersionPage: (page) =>
      Promise.resolve(pageOfHistory(desk.versions, pageSize, page)),
    publish: (request) => Promise.resolve(publish(request)),
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

function refusalsOf(
  refused: Exclude<ApplyChangesResult, { readonly ok: true }>,
): readonly CandidateRefusalWire[] {
  if (refused.reason === "candidate-refused") {
    return [{ source: "pricing", code: refused.failure.code }];
  }
  return refused.refusals.map(({ index, code }) => ({
    source: "changes",
    index,
    code,
  }));
}

function pageOfHistory(
  versions: readonly PriceVersionSummaryWire[],
  pageSize: number,
  page: number,
): VersionPageOutcome {
  if (!isListablePage(page)) return { kind: "failed" };
  const first = (page - FIRST_VERSION_PAGE) * pageSize;
  return {
    kind: "listed",
    list: {
      total: versions.length,
      page,
      pageSize,
      versions: versions.slice(first, first + pageSize),
    },
  };
}

/** The pages a route lists: whole numbers from the first to `MAX_VERSION_PAGE`. */
function isListablePage(page: number): boolean {
  return (
    Number.isSafeInteger(page) &&
    page >= FIRST_VERSION_PAGE &&
    page <= MAX_VERSION_PAGE
  );
}
