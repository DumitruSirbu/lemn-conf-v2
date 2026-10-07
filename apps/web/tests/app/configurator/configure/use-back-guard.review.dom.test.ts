// @vitest-environment happy-dom
//
// **M8 8D S4: the editor's own review is part of the editor's visit.** *Verifică designul* is a forward navigation
// out of an edited editor. These tests drive the guard through the history stack
//
//     Step 1 · editor · guard · review     (the customer is on the review)
//
// and check that the forward navigation asks nothing, that the origin and the guard it recorded survive the
// editor's unmount, that Back from the review lands on the guard and is let through, and that the next Back, onto
// the editor's first entry, asks as it does today.
//
// happy-dom has no real traversal: a landing is simulated by moving the entry's URL and state and dispatching
// `popstate`, as `use-back-guard.dom.test.ts` does. That Chrome and Next's router land where this assumes, and that
// the editor remounts around the landing, is the e2e spec's.
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  forgetEditorOrigin,
  readEditorOrigin,
  recordEditorOpenedFromStepOne,
  type EditorOrigin,
} from "@/app/configurator/configure/back-guard";
import {
  decidePopstate,
  isReviewPathnameOf,
  useBackGuard,
} from "@/app/configurator/configure/use-back-guard";
import { useConfiguratorStore } from "@/store/configurator-store";

const DESIGN = "design-1";
const ORIGIN = "http://localhost:3000";
const EDITOR = `/ro/d/${DESIGN}`;
const REVIEW = `/ro/d/${DESIGN}/review`;
const STEP_ONE = "/ro/configurator/room";
const GUARD_STATE = { lemnariaBackGuard: true };

function Harness(): ReactElement {
  const guard = useBackGuard({ isOwner: true, isLinkQuestionOpen: false });
  return createElement("div", {
    "data-testid": "host",
    "data-asking": String(guard.isAsking),
  });
}

let host: HTMLDivElement;
let root: Root;
let pushState: ReturnType<typeof vi.spyOn>;
let back: ReturnType<typeof vi.spyOn>;

function mountEditor(): void {
  root = createRoot(host);
  act(() => {
    root.render(createElement(Harness));
  });
}

/** The editor going away for the review: the forward navigation pushes the review's entry, then the screen unmounts. */
function openTheReview(): void {
  act(() => {
    window.history.pushState(null, "", `${ORIGIN}${REVIEW}`);
  });
  act(() => {
    root.unmount();
  });
}

/** The browser having landed on an entry: its URL and state move, then `popstate` fires. */
function landOn(pathname: string, state: unknown): void {
  window.history.replaceState(state, "", `${ORIGIN}${pathname}`);
  act(() => {
    window.dispatchEvent(new PopStateEvent("popstate", { state }));
  });
}

function isAsking(): boolean {
  return (
    host.querySelector("[data-testid=host]")?.getAttribute("data-asking") ===
    "true"
  );
}

beforeEach(() => {
  window.history.replaceState(null, "", `${ORIGIN}${EDITOR}`);
  forgetEditorOrigin();
  useConfiguratorStore.setState({ designId: DESIGN, hasBeenEdited: false });
  pushState = vi.spyOn(window.history, "pushState");
  back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  vi.restoreAllMocks();
});

