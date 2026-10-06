// @vitest-environment happy-dom
//
// **The plan card as it is painted** — the seam `plan-preview-model.test.ts` cannot reach.
//
// The model proves the drawing never leaves the box it is handed. That proof is worth exactly as
// much as the box: `globals.css:53-55` puts every element in `border-box`, so `.planBox`'s hairline
// is spent out of the 320 x 104 the frame draws and the pixels a drawing can be painted in are
// 318 x 102. Laid out against the nominal box instead, **every** approved room ran 2 px under the
// border — off the bottom where depth set the scale, off the right where width did — and a swept
// model stayed green throughout, because the sweep and the defect shared the wrong box.
//
// So the claims here are the ones that need a rendered element: that the box handed to the model is
// the inside of the box that is painted, that the bars land in it, and that the labels are hung off
// the anchors the model placed rather than re-placed beside the paint.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { fc } from "@fast-check/vitest";
import { APPROVED_ROOM_POLICY } from "@lemnaria/configurator-domain";
import { NextIntlClientProvider } from "next-intl";
import { Fragment, act, createElement, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PLAN_BOX, PlanPreview } from "@/room/plan-preview";
import {
  PLAN_LABEL_LINE_PX,
  derivePlanPreview,
  type DrawnPlanPreview,
  type PlanBox,
  type MarkedPlanWall,
  type PlanWallId,
} from "@/room/plan-preview-model";
import {
  createRoomDraft,
  withStoredLength,
  type RoomDraft,
  type RoomLengthField,
} from "@/room/room-draft";

import roMessages from "../../src/messages/ro.json";
import ruMessages from "../../src/messages/ru.json";
import {
  translatorFor,
  type Catalogue,
  type CatalogueLocale,
} from "../support/catalogues";

const A_PRODUCT_LOCALE: CatalogueLocale = "ro";

/** A render each; enough to cross every digit count the swept range has. */
const LABEL_SWEEP_RUNS = 100;

/** Criterion S1b-9's range: every whole millimetre a field can hold on the way to a room, far past
 *  what the policy approves, because the plan is drawn from whatever the customer has typed so far. */
const LABEL_SWEEP_MM = { min: 1, max: 9_000_000 } as const;

/** Mid-typing labels the sweep must reach whatever it happens to draw: a digit too many, and one. */
const MID_TYPING_WALLS: [number, number][] = [[27_005, 3]];

/** Each product locale, its catalogue, and the unit its label must end on — spelled here rather than
 *  read from the catalogue, so a label template that lost its unit could not agree with itself. */
const LABEL_LOCALES = [
  ["ro", roMessages, "mm"],
  // `Catalogue` is typed from `ro.json`; catalogue parity is what holds `ru.json` to its shape.
  ["ru", ruMessages as Catalogue, "\u043C\u043C"],
] as const;

/** Read by path rather than through `new URL(…, import.meta.url)`: under `happy-dom` the module URL
 *  is not a `file:` one (`room-url-round-trip.dom.test.ts:166-168`). */
const roomStylesheet = readFileSync(
  resolve(import.meta.dirname, "../../src/room/room.module.css"),
  "utf8",
);

const globalStylesheet = readFileSync(
  resolve(import.meta.dirname, "../../src/app/globals.css"),
  "utf8",
);

/** Frame 1B's box as the card paints it (`:134`), border included. The figure is the frame's, and it
 *  is stated here so that the component's own `PLAN_BOX` has something to be *smaller than*. */
const PAINTED_BOX_WIDTH_PX = 320;

/** An ordinary kitchen, and the room the visual gate caught a bar printing through a label in. */
const AN_ORDINARY_KITCHEN = { wallAMm: 2500, wallBMm: 5000 } as const;

interface RoomMm {
  readonly wallAMm: number;
  readonly wallBMm: number;
}

function approvedLWalls() {
  const walls = APPROVED_ROOM_POLICY.buildableShapes.L;
  if (walls === undefined) {
    throw new Error("the approved policy states no L walls to draw");
  }
  return walls;
}

/** The two rooms an axis runs out on. The widest fills the box left to right and the deepest fills it
 *  top to bottom, so between them they press the drawing against all four edges. */
