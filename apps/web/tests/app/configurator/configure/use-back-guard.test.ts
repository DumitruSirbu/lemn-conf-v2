// M7C C1 S4: the decisions behind the browser-Back confirmation, as pure functions. What the
// hook does with them against a history is `use-back-guard.dom.test.ts`'s; what a real browser does
// is `back-guard.e2e.spec.ts`'s.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  forgetEditorOrigin,
  readEditorOrigin,
  recordEditorOpenedFromStepOne,
} from "@/app/configurator/configure/back-guard";
import {
  decidePopstate,
  isEditorPathnameOf,
  isGuardEntryState,
  shouldPushGuard,
  shouldRearmGuard,
  type GuardPushFacts,
  type RearmFacts,
  type PopstateFacts,
} from "@/app/configurator/configure/use-back-guard";

const DESIGN = "design-1";
const EDITOR = `/ro/d/${DESIGN}`;
const EDITOR_IN_RUSSIAN = `/ru/d/${DESIGN}`;
const STEP_ONE = "/ro/configurator/room";

const ARMED = {
  designId: DESIGN,
  guardedPathname: null,
  isBeingAnswered: false,
} as const;
const GUARDED = { ...ARMED, guardedPathname: EDITOR } as const;
const BEING_ANSWERED = { ...GUARDED, isBeingAnswered: true } as const;
const NO_ORIGIN = {
  designId: null,
  guardedPathname: null,
  isBeingAnswered: false,
} as const;

afterEach(forgetEditorOrigin);

describe("isEditorPathnameOf", () => {
  it.each([
    [`/ro/d/${DESIGN}`, true],
    [`/ru/d/${DESIGN}`, true],
    [`/d/${DESIGN}`, true],
    [`/ro/d/${DESIGN}/`, true],
    [`/ro/d/other`, false],
    [STEP_ONE, false],
    [`/ro/s/${DESIGN}`, false],
    [`/ro/d/${DESIGN}/extra`, false],
    ["/", false],
  ])("answers %s with %s", (pathname, expected) => {
    expect(isEditorPathnameOf(DESIGN, pathname)).toBe(expected);
  });

  it("reads an escaped id as the id it stands for, and a broken escape as itself", () => {
    expect(isEditorPathnameOf("a b", "/ro/d/a%20b")).toBe(true);
    expect(isEditorPathnameOf("100%", "/ro/d/100%")).toBe(true);
  });
});

describe("isGuardEntryState", () => {
  it("recognises only the guard's own marker", () => {
    expect(isGuardEntryState({ lemnariaBackGuard: true })).toBe(true);
    expect(isGuardEntryState({ lemnariaBackGuard: false })).toBe(false);
    expect(isGuardEntryState({ __NA: true })).toBe(false);
    expect(isGuardEntryState(null)).toBe(false);
    expect(isGuardEntryState("lemnariaBackGuard")).toBe(false);
  });
});

describe("the origin record", () => {
  it("is empty until Step 1 hands over, and Step 1's hand-over starts a fresh one", () => {
    expect(readEditorOrigin()).toEqual(NO_ORIGIN);

    recordEditorOpenedFromStepOne(DESIGN);

    expect(readEditorOrigin()).toEqual(ARMED);
  });

  it("is dropped by forgetEditorOrigin", () => {
    recordEditorOpenedFromStepOne(DESIGN);

    forgetEditorOrigin();

    expect(readEditorOrigin()).toEqual(NO_ORIGIN);
  });
});

describe("shouldPushGuard", () => {
  const pushable: GuardPushFacts = {
    isOwner: true,
    designId: DESIGN,
    hasBeenEdited: true,
    origin: ARMED,
    pathname: EDITOR,
    isCurrentEntryAGuard: false,
  };

  it("pushes for an owner's edited kitchen reached from Step 1", () => {
    expect(shouldPushGuard(pushable)).toBe(true);
  });

  it.each<[string, Partial<GuardPushFacts>]>([
    ["the shared variant", { isOwner: false }],
    ["an untouched kitchen", { hasBeenEdited: false }],
    [
      "an editor not reached from Step 1 (a link, resume, a reload)",
      { origin: NO_ORIGIN },
    ],
    [
      "a different design from the one Step 1 handed over",
      { designId: "other" },
    ],
    ["a design not yet loaded", { designId: null }],
    ["a visit that already pushed its guard", { origin: GUARDED }],
    [
      "an entry that already is a guard (a reload keeps the marker, not the module)",
      { isCurrentEntryAGuard: true },
    ],
    ["a URL that has already left the editor", { pathname: STEP_ONE }],
  ])("does not push for %s", (_name, override) => {
    expect(shouldPushGuard({ ...pushable, ...override })).toBe(false);
  });

  it("has no input that makes a second guard the answer once the first is recorded", () => {
    for (const hasBeenEdited of [true, false]) {
      for (const isCurrentEntryAGuard of [true, false]) {
        expect(
          shouldPushGuard({
            ...pushable,
            origin: GUARDED,
            hasBeenEdited,
            isCurrentEntryAGuard,
          }),
        ).toBe(false);
      }
    }
  });
});

