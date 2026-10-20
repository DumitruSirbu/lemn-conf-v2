import { fc, test as propertyTest } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import {
  forgetEditorOrigin,
  readStepOneAccountCardLatch,
  recordEditedEditorLeft,
  recordEditorOpenedFromStepOne,
  recordStepOneAccountCardOffered,
  resetStepOneAccountCardLatchForTests,
  type StepOneAccountCardLatch,
} from "@/app/configurator/configure/back-guard";

/**
 * Lot 2 U15d (plan M8B Lot 2 section 14.2, U15-4): the latch behind "the card renders at most once per document".
 *
 * Over any sequence of the four things that can happen to it (Step 1 hands over to an editor, an editor is left by
 * confirming, the editor forgets its origin, "Nu acum"), the latch must equal what the sequence's history says, and it
 * must only ever move forward. The reference is read from the whole history (the first confirmation that counts, and
 * whether anything that spends it came after), not run as a second state machine, so a transition the production
 * machine gets wrong is not copied.
 */

type Design = "first" | "second";
type Event =
  | { readonly kind: "hand-over"; readonly design: Design }
  | {
      readonly kind: "leave";
      readonly design: Design | null;
      readonly hasBeenEdited: boolean;
    }
  | { readonly kind: "forget-origin" }
  | { readonly kind: "not-now" };

const DESIGN_IDS: Readonly<Record<Design, string>> = {
  first: "abcdefghijklmnopqrstu",
  second: "ABCDEFGHIJKLMNOPQRSTU",
};
const ORDER: readonly StepOneAccountCardLatch[] = ["none", "due", "offered"];

const design = fc.constantFrom<Design>("first", "second");
const event: fc.Arbitrary<Event> = fc.oneof(
  design.map((chosen): Event => ({ kind: "hand-over", design: chosen })),
  fc.record({
    kind: fc.constant("leave" as const),
    design: fc.option(design, { nil: null }),
    hasBeenEdited: fc.boolean(),
  }),
  fc.constant<Event>({ kind: "forget-origin" }),
  fc.constant<Event>({ kind: "not-now" }),
);
const history = fc.array(event, { maxLength: 24 });

/** Each run of a property is its own document: the latch and the origin are module state, so a run starts them over. */
function startANewDocument(): void {
  resetStepOneAccountCardLatchForTests();
  forgetEditorOrigin();
}

function apply(step: Event): void {
  switch (step.kind) {
    case "hand-over":
      recordEditorOpenedFromStepOne(DESIGN_IDS[step.design]);
      return;
    case "leave":
      recordEditedEditorLeft({
        designId: step.design === null ? null : DESIGN_IDS[step.design],
        hasBeenEdited: step.hasBeenEdited,
      });
      return;
    case "forget-origin":
      forgetEditorOrigin();
      return;
    case "not-now":
      recordStepOneAccountCardOffered();
      return;
  }
}

/** The index of the first confirmation that owes the card: an edited editor of the design Step 1 last handed over to. */
function indexOfFirstOwingLeave(events: readonly Event[]): number {
  let handedOverTo: Design | null = null;
  for (const [index, step] of events.entries()) {
    if (step.kind === "hand-over") handedOverTo = step.design;
    if (step.kind === "forget-origin") handedOverTo = null;
    const isOwing =
      step.kind === "leave" &&
      step.hasBeenEdited &&
      step.design !== null &&
      step.design === handedOverTo;
    if (isOwing) return index;
  }
  return -1;
}

function latchTheHistoryImplies(
  events: readonly Event[],
): StepOneAccountCardLatch {
  const owedAt = indexOfFirstOwingLeave(events);
  if (owedAt === -1) return "none";
  const isSpentAfter = events
    .slice(owedAt + 1)
    .some((step) => step.kind === "hand-over" || step.kind === "not-now");
  return isSpentAfter ? "offered" : "due";
}

describe("the Step 1 account card's latch", () => {
  propertyTest.prop([history], { seed: 20261020, numRuns: 400 })(
    "after any history it is what the history implies",
    (events) => {
      startANewDocument();
      for (const step of events) apply(step);

      expect(readStepOneAccountCardLatch()).toBe(
        latchTheHistoryImplies(events),
      );
    },
  );

  propertyTest.prop([history], { seed: 20261021, numRuns: 400 })(
    "after every event it is the same or further on (none, due, offered), never back",
    (events) => {
      startANewDocument();
      let rankBefore = ORDER.indexOf(readStepOneAccountCardLatch());

      for (const step of events) {
        apply(step);
        const rankAfter = ORDER.indexOf(readStepOneAccountCardLatch());
        expect(rankAfter).toBeGreaterThanOrEqual(rankBefore);
        rankBefore = rankAfter;
      }
    },
  );

  propertyTest.prop([history, history], { seed: 20261022, numRuns: 300 })(
    "once offered, no history that follows makes it owed again",
    (before, after) => {
      startANewDocument();
      for (const step of before) apply(step);
      fc.pre(readStepOneAccountCardLatch() === "offered");

      for (const step of after) apply(step);

      expect(readStepOneAccountCardLatch()).toBe("offered");
    },
  );
});