function everyExtremeRoom(): readonly (readonly [string, RoomMm])[] {
  const walls = approvedLWalls();
  return [
    [
      "the widest approved room",
      { wallAMm: walls.wallA.maxMm, wallBMm: walls.wallB.minMm },
    ],
    [
      "the deepest approved room",
      { wallAMm: walls.wallA.minMm, wallBMm: walls.wallB.maxMm },
    ],
    ["an ordinary 2500 x 5000 mm kitchen", AN_ORDINARY_KITCHEN],
  ];
}

function draftFor(room: RoomMm): RoomDraft {
  const lengths: readonly (readonly [RoomLengthField, number])[] = [
    ["wallA", room.wallAMm],
    ["wallB", room.wallBMm],
    ["height", APPROVED_ROOM_POLICY.heightBounds.minMm],
  ];
  return lengths.reduce<RoomDraft>(
    (draft, [field, millimetres]) =>
      withStoredLength(draft, { field, millimetres }),
    createRoomDraft("L"),
  );
}

let container: HTMLDivElement;
let root: Root;

function render(
  room: RoomMm,
  locale: CatalogueLocale = A_PRODUCT_LOCALE,
  messages: Catalogue = roMessages,
): DrawnPlanPreview {
  const draft = draftFor(room);
  const plan = derivePlanPreview(draft, PLAN_BOX);
  if (plan.kind !== "drawn") {
    throw new Error("the room under test was expected to draw a plan");
  }
  renderDraft(draft, locale, messages);
  return plan;
}

/** Any plan the model returns, drawn or empty, painted in the product locale. Not fill-flagged —
 *  no stylesheet is loaded under this test's `happy-dom` (D6c) — so `PlanPreview` derives the same
 *  `plan` this function returns, against `PLAN_BOX` and the default metrics. */
function renderDraft(
  draft: RoomDraft,
  locale: CatalogueLocale = A_PRODUCT_LOCALE,
  messages: Catalogue = roMessages,
): void {
  act(() => {
    root.render(
      createElement(NextIntlClientProvider, {
        children: createElement(PlanPreview, { draft }),
        locale,
        messages,
        timeZone: "Europe/Chisinau",
      }),
    );
  });
}

/** Any plan the model returns, drawn or empty, painted in the product locale. */
function surfaceWidthPx(): number {
  const surface = elementAt("room-plan").querySelector("svg");
  if (surface === null) throw new Error("the card paints no drawing surface");
  return attributePx(surface, "width");
}

function elementAt(testId: string): HTMLElement {
  const element = container.querySelector(`[data-testid="${testId}"]`);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`the card draws no ${testId}`);
  }
  return element;
}

function publishedPx(element: HTMLElement, property: string): number {
  return Number.parseFloat(element.style.getPropertyValue(property));
}

function paintedHeightPx(): number {
  return Number.parseFloat(elementAt("room-plan-box").style.height);
}

function attributePx(bar: Element, name: string): number {
  return Number.parseFloat(bar.getAttribute(name) ?? "");
}

/** Every bar the card actually painted, read off the SVG rather than off the model. */
function paintedBars(): readonly Element[] {
  return [...elementAt("room-plan").querySelectorAll("rect")];
}

/** The pixels inside the box that was painted, worked out from the rendered element and the border it
 *  published — deliberately **not** from `PLAN_BOX`, because `PLAN_BOX` disagreeing with the painted
 *  box is the defect, and a test that measured the drawing against it would agree with the defect. */
function paintableBoxPx(): PlanBox {
  const borderPx = publishedPx(elementAt("room-plan-box"), "--plan-box-border");
  return {
    widthPx: PAINTED_BOX_WIDTH_PX - borderPx * 2,
    heightPx: paintedHeightPx() - borderPx * 2,
  };
}

