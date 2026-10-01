// **Adversarial QA, M7 wave 7F2 slice S3b — the writes not yet seen, at the pure seam.**
//
// The implementer's own loop model (`room-query-sync.test.ts`, `ReconciliationLoop`) makes every
// written text distinct: wall A only grows, and its `settle` skips a text already written. The hook
// does neither. A customer who types *3*, *36* and backspaces to *3* dispatches `wallA=0.003`
// twice, and the pruning rule (`writtenAfter`, *"the writes dispatched after the newest copy"*) then
// has two copies to choose between. This file drives `reconcileRoomDraft` the way the hook does —
// a settle writes whenever `liveText !== draftText` and records every dispatch — with backspace in
// the alphabet, so a text can recur.
//
// Three delivery orders:
// - **newer write discards older** — Next's rule with nothing committed early: a dispatch discards
//   every write still in flight, so only the newest can echo.
// - **mixed** — the implementer's own `ReconciliationLoop` echo: any in-flight write may echo, and
//   the ones older than it are discarded (they had not committed). This is the plan's *superseded
//   write dropped* and *commit race* arms interleaved.
// - **commit race** — every write echoes, oldest first (S3b-1's second arm).
// Under every one, each arrival is a write of this screen's, so no arrival may re-seed the draft.
import { fc } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import {
  canonicalRoomQuery,
  queryFromSearchParams,
  reconcileRoomDraft,
  roomDraftFromQuery,
} from "@/room/room-query-sync";
import { withEnteredText, type RoomDraft } from "@/room/room-draft";

const RUNS = 1_000;

const THE_EMPTY_L_ROOM = "shape=L&direction=left";

type Edit =
  | { readonly kind: "append"; readonly digit: string }
  | { readonly kind: "backspace" };

type LoopStep =
  | { readonly kind: "edit"; readonly edit: Edit }
  | { readonly kind: "settle" }
  | { readonly kind: "echo"; readonly discardedOlder: number };

type DeliveryOrder = "newer write discards older" | "mixed" | "commit race";

interface DispatchedWrite {
  readonly text: string;
  readonly sequence: number;
}

function textOf(draft: RoomDraft): string {
  return canonicalRoomQuery(draft).toString();
}

function wallAOf(draft: RoomDraft): string {
  return draft.lengths.wallA.text;
}

function typedIntoWallA(text: string): RoomDraft {
  const query = queryFromSearchParams(new URLSearchParams(THE_EMPTY_L_ROOM));
  return withEnteredText(roomDraftFromQuery("L", query), {
    field: "wallA",
    text,
  });
}

/**
 * The hook, reduced to the pure rule and the two things around it that feed the list: the settle
 * (writes the draft's text whenever the live query differs, and records it) and the router
 * (hands echoes back in dispatch order). `reseeds` counts arrivals the rule read as another room.
 */
class HookModel {
  draft: RoomDraft = typedIntoWallA("");
  lastSeenText = THE_EMPTY_L_ROOM;
  writtenNotYetSeen: readonly string[] = [];
  undelivered: DispatchedWrite[] = [];
  dispatched = 0;
  lastSeenSequence = -1;
  reseeds = 0;
  /** Every arrival that changed `liveText`, with the list before and after it. */
  visibleArrivals: {
    before: readonly string[];
    arrived: string;
    after: readonly string[];
  }[] = [];

  constructor(private readonly order: DeliveryOrder) {}

  apply(step: LoopStep): void {
    if (step.kind === "edit") this.edit(step.edit);
    if (step.kind === "settle") this.settle();
    if (step.kind === "echo") this.echo(step.discardedOlder);
  }

  deliverEverything(): void {
    for (let guard = 0; guard < 50; guard += 1) {
      if (this.undelivered.length > 0) {
        this.echo(this.order === "commit race" ? 0 : Number.MAX_SAFE_INTEGER);
        continue;
      }
      if (this.lastSeenText === textOf(this.draft)) return;
      this.settle();
    }
    throw new Error("the loop did not settle in 50 steps");
  }

  private edit(edit: Edit): void {
    const shown = wallAOf(this.draft);
    const text =
      edit.kind === "append" ? shown + edit.digit : shown.slice(0, -1);
    this.draft = withEnteredText(this.draft, { field: "wallA", text });
  }

  private settle(): void {
    const draftText = textOf(this.draft);
    if (draftText === this.lastSeenText) return;
    if (this.order === "newer write discards older") this.undelivered = [];
    this.undelivered.push({ text: draftText, sequence: this.dispatched });
    this.dispatched += 1;
    this.writtenNotYetSeen = [...this.writtenNotYetSeen, draftText];
  }

  private echo(discardedOlder: number): void {
    if (this.undelivered.length === 0) return;
    const index =
      this.order === "commit race"
        ? 0
        : Math.min(discardedOlder, this.undelivered.length - 1);
    const arrived = this.undelivered[index];
    if (arrived === undefined) return;
    this.undelivered = this.undelivered.slice(index + 1);
    this.arrive(arrived);
  }

