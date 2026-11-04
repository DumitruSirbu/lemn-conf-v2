// A draft client for the DOM tests that judges the way the dashboard's routes do, with the domain's own functions: a
// stale revision is `conflict`, a change `applyChanges` refuses is `refused` with its code, a bulk action is the
// domain's plan with the route's two extra refusals (a plan with nothing left to change is `PERCENT_OUT_OF_RANGE`), and
// every accepted write moves the revision. Every call is recorded, so a test can say what was sent and, as often, that
// nothing was.
import {
  applyChanges,
  HARDWARE_RATE_FIELDS,
  isSameAddress,
  planBulkChange,
  readEditableFields,
  revertChange,
  type DraftChange,
} from "@lemnaria/configurator-domain";

import { priceDashboardCatalogue } from "@/price-dashboard/price-dashboard-catalogue";
import type {
  BulkChangeRequestWire,
  CreateHardwareClassRequestWire,
  DashboardStateWire,
  DraftChangeRequestWire,
  DraftRevertRequestWire,
} from "@/price-dashboard/price-dashboard-wire-contract";
import type {
  BulkChangeOutcome,
  CreateHardwareClassOutcome,
  DraftChangeOutcome,
  PriceDraftClient,
} from "@/price-dashboard/price-draft-client";

export type RecordedCall =
  | { readonly kind: "change"; readonly request: DraftChangeRequestWire }
  | { readonly kind: "revert"; readonly request: DraftRevertRequestWire }
  | { readonly kind: "bulk"; readonly request: BulkChangeRequestWire }
  | {
      readonly kind: "createHardwareClass";
      readonly request: CreateHardwareClassRequestWire;
    }
  | { readonly kind: "readState" };

export interface InMemoryPriceDraftClient {
  readonly client: PriceDraftClient;
  readonly calls: RecordedCall[];
  readonly state: () => DashboardStateWire;
  /** The next write is answered with this instead of being judged, once. */
  readonly answerNextWriteWith: (
    outcome:
      | DraftChangeOutcome
      | BulkChangeOutcome
      | CreateHardwareClassOutcome,
  ) => void;
  /** Another writer moves the draft: the revision advances with no change from this screen. */
  readonly moveDraftBehindTheScreen: () => void;
  /** The next write waits for `release()`, so a test can press again while it is out. */
  readonly holdNextWrite: () => () => void;
}