function barsOutsideThePaintableBox(): readonly string[] {
  const paintable = paintableBoxPx();
  return paintedBars()
    .filter(
      (bar) =>
        attributePx(bar, "x") < 0 ||
        attributePx(bar, "y") < 0 ||
        attributePx(bar, "x") + attributePx(bar, "width") > paintable.widthPx ||
        attributePx(bar, "y") + attributePx(bar, "height") > paintable.heightPx,
    )
    .map(
      (bar) =>
        `a bar at ${bar.getAttribute("x") ?? ""},${bar.getAttribute("y") ?? ""}`,
    );
}

function labelAt(wall: PlanWallId): HTMLElement {
  return elementAt(`room-plan-label-${wall}`);
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the box the model is handed is the inside of the box that is painted", () => {
  it("takes the border it publishes off both axes of the frame's box", () => {
    render(AN_ORDINARY_KITCHEN);
    const borderPx = publishedPx(
      elementAt("room-plan-box"),
      "--plan-box-border",
    );

    expect(borderPx).toBeGreaterThan(0);
    expect(PLAN_BOX.widthPx).toBe(PAINTED_BOX_WIDTH_PX - borderPx * 2);
    expect(paintedHeightPx()).toBe(PLAN_BOX.heightPx + borderPx * 2);
  });

  it("publishes the line a label is written on, which the lane above the drawing reserves", () => {
    render(AN_ORDINARY_KITCHEN);

    expect(publishedPx(elementAt("room-plan-box"), "--plan-label-line")).toBe(
      PLAN_LABEL_LINE_PX,
    );
  });

  // The other half of the seam, and the half a render cannot show: publishing a figure only helps
  // while the stylesheet reads it instead of stating one of its own. Asserted against the file, the
  // hop `price-bar-layout.test.ts:197-202` pins the same way.
  it("draws the border and sets the label's type from those published figures", () => {
    expect(roomStylesheet).toContain(
      "border: var(--plan-box-border) solid var(--line-soft);",
    );
    expect(roomStylesheet).toContain(
      "font: 700 var(--plan-label-line) / 1 var(--font-ui);",
    );
  });

  it("draws on a surface the size of the box the model laid the plan out in", () => {
    render(AN_ORDINARY_KITCHEN);
    const drawing = elementAt("room-plan").querySelector("svg");

    expect(attributePx(drawing ?? document.body, "width")).toBe(
      PLAN_BOX.widthPx,
    );
    expect(attributePx(drawing ?? document.body, "height")).toBe(
      PLAN_BOX.heightPx,
    );
  });

  it.each(everyExtremeRoom())(
    "paints every bar of %s inside those pixels",
    (_name, room) => {
      render(room);

      expect(barsOutsideThePaintableBox()).toEqual([]);
    },
  );

  // 7F2 S5 (Q-7F2-3 = a): an L with wall B not yet typed draws nothing, and the card must not jump
  // when wall B's first digit arrives. The height is read off the painted element, never the model.
  it("paints the empty plan's box as tall and as wide as a drawn plan's, and draws nothing in it", () => {
    render(AN_ORDINARY_KITCHEN);
    const drawnHeightPx = paintedHeightPx();
    const drawnWidthPx = surfaceWidthPx();

    renderDraft(
      withStoredLength(createRoomDraft("L"), {
        field: "wallA",
        millimetres: AN_ORDINARY_KITCHEN.wallAMm,
      }),
    );
    expect(paintedHeightPx()).toBe(drawnHeightPx);
    expect(surfaceWidthPx()).toBe(drawnWidthPx);
    expect(paintedBars()).toHaveLength(0);
    expect(
      container.querySelector('[data-testid^="room-plan-label-"]'),
    ).toBeNull();
  });
});