  private arrive(arrived: DispatchedWrite): void {
    const before = this.draft;
    const reconciled = reconcileRoomDraft({
      draft: this.draft,
      lastSeenText: this.lastSeenText,
      liveQuery: queryFromSearchParams(new URLSearchParams(arrived.text)),
      liveText: arrived.text,
      writtenNotYetSeen: this.writtenNotYetSeen,
    });
    const isVisible = reconciled.lastSeenText !== this.lastSeenText;
    if (isVisible && reconciled.draft !== before) this.reseeds += 1;
    if (isVisible) {
      this.visibleArrivals.push({
        before: this.writtenNotYetSeen,
        arrived: arrived.text,
        after: reconciled.writtenNotYetSeen,
      });
    }
    this.draft = reconciled.draft;
    this.lastSeenText = reconciled.lastSeenText;
    this.writtenNotYetSeen = reconciled.writtenNotYetSeen;
    this.lastSeenSequence = arrived.sequence;
  }
}

/** Two digits and a backspace, so a text the settle already wrote comes round again often enough for
 *  the sweep to draw it: with nine digits it almost never does, which is how 300 runs of a wider
 *  alphabet stayed green over the concrete counterexample above. */
const ANY_EDIT: fc.Arbitrary<Edit> = fc.oneof(
  fc
    .constantFrom("3", "6")
    .map((digit) => ({ kind: "append", digit }) as const),
  fc.constant({ kind: "backspace" } as const),
);

const ANY_LOOP_STEP: fc.Arbitrary<LoopStep> = fc.oneof(
  ANY_EDIT.map((edit) => ({ kind: "edit", edit }) as const),
  fc.constant({ kind: "settle" } as const),
  fc
    .integer({ min: 0, max: 3 })
    .map((discardedOlder) => ({ kind: "echo", discardedOlder }) as const),
);

describe("a text written twice is still ours when its older copy echoes (S3b-1, S3b-7)", () => {
  it("keeps 35 when 3, 36 and 3 again were written and echo oldest first (commit race)", () => {
    const model = new HookModel("commit race");
    for (const text of ["3", "36", "3"]) {
      model.draft = typedIntoWallA(text);
      model.apply({ kind: "settle" });
    }
    model.draft = typedIntoWallA("35");

    model.deliverEverything();

    expect(wallAOf(model.draft)).toBe("35");
    expect(model.reseeds).toBe(0);
  });

  // `mixed` is left out here only because it draws the commit-race interleaving too rarely to be red
  // on every run; the two arms kept are its deterministic ends.
  it.each<DeliveryOrder>(["newer write discards older", "commit race"])(
    "never re-seeds on an echo of this screen's own writes, with backspace, under %s",
    (order) => {
      fc.assert(
        fc.property(
          fc.array(ANY_LOOP_STEP, { maxLength: 40, size: "max" }),
          (steps) => {
            const model = new HookModel(order);
            for (const step of steps) model.apply(step);
            const typed = wallAOf(model.draft);

            model.deliverEverything();

            expect(model.reseeds).toBe(0);
            expect(wallAOf(model.draft)).toBe(typed);
            expect(model.lastSeenText).toBe(textOf(model.draft));
          },
        ),
        { numRuns: RUNS },
      );
    },
  );

  // **The knowable bound** (S3b.10). A text alone cannot say which copy of a repeated write arrived,
  // so "nothing older than the arrival remains" is not a fact the rule can know. What it can know:
  // after every arrival that changes `liveText`, the list is exactly what followed the oldest copy
  // of that text, and an arrival matching nothing leaves it empty.
  it.each<DeliveryOrder>([
    "newer write discards older",
    "mixed",
    "commit race",
  ])(
    "leaves exactly the writes after the oldest copy of each arrival that changes the URL, under %s",
    (order) => {
      fc.assert(
        fc.property(
          fc.array(ANY_LOOP_STEP, { maxLength: 40, size: "max" }),
          (steps) => {
            const model = new HookModel(order);

            for (const step of steps) model.apply(step);
            model.deliverEverything();

            for (const { before, arrived, after } of model.visibleArrivals) {
              expect(after).toEqual(entriesAfterOldestCopyOf(before, arrived));
            }
          },
        ),
        { numRuns: RUNS },
      );
    },
  );
});

/** The oracle, walked from the oldest end rather than by index arithmetic so it cannot share a slip
 *  with production: everything after the first entry equal to `arrived`, or nothing. */
function entriesAfterOldestCopyOf(
  list: readonly string[],
  arrived: string,
): readonly string[] {
  const remaining = [...list];
  while (remaining.length > 0) {
    if (remaining.shift() === arrived) return remaining;
  }
  return [];
}
