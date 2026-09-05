// ADR 0065 decision 7b's scene warning, rendered.
//
// **The sentence is pinned by a literal, and a composed assertion never replaces the literal pin.**
// It is the owner's own phrasing, ruled on 2026-09-03 and already re-ruled once — from *corpuri* to
// *dulapuri* — so a test that rebuilt it from the same constant the component reads would agree with
// any wording at all, including a tidied one. Wave 6D states the rule; this is that rule applied to
// the string this wave adds.
// `OVERFLOWING_KITCHEN_L_DESIGN` is the **one declared** overflow fixture (ADR 0083 decision 10):
// the seeded kitchen with one body a millimetre past the end of wall B, positioned relative to the
// room so a wall moving cannot silently stop it overflowing. It was hand-built in six test files
// and agreed everywhere only because the six were written together. Aliased to the local name the
// cases below already use.
import {
  KITCHEN_L_DESIGN,
  OVERFLOWING_KITCHEN_L_DESIGN as OVERFLOWING_DESIGN,
  type Design,
} from "@lemnaria/configurator-domain";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ro } from "@/content/ro";

/** The two store slices the warning reads: the document it derives the overflow from, and the
 *  scene's own published "I am mounted" fact (`isBodyProbeAttached`). */
const store = vi.hoisted(() => ({
  design: undefined as Design | undefined,
  isBodyProbeAttached: true,
}));

vi.mock("@/store/configurator-store", () => ({
  useConfiguratorStore: (selector: (state: unknown) => unknown) =>
    selector({
      design: store.design,
      isBodyProbeAttached: store.isBodyProbeAttached,
    }),
}));

const { OverflowWarning } = await import("@/scene/overflow-warning");

/** Wall A's run cut back to its first metre, so most of the wall is bare (ADR 0067). */
const LARGE_REMAINDER_DESIGN: Design = {
  ...KITCHEN_L_DESIGN,
  placements: KITCHEN_L_DESIGN.placements.filter(
    (placement) => placement.wall === "A" && placement.alongMm < 1000,
  ),
};

function renderFor(design: Design): string {
  store.design = design;
  store.isBodyProbeAttached = true;
  return renderToStaticMarkup(createElement(OverflowWarning));
}

/** The window between the page painting and the 3D chunk arriving: the ids are known, the stage has
 *  not mounted, so nothing in the scene is marked yet. */
function renderWhileTheSceneIsLoading(design: Design): string {
  store.design = design;
  store.isBodyProbeAttached = false;
  return renderToStaticMarkup(createElement(OverflowWarning));
}

beforeEach(() => {
  store.design = undefined;
  store.isBodyProbeAttached = true;
});

describe("the ruled sentence", () => {
  it("is stored verbatim, punctuation included", () => {
    expect(ro.configure.overflowWarning).toBe(
      "Dulapurile marcate depășesc lungimea peretelui. Modifică lățimile sau elimină un dulap.",
    );
  });

  it("is a different sentence from the flagged total's, and neither restates the other", () => {
    // ADR 0065 decision 7b: the scene warning says what is wrong and what to do about it; the
    // total's flag says what the number contains and that it is not final. Only the noun is shared.
    expect(ro.configure.overflowWarning).not.toBe(
      ro.price.overflowingTotalWarning,
    );
    expect(ro.configure.overflowWarning).not.toContain(
      ro.price.overflowingTotalWarning,
    );
    expect(ro.price.overflowingTotalWarning).not.toContain(
      ro.configure.overflowWarning,
    );
  });

  it("carries the noun the owner settled on, and not the wording it replaced", () => {
    expect(ro.configure.overflowWarning).toContain("Dulapurile");
    expect(ro.configure.overflowWarning).not.toContain("corp");
  });
});

describe("when the warning appears", () => {
  it("renders the sentence while a body reaches past the end of its wall", () => {
    const markup = renderFor(OVERFLOWING_DESIGN);

    expect(markup).toContain(ro.configure.overflowWarning);
    expect(markup).toContain('data-testid="scene-overflow-warning"');
  });

  it("renders no warning on the seeded design at 600", () => {
    // ADR 0065's consequences: the corrected room fits the shipped kitchen. A warning here would
    // mean the room dimensions had regressed, and the fix would be in the fixture, not here.
    const markup = renderFor(KITCHEN_L_DESIGN);

    expect(markup).not.toContain(ro.configure.overflowWarning);
  });

  it("renders no warning for bare wall left at the end of a run", () => {
    // ADR 0065 decision 4 with ADR 0067: the fit constraint is one-sided and a remainder is the
    // product working. Under-filling must never produce a sentence telling the customer to change
    // something.
    expect(LARGE_REMAINDER_DESIGN.placements.length).toBeGreaterThan(0);

    const markup = renderFor(LARGE_REMAINDER_DESIGN);

    expect(markup).not.toContain(ro.configure.overflowWarning);
  });
});

describe("the sentence never arrives before the marks it describes", () => {
  it("says nothing while the scene is still loading, though bodies already overflow", () => {
    // The sentence reads "Dulapurile **marcate**…". `KitchenStage` builds the marks and it lives
    // inside a `dynamic(..., { ssr: false })` canvas behind a WebGL probe, so on a cold load of a
    // stored overflowing design the ids are known seconds before anything is marked. Rendered on the
    // ids alone the customer reads about marked cabinets over a loading placeholder.
    const markup = renderWhileTheSceneIsLoading(OVERFLOWING_DESIGN);

    expect(markup).not.toContain(ro.configure.overflowWarning);
  });

  it("keeps its live region mounted through that window", () => {
    // The region is not gated — only the sentence is — so the sentence still arrives *into* a region
    // that was already in the accessibility tree.
    const markup = renderWhileTheSceneIsLoading(OVERFLOWING_DESIGN);

    expect(markup).toContain('role="status"');
  });

  it("says it as soon as the scene is mounted, on the same design", () => {
    // The counterfactual that makes the two above sensitive rather than vacuous: the only thing that
    // changed is whether the stage is mounted.
    const loading = renderWhileTheSceneIsLoading(OVERFLOWING_DESIGN);
    const mounted = renderFor(OVERFLOWING_DESIGN);

    expect(loading).not.toContain(ro.configure.overflowWarning);
    expect(mounted).toContain(ro.configure.overflowWarning);
  });
});

describe("the surface it renders on", () => {
  it("mounts its live region whether or not there is anything in it", () => {
    // `PanelNoticeRow`'s recorded reason: a region created at the same moment as its first message
    // is announced late or not at all, and the arrival of this warning is what matters most here.
    const quiet = renderFor(KITCHEN_L_DESIGN);
    const loud = renderFor(OVERFLOWING_DESIGN);

    expect(quiet).toContain('role="status"');
    expect(loud).toContain('role="status"');
  });

  it("is not the rejection banner", () => {
    // ADR 0065 decision 8: a rejection says *an edit did not happen*, this says *an edit happened
    // and its result does not fit*. Sharing §9's banner is what would make the two read as a
    // contradiction on one screen, so this surface carries none of its markup.
    const markup = renderFor(OVERFLOWING_DESIGN);

    expect(markup).not.toContain("rejection");
    expect(markup).not.toContain('role="alert"');
  });
});