describe("a label is hung off the anchor the model placed, and nowhere else", () => {
  it.each(everyExtremeRoom())(
    "writes %s's labels at the model's own anchors",
    (_name, room) => {
      const plan = render(room);

      for (const drawn of plan.walls) {
        const label = labelAt(drawn.wall);
        // Parsed rather than compared as text: the browser writes a position back at its own
        // precision, and the claim is the coordinate and not the spelling.
        expect(Number.parseFloat(label.style.left)).toBeCloseTo(
          drawn.labelPx.xPx,
          5,
        );
        expect(Number.parseFloat(label.style.top)).toBeCloseTo(
          drawn.labelPx.topPx,
          5,
        );
      }
    },
  );

  // The defect this names: wall A's label was centred *under* wall A, in the band the walls running
  // down the screen occupy, and at 2,50 x 5,00 m wall B's bar ran through the whole height of the
  // text. Above the drawing there is nothing to run through it.
  it("writes wall A's label above every bar, pulled back by half its own width", () => {
    render(AN_ORDINARY_KITCHEN);
    const topPx = Number.parseFloat(labelAt("A").style.top);

    expect(labelAt("A").style.transform).toBe("translateX(-50%)");
    expect(paintedBars()).not.toHaveLength(0);
    for (const bar of paintedBars()) {
      expect(topPx + PLAN_LABEL_LINE_PX).toBeLessThanOrEqual(
        attributePx(bar, "y"),
      );
    }
  });

  // The drawing is centred in the box, so a label centred on wall A is centred in the box: the text
  // grows symmetrically out of the middle and only a translation wider than the whole card could
  // reach an edge.
  it("centres wall A's label on the box, whatever wall A measures", () => {
    render(AN_ORDINARY_KITCHEN);

    expect(Number.parseFloat(labelAt("A").style.left)).toBeCloseTo(
      PLAN_BOX.widthPx / 2,
      9,
    );
  });
});

describe("a label reads its wall's whole millimetres (ADR 0126, criterion S1b-9)", () => {
  it.each(LABEL_LOCALES)(
    "writes every wall from 1 to 9 000 000 mm as its digits and the unit, with no separator, in %s",
    (locale, messages, unit) => {
      fc.assert(
        fc.property(
          fc.integer(LABEL_SWEEP_MM),
          fc.integer(LABEL_SWEEP_MM),
          (wallAMm, wallBMm) => {
            render({ wallAMm, wallBMm }, locale, messages);

            expect(labelAt("A").textContent).toBe(
              `A \u00B7 ${String(wallAMm)} ${unit}`,
            );
            expect(labelAt("B").textContent).toBe(
              `B \u00B7 ${String(wallBMm)} ${unit}`,
            );
          },
        ),
        { numRuns: LABEL_SWEEP_RUNS, examples: MID_TYPING_WALLS },
      );
    },
  );
});