export function inMemoryPriceDraftClient(
  initial: DashboardStateWire,
): InMemoryPriceDraftClient {
  let state = initial;
  let nextAnswer:
    | DraftChangeOutcome
    | BulkChangeOutcome
    | CreateHardwareClassOutcome
    | undefined;
  let created = 0;
  let held: Promise<void> | undefined;
  let groups = 0;
  const calls: RecordedCall[] = [];

  const revisionAfter = (): string =>
    String(Number(state.draft.draftRevision) + 1);
  const adopt = (changes: readonly DraftChange[]) => {
    state = {
      ...state,
      draft: { draftRevision: revisionAfter(), changes },
    };
    return state.draft;
  };
  const isStale = (revision: string) => revision !== state.draft.draftRevision;
  const gate = async () => {
    const waiting = held;
    held = undefined;
    await waiting;
  };
  const takeAnswer = () => {
    const answer = nextAnswer;
    nextAnswer = undefined;
    return answer;
  };

  const client: PriceDraftClient = {
    acceptsCreatedRowText: true,
    readState: () => {
      calls.push({ kind: "readState" });
      return Promise.resolve(state);
    },
    change: async (request) => {
      calls.push({ kind: "change", request });
      await gate();
      const forced = takeAnswer() as DraftChangeOutcome | undefined;
      if (forced !== undefined) return forced;
      if (isStale(request.expectedDraftRevision)) return { kind: "conflict" };
      const kept = state.draft.changes.filter(
        (held_) => !isSameAddress(held_.address, request.change.address),
      );
      const changes = [...kept, request.change as DraftChange];
      const applied = applyChanges(state.active.book, changes);
      if (!applied.ok && applied.reason === "changes-refused") {
        const refusal = applied.refusals.find(
          ({ index }) => index === kept.length,
        );
        if (refusal !== undefined) {
          return { kind: "refused", code: refusal.code };
        }
      }
      if (!applied.ok) return { kind: "candidate-refused" };
      return { kind: "changed", written: adopt(changes) };
    },
    revert: async (request) => {
      calls.push({ kind: "revert", request });
      await gate();
      const forced = takeAnswer() as DraftChangeOutcome | undefined;
      if (forced !== undefined) return forced;
      if (isStale(request.expectedDraftRevision)) return { kind: "conflict" };
      const { target } = request;
      const remaining =
        target.kind === "change"
          ? revertChange(state.draft.changes, target.address)
          : state.draft.changes.filter(
              ({ groupId }) => groupId !== target.groupId,
            );
      if (remaining.length === state.draft.changes.length) {
        return { kind: "refused", code: "UNKNOWN_ADDRESS" };
      }
      return { kind: "changed", written: adopt(remaining) };
    },
    bulk: async (request) => {
      calls.push({ kind: "bulk", request });
      await gate();
      const forced = takeAnswer() as BulkChangeOutcome | undefined;
      if (forced !== undefined) return forced;
      if (isStale(request.expectedDraftRevision)) return { kind: "conflict" };
      const candidate = applyChanges(state.active.book, state.draft.changes);
      if (!candidate.ok) return { kind: "candidate-refused" };
      const plan = planBulkChange({
        book: candidate.book,
        catalog: priceDashboardCatalogue(),
        target: request.target,
        percent: request.percent,
      });
      if (plan.kind === "refused") return { kind: "refused", code: plan.code };
      const changed = plan.changes.filter(
        ({ address, value }) =>
          value !==
          readEditableFields(candidate.book).find((reading) =>
            isSameAddress(reading.address, address),
          )?.value,
      );
      if (changed.length === 0) {
        return { kind: "refused", code: "PERCENT_OUT_OF_RANGE" };
      }
      groups += 1;
      const groupId = `group-${String(groups)}`;
      const minted = changed.map(
        ({ address, value }) =>
          ({
            address,
            value,
            groupId,
            bulk: { percent: request.percent, ...request.target },
          }) as unknown as DraftChange,
      );
      const kept = state.draft.changes.filter(
        (stored) =>
          !minted.some(({ address }) => isSameAddress(stored.address, address)),
      );
      const draft = adopt([...kept, ...minted]);
      const ruleIds = new Set(
        minted.flatMap(({ address }) =>
          "ruleId" in address ? [address.ruleId] : [],
        ),
      );
      return {
        kind: "changed",
        written: { draft, ruleCount: ruleIds.size, amountCount: minted.length },
      };
    },
    createHardwareClass: async (request) => {
      calls.push({ kind: "createHardwareClass", request });
      await gate();
      const forced = takeAnswer() as CreateHardwareClassOutcome | undefined;
      if (forced !== undefined) return forced;
      if (isStale(request.expectedDraftRevision)) return { kind: "conflict" };
      created += 1;
      const tierId = `hardware.created-${String(created)}`;
      const creation = {
        address: { kind: "hardware-tier-created", tierId },
        value: request.value,
      } as DraftChange;
      const rates = HARDWARE_RATE_FIELDS.map(
        (field) =>
          ({
            address: { kind: "hardware", tierId, field },
            value: request.rates[field],
          }) as DraftChange,
      );
      const changes = [...state.draft.changes, creation, ...rates];
      const applied = applyChanges(state.active.book, changes);
      if (!applied.ok && applied.reason === "changes-refused") {
        const [refusal] = applied.refusals;
        if (refusal !== undefined) {
          return { kind: "refused", code: refusal.code };
        }
      }
      if (!applied.ok) return { kind: "candidate-refused" };
      return {
        kind: "changed",
        written: {
          draft: adopt(changes),
          created: { kind: "hardware", tierId },
        },
      };
    },
  };

  return {
    client,
    calls,
    state: () => state,
    answerNextWriteWith: (outcome) => {
      nextAnswer = outcome;
    },
    moveDraftBehindTheScreen: () => {
      state = {
        ...state,
        draft: { ...state.draft, draftRevision: revisionAfter() },
      };
    },
    holdNextWrite: () => {
      let release: () => void = () => undefined;
      held = new Promise<void>((resolve) => {
        release = resolve;
      });
      return release;
    },
  };
}