describe("decidePopstate", () => {
  const backOntoTheGuardedEntry: PopstateFacts = {
    origin: GUARDED,
    designId: DESIGN,
    landedPathname: EDITOR,
    isLandedEntryAGuard: false,
    isLinkQuestionOpen: false,
  };

  it("asks when Back lands on the entry the guard was pushed over", () => {
    expect(decidePopstate(backOntoTheGuardedEntry)).toBe("ask");
  });

  it("asks nothing over the links' own question: a Back with it open is the customer answering it", () => {
    expect(
      decidePopstate({ ...backOntoTheGuardedEntry, isLinkQuestionOpen: true }),
    ).toBe("ignore");
  });

  it("does not ask for Forward, which lands on the guard — and closes a question that was open", () => {
    const forward = { ...backOntoTheGuardedEntry, isLandedEntryAGuard: true };

    expect(decidePopstate(forward)).toBe("ignore");
    expect(decidePopstate({ ...forward, origin: BEING_ANSWERED })).toBe(
      "close-question",
    );
  });

  it("lets a landing on Step 1 through, forgetting the origin, whether or not a question was open", () => {
    const toStepOne = { ...backOntoTheGuardedEntry, landedPathname: STEP_ONE };

    expect(decidePopstate(toStepOne)).toBe("forget-origin");
    expect(decidePopstate({ ...toStepOne, origin: BEING_ANSWERED })).toBe(
      "forget-origin",
    );
  });

  it.each<[string, Partial<PopstateFacts>]>([
    ["an editor not reached from Step 1", { origin: NO_ORIGIN }],
    ["another design's editor", { designId: "other" }],
    ["a design not yet loaded", { designId: null }],
    ["a visit that never pushed a guard", { origin: ARMED }],
  ])("stays out of %s", (_name, override) => {
    expect(decidePopstate({ ...backOntoTheGuardedEntry, ...override })).toBe(
      "ignore",
    );
  });

  describe("after a language switch left an older editor entry behind the guarded one", () => {
    const olderEditorEntry = {
      ...backOntoTheGuardedEntry,
      origin: { ...GUARDED, guardedPathname: EDITOR_IN_RUSSIAN },
      landedPathname: EDITOR,
    };

    it("passes through it while the customer is answering, so Confirm and a second Back reach Step 1 at once", () => {
      expect(
        decidePopstate({
          ...olderEditorEntry,
          origin: { ...olderEditorEntry.origin, isBeingAnswered: true },
        }),
      ).toBe("keep-leaving");
    });

    it("leaves it alone otherwise, so an ordinary Back still undoes the language switch", () => {
      expect(decidePopstate(olderEditorEntry)).toBe("ignore");
    });
  });
});

describe("shouldRearmGuard", () => {
  const steppedPastTheGuard: RearmFacts = {
    origin: GUARDED,
    pathname: EDITOR,
    isCurrentEntryAGuard: false,
  };

  it("puts the guard back under a customer standing on the entry it was pushed over", () => {
    expect(shouldRearmGuard(steppedPastTheGuard)).toBe(true);
  });

  it.each<[string, Partial<RearmFacts>]>([
    ["the customer is still on the guard", { isCurrentEntryAGuard: true }],
    ["no guard was ever pushed", { origin: ARMED }],
    ["there is no origin", { origin: NO_ORIGIN }],
    ["the customer stands on another entry", { pathname: EDITOR_IN_RUSSIAN }],
  ])("does not when %s", (_name, override) => {
    expect(shouldRearmGuard({ ...steppedPastTheGuard, ...override })).toBe(
      false,
    );
  });
});

describe("the wiring no harness can stand in for", () => {
  const read = (relativePath: string) =>
    readFileSync(resolve(__dirname, "../../../../src", relativePath), "utf8");

  it("has the configure screen ask for the owner's variant only, with the links' own question as an input", () => {
    const source = read("app/configurator/configure/configure-screen.tsx");

    expect(source).toContain('isOwner: variant === "owner"');
    expect(source).toContain("isLinkQuestionOpen: backConfirmation.isAsking");
    expect(source).toContain("backGuard.isAsking && (");
  });

  it("records Step 1's hand-over before the push that opens the editor, in the one place that pushes it", () => {
    const source = read("room/use-generation.ts");

    const recorded = source.indexOf("recordEditorOpenedFromStepOne(id)");
    const pushed = source.indexOf("latestRouter.current.push(");
    expect(recorded).toBeGreaterThan(-1);
    expect(recorded).toBeLessThan(pushed);
    expect(source.match(/recordEditorOpenedFromStepOne\(/g)).toHaveLength(1);
  });
});