describe("the editor, edited, opens its review and comes back", () => {
  function editAfterStepOne(): void {
    recordEditorOpenedFromStepOne(DESIGN);
    mountEditor();
    act(() => {
      useConfiguratorStore.setState({ designId: DESIGN, hasBeenEdited: true });
    });
  }

  it("asks nothing on the way out, pushes nothing but the review, and remembers the guard", () => {
    editAfterStepOne();
    pushState.mockClear();

    openTheReview();

    expect(pushState).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
    expect(readEditorOrigin()).toMatchObject({
      designId: DESIGN,
      guardedPathname: EDITOR,
      isBeingAnswered: false,
    });
  });

  it("lets Back from the review land on the guard without a question and without a second guard", () => {
    editAfterStepOne();
    openTheReview();
    pushState.mockClear();

    landOn(EDITOR, GUARD_STATE);
    mountEditor();

    expect(isAsking()).toBe(false);
    expect(pushState).not.toHaveBeenCalled();
  });

  it("asks on the next Back, onto the editor's first entry, as it did before the review", () => {
    editAfterStepOne();
    openTheReview();
    landOn(EDITOR, GUARD_STATE);
    mountEditor();

    landOn(EDITOR, null);

    expect(isAsking()).toBe(true);
  });

  it("does not ask when the customer opens the review a second time and comes back again", () => {
    editAfterStepOne();
    openTheReview();
    landOn(EDITOR, GUARD_STATE);
    mountEditor();

    openTheReview();
    landOn(EDITOR, GUARD_STATE);
    mountEditor();

    expect(isAsking()).toBe(false);
    expect(readEditorOrigin().guardedPathname).toBe(EDITOR);
  });
});

describe("an editor that was never edited, opening its review", () => {
  it("records nothing to keep and leaves Back as it was: no guard, no question", () => {
    recordEditorOpenedFromStepOne(DESIGN);
    mountEditor();

    openTheReview();
    landOn(EDITOR, null);
    mountEditor();

    expect(isAsking()).toBe(false);
    expect(readEditorOrigin().guardedPathname).toBeNull();
  });
});

describe("what still ends the visit", () => {
  it("forgets the origin when the screen goes away for Step 1", () => {
    recordEditorOpenedFromStepOne(DESIGN);
    mountEditor();
    window.history.replaceState(null, "", `${ORIGIN}${STEP_ONE}`);

    act(() => {
      root.unmount();
    });

    expect(readEditorOrigin().designId).toBeNull();
  });

  it("forgets the origin when the screen goes away for another design's review", () => {
    recordEditorOpenedFromStepOne(DESIGN);
    mountEditor();
    window.history.replaceState(null, "", `${ORIGIN}/ro/d/other-design/review`);

    act(() => {
      root.unmount();
    });

    expect(readEditorOrigin().designId).toBeNull();
  });
});

describe("a landing on the review", () => {
  const ARMED: EditorOrigin = {
    designId: DESIGN,
    guardedPathname: EDITOR,
    isBeingAnswered: false,
  };

  it.each([REVIEW, `/ru/d/${DESIGN}/review`, `/d/${DESIGN}/review`])(
    "is ignored, however the origin stands: %s",
    (landedPathname) => {
      for (const origin of [ARMED, { ...ARMED, isBeingAnswered: true }])
        expect(
          decidePopstate({
            origin,
            designId: DESIGN,
            landedPathname,
            isLandedEntryAGuard: false,
            isLinkQuestionOpen: false,
          }),
        ).toBe("ignore");
    },
  );

  it("is not what a landing on another page is", () => {
    expect(
      decidePopstate({
        origin: ARMED,
        designId: DESIGN,
        landedPathname: STEP_ONE,
        isLandedEntryAGuard: false,
        isLinkQuestionOpen: false,
      }),
    ).toBe("forget-origin");
  });
});

describe("which pathname is this design's review", () => {
  it.each([REVIEW, `/ru/d/${DESIGN}/review`, `/d/${DESIGN}/review`])(
    "recognises %s",
    (pathname) => {
      expect(isReviewPathnameOf(DESIGN, pathname)).toBe(true);
    },
  );

  it.each([
    EDITOR,
    "/ro/d/other-design/review",
    `${REVIEW}/extra`,
    `/ro/d/${DESIGN}/contact`,
    `/ro/s/${DESIGN}/review`,
    "/review",
    `/ro/x/ro/d/${DESIGN}/review`,
  ])("does not recognise %s", (pathname) => {
    expect(isReviewPathnameOf(DESIGN, pathname)).toBe(false);
  });
});