// Wave 7F2 slice S2, criterion 7's paint: `markPlanWalls` proves the mark moves no pixel; this proves
// the card paints it — the red the stylesheet declares on the marked bar, and the reason written
// where the length was — and paints nothing red on a wall that carries no mark.
describe("a wall the room refuses is painted red and reads its short reason (7F2 criterion 7)", () => {
  /** Frame 1C's own example (`Mobil.dc.html:195-247`), in millimetres: wall B too short. */
  const FRAME_ONE_C_ROOM: RoomMm = { wallAMm: 3600, wallBMm: 450 };
  const WALL_B_TOO_SHORT: readonly MarkedPlanWall[] = [
    { wall: "B", labelKey: "room.planWallIssue.tooShort" },
  ];

  function renderMarked(
    locale: CatalogueLocale,
    messages: Catalogue,
    markedWalls: readonly MarkedPlanWall[],
  ): void {
    const draft = draftFor(FRAME_ONE_C_ROOM);
    act(() => {
      root.render(
        createElement(NextIntlClientProvider, {
          children: createElement(PlanPreview, { draft, markedWalls }),
          locale,
          messages,
          timeZone: "Europe/Chisinau",
        }),
      );
    });
  }

  function barOf(wallId: PlanWallId): Element {
    const plan = derivePlanPreview(draftFor(FRAME_ONE_C_ROOM), PLAN_BOX);
    if (plan.kind !== "drawn")
      throw new Error("the frame-1C room draws no plan");
    const index = plan.walls.findIndex((drawn) => drawn.wall === wallId);
    const bar = paintedBars()[index];
    if (bar === undefined)
      throw new Error(`the card paints no bar for ${wallId}`);
    return bar;
  }

  it("declares the frame's red once, on the plan box, for the bar and its label to share", () => {
    // Amended by 7F2 S3 (S2 review finding R1.3): the red is hoisted to the global `--refusal`, which
    // the plan box publishes under its own name and a refused field and its reason share.
    expect(globalStylesheet).toContain("--refusal: #dc2626;");
    expect(roomStylesheet).toContain("--plan-wall-issue: var(--refusal);");
    expect(roomStylesheet).toMatch(
      /\.planWallLabel\[data-marked="true"\] \{\s*color: var\(--plan-wall-issue\);/,
    );
  });

  it.each(LABEL_LOCALES)(
    "paints wall B red and writes its short reason in its label, in %s",
    (locale, messages) => {
      renderMarked(locale, messages, WALL_B_TOO_SHORT);

      expect(barOf("B").getAttribute("fill")).toBe("var(--plan-wall-issue)");
      expect(labelAt("B").dataset.marked).toBe("true");
      expect(labelAt("B").textContent).toBe(
        translatorFor(locale, messages)("room.planWallIssue.tooShort", {
          wall: "B",
        }),
      );
      expect(labelAt("B").textContent).not.toMatch(/\p{Nd}/u);
    },
  );

  it.each(LABEL_LOCALES)(
    "leaves the unmarked wall A in the accent, reading its length, in %s",
    (locale, messages, unit) => {
      renderMarked(locale, messages, WALL_B_TOO_SHORT);

      expect(barOf("A").getAttribute("fill")).toBe("var(--accent)");
      expect(labelAt("A").dataset.marked).toBe("false");
      expect(labelAt("A").textContent).toBe(`A \u00B7 3600 ${unit}`);
    },
  );

  it("paints no wall red when no mark is passed", () => {
    renderMarked(A_PRODUCT_LOCALE, roMessages, []);

    for (const bar of paintedBars()) {
      expect(bar.getAttribute("fill")).toBe("var(--accent)");
    }
    expect(labelAt("B").textContent).toBe("B \u00B7 450 mm");
  });
});

describe("the box is watched in the commit that hydrates it, before the browser can paint", () => {
  it("has a ResizeObserver on the box by the time a later sibling's layout effect runs", () => {
    const watched = stubResizeObserverThatNeverFires();
    let watchedAtLayoutTime = -1;
    function LaterSibling(): null {
      useLayoutEffect(() => {
        watchedAtLayoutTime = watched.length;
      }, []);
      return null;
    }

    act(() => {
      root.render(
        createElement(NextIntlClientProvider, {
          children: createElement(
            Fragment,
            null,
            createElement(PlanPreview, {
              draft: draftFor(AN_ORDINARY_KITCHEN),
            }),
            createElement(LaterSibling),
          ),
          locale: A_PRODUCT_LOCALE,
          messages: roMessages,
          timeZone: "Europe/Chisinau",
        }),
      );
    });

    expect(watchedAtLayoutTime).toBe(1);
    expect(watched[0]).toBe(elementAt("room-plan-box"));
    expect(watched).toHaveLength(1);
  });
});

describe("the empty box shown while a fill-mode measurement is awaited", () => {
  it("already carries the border the stylesheet's border declaration needs", () => {
    stubResizeObserverThatNeverFires();
    flagTheBoxForFill();

    renderDraft(draftFor(AN_ORDINARY_KITCHEN));
    const box = elementAt("room-plan-box");

    expect(box.querySelector("svg")).toBeNull();
    expect(publishedPx(box, "--plan-box-border")).toBe(
      (PAINTED_BOX_WIDTH_PX - PLAN_BOX.widthPx) / 2,
    );
  });
});

/** Records what is observed and never calls back, so a flagged box stays awaiting its measurement. */
function stubResizeObserverThatNeverFires(): Element[] {
  const watched: Element[] = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = (target: Element): void => {
        watched.push(target);
      };
      disconnect = vi.fn();
    },
  );
  return watched;
}

/** No stylesheet is loaded under happy-dom, so the desktop `--plan-fill` flag is stated here. */
function flagTheBoxForFill(): void {
  vi.spyOn(window, "getComputedStyle").mockReturnValue({
    getPropertyValue: (property: string) =>
      property === "--plan-fill" ? "1" : "",
  } as CSSStyleDeclaration);
}
