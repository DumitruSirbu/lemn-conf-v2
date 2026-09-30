// **Step 1's desktop line** — M7 wave 7L, slice S5 (`docs/milestones/M7-room-and-presets.md`,
// *Wave 7L — the plan (2026-09-28)*, D12 and §5): the **layout contract** of frames D1A, D1B, D1C
// and D1F, asserted at the `desktop` project's 1440 x 900 unless a test names another viewport.
//
// **Not a desktop replay of the 7K journey** (D12). The rules are one implementation (§10.1), 7K
// proves the journey by touch, and `linear-flow.desktop` and `mirror-real-flow.desktop` already walk
// Step 1 at this viewport. What is asserted here is geometry, boundaries, reach and the suggestion
// card — each measured against the page's own boxes, and any figure taken from a frame cited to its
// mockup line (`docs/design/mockups/Lemnaria Configurator Desktop.dc.html`).
//
// **A width lives in CSS only** (D2, criterion 2): nothing under `src/room` reads `matchMedia` or
// `innerWidth`. That is a grep over the source, not a claim this spec makes — every viewport below is
// set with `setViewportSize` and read back off the layout, never off a breakpoint the test knows.
//
// **1F is held on screen, never raced.** The design write that ends composition (`POST
// /api/designs`) is held by `page.route` for as long as a test measures 1F and then aborted, so no
// row is minted and nothing here owes ADR 0006 a cleanup.
//
// A defect this spec finds stays red: the product is fixed in its own dispatch, never by weakening
// an assertion here.
import { readFileSync } from "node:fs";

import {
  expect,
  test,
  type Browser,
  type Locator,
  type Page,
  type Route,
} from "@playwright/test";

import { countPixels } from "./support/pixels";
import { stepSentence } from "./support/step-one-by-touch";

type Locale = "ro" | "ru";

const LOCALES: readonly Locale[] = ["ro", "ru"];

interface Viewport {
  readonly width: number;
  readonly height: number;
}

/** The `desktop` project's own viewport (`playwright.config.ts:58-68`). */
const DESKTOP: Viewport = { width: 1440, height: 900 };
/** One pixel either side of the codebase's one breakpoint (D2, criterion 3). */
const LAST_PHONE_WIDTH: Viewport = { width: 899, height: 900 };
const FIRST_DESKTOP_WIDTH: Viewport = { width: 900, height: 900 };
/** A short laptop (criterion 10, risk R7). */
const SHORT_DESKTOP: Viewport = { width: 1280, height: 720 };
/** The frames' own width (`Desktop.dc.html:51`). */
const WIDE_DESKTOP: Viewport = { width: 1920, height: 1080 };
/** The phone the `mobile` project pins, reached here by resizing (criterion 14). */
const PHONE: Viewport = { width: 390, height: 844 };

/** Criterion 17's widths, each at a height inside its 720–1080 band. */
const SIDEWAYS_VIEWPORTS: readonly Viewport[] = [
  FIRST_DESKTOP_WIDTH,
  SHORT_DESKTOP,
  DESKTOP,
  WIDE_DESKTOP,
];

// -------------------------------------------------------------------------------------------
// Frame figures — each cited to its mockup line, never read back from the stylesheet.
// -------------------------------------------------------------------------------------------

/** D1A `:52`: the top bar's band. */
const TOP_BAR_BAND_PX = 76;
/** D1A `:52`: `padding: 0 40px` — the locale chip's right edge stands this far in. */
const TOP_BAR_INSET_PX = 40;
/** D1A `:61`: the cards' column. */
const SHAPE_COLUMN_MAX_PX = 1120;
/** D1A `:94`: *Continuă*'s height. */
const CTA_HEIGHT_PX = 52;
/** D1B `:114`: the form column. */
const FORM_COLUMN_MAX_PX = 520;
/** D1B `:115`: the gap between the form column and the plan panel; D1F `:475` draws the same. */
const COLUMN_GAP_PX = 56;
/** D1B `:179`: the plan panel. */
const PLAN_PANEL_MAX_PX = 900;
/** D1B `:183, 185`: 26 px walls, 14 px labels, a label standing 20 px off its wall (7L D6 b). */
const DESKTOP_WALL_PX = 26;
const DESKTOP_LABEL_LINE_PX = 14;
const DESKTOP_LABEL_GAP_PX = 20;
/** The lane the drawing is never painted in: a label line and its gap (7L D6, criterion 7). */
const DESKTOP_LABEL_LANE_PX = DESKTOP_LABEL_LINE_PX + DESKTOP_LABEL_GAP_PX;
/** The shortest box the desktop set can draw in: the lane, a wall, and the line beside the deepest
 *  wall (7L D6 e). */
const DESKTOP_MINIMUM_BOX_HEIGHT_PX =
  DESKTOP_LABEL_LANE_PX + DESKTOP_WALL_PX + DESKTOP_LABEL_LINE_PX;
/** D1F `:475`: the steps column. */
const STEPS_COLUMN_MAX_PX = 620;
/** D1F `:509`: the composition's plan panel. */
const COMPOSE_PANEL_MAX_PX = 840;
/** `globals.css`'s `--touch-target`, written out: read from the page it would agree with any value. */
const TOUCH_TARGET_PX = 44;

/** Every "±1" the criteria allow. */
const LAYOUT_TOLERANCE_PX = 1;
/** Criterion 4's band tolerance. */
const BAND_TOLERANCE_PX = 0.5;
/**
 * Criterion 8's accepted pre-hydration window (M7 wave 7L risk R9): the most recorded paints of the
 * phone render a 1440 px load may show before the first measured one.
 *
 * **Bound per leg, not one shared ceiling (7L review finding F3).** A single 12-paint bound was
 * loose enough that reverting either S5 fix — the `useLayoutEffect` timing or the border-style
 * extraction (`plan-preview.tsx`) — still passed: a `useEffect` revert alone raises the count by
 * exactly one paint (measured below), nowhere near 12. Each leg's own ceiling, one above its own
 * measured maximum, closes that gap instead.
 *
 * **Measured 2026-09-29**, 10 runs per leg, both `first load` and `after reload`, zero variance
 * across every run:
 * - **Production build (CI)**: fixed code 4 (first load) / 3 (after reload); `useLayoutEffect`
 *   reverted to `useEffect` alone: 5 / 4 — one paint over the fixed ceiling, every run.
 * - **`next dev` (local)**: fixed code 7 / 7; the same revert: 8 / 8.
 *
 * A bound of 6 (production) or 10 (dev) — looser, "reasonable headroom" values tried first — passed
 * with the `useEffect` revert still in place on both legs, which is exactly the false green this
 * finding names. The counts above show no run-to-run variance under this harness (each record is a
 * DOM mutation batch tied to React's own render scheduling, not a timed frame), so each leg's bound
 * is set to its own measured ceiling with no slack past it: a regression of even one paint on either
 * leg reddens criterion 8, and the fixed code passes every time.
 */
const MAX_PRE_HYDRATION_PLAN_PAINTS = process.env.CI === undefined ? 7 : 4;

// -------------------------------------------------------------------------------------------
// Rooms, in the URL's own metres (ADR 0126).
// -------------------------------------------------------------------------------------------

interface RoomWitness {
  readonly name: string;
  readonly query: string;
}

/** Frame D1C's own room (`Desktop.dc.html:198-272`): an L at 3600 x 450 x 2600. Wall B is under the
 *  approved L minimum, wall A and the height validate as a straight room — so wall B is refused and
 *  the linear suggestion shows (`room-issue-model.ts`'s `isLinearSuggested`). */
const FRAME_ONE_C_ROOM = {
  name: "frame D1C's L room (3600 x 450 x 2600)",
  query: "shape=L&wallA=3.6&wallB=0.45&height=2.6&direction=left",
  /** Wall A and the height as the customer typed them, which a switch to linear keeps. */
  typed: { wallA: "3600", height: "2600" },
  /** The straight room the same wall A and height settle to: no wall B, no direction (ADR 0130 D7). */
  asLinearQuery: "shape=linear&wallA=3.6&height=2.6",
} as const;
/** 1C's vertical worst case (7F2 criterion 14): both walls too short and the ceiling too low. */
const WORST_CASE_ROOM: RoomWitness = {
  name: "1C's worst case (800 x 800 x 2000)",
  query: "shape=L&wallA=0.8&wallB=0.8&height=2&direction=left",
};
/** D1B's own room (`Desktop.dc.html:179-188`), 3,60 m x 2,40 m, with the phone's 2600 ceiling. */
const TYPED_L_ROOM = {
  wallA: 3600,
  wallB: 2400,
  height: 2600,
  query: "shape=L&wallA=3.6&wallB=2.4&height=2.6&direction=left",
} as const;

/** The four 1B states criterion 6 and 16 walk: both L corners, the straight room, the U. */
const ONE_B_STATES = [
  {
    name: "an L room, left corner",
    shape: "L",
    query: "shape=L&direction=left",
  },
  {
    name: "an L room, right corner",
    shape: "L",
    query: "shape=L&direction=right",
  },
  { name: "a straight room", shape: "linear", query: "shape=linear" },
  { name: "a U room", shape: "U", query: "shape=U&direction=left" },
] as const;

/** Which shapes draw the corner toggle. **Restated 2026-09-30 (M7B U5 S1; Q-U4 (b), ADR 0132
 *  decision 8): a U has one hand, so it draws none** — as a straight room, which has no corner, draws
 *  none. This spec expected the toggle on a U while nothing had said what a U's corner meant. */
const DRAWS_THE_CORNER_TOGGLE = { L: true, linear: false, U: false } as const;

/** 1B for each shape, as the settle writes it: a straight room carries no direction (ADR 0130 D7). */
const ONE_B_QUERY = {
  L: "shape=L&direction=left",
  linear: "shape=linear",
  U: "shape=U&direction=left",
} as const;

/** The fields each shape asks for, in field order (`requiredFieldsFor`), written out so the order
 *  the page draws is checked against something other than itself. */
const FIELD_ORDER = {
  L: ["wallA", "wallB", "height"],
  linear: ["wallA", "height"],
  U: ["wallA", "wallB", "wallC", "height"],
} as const;

/** Rooms the large plan is fitted to (criterion 7) — at least one per binding axis and per shape. */
const FITTED_ROOMS = [
  {
    name: "D1B's L, wall A binding",
    query: TYPED_L_ROOM.query,
    wallsMm: { A: TYPED_L_ROOM.wallA, B: TYPED_L_ROOM.wallB },
  },
  {
    name: "a deep L, the depth binding",
    query: "shape=L&wallA=2&wallB=5&height=2.6&direction=left",
    wallsMm: { A: 2000, B: 5000 },
  },
  {
    name: "a mirrored L",
    query: "shape=L&wallA=4.2&wallB=3&height=2.6&direction=right",
    wallsMm: { A: 4200, B: 3000 },
  },
  {
    name: "a straight room",
    query: "shape=linear&wallA=3.7&height=2.6",
    wallsMm: { A: 3700 },
  },
  {
    name: "a U room",
    query: "shape=U&wallA=3&wallB=2.5&wallC=2&height=2.6&direction=left",
    wallsMm: { A: 3000, B: 2500, C: 2000 },
  },
] as const;

// -------------------------------------------------------------------------------------------
// Copy — the top bar's titles, read from the catalogues the app renders.
// -------------------------------------------------------------------------------------------

interface RoomTitles {
  readonly room: {
    readonly title: string;
    readonly compose: { readonly title: string };
  };
}

function titlesFor(locale: Locale): RoomTitles {
  return JSON.parse(
    readFileSync(
      new URL(`../../src/messages/${locale}.json`, import.meta.url),
      "utf8",
    ),
  ) as RoomTitles;
}

// ===========================================================================================
// Criterion 3 — one breakpoint, the codebase's.
// ===========================================================================================

test.describe("criterion 3: 899 px is the phone and 900 px is the desktop", () => {
  test("1A: at 899 px the cards stack in one column above a full-width Continue; at 900 px they stand in one row", async ({
    page,
  }) => {
    await page.setViewportSize(LAST_PHONE_WIDTH);
    await openRoom(page, "ro");
    const phone = await readShapeStep(page);
    expect(nth(phone.cards, 1).top, JSON.stringify(phone)).toBeGreaterThan(
      nth(phone.cards, 0).bottom - LAYOUT_TOLERANCE_PX,
    );
    expect(nth(phone.cards, 1).left).toBeCloseTo(nth(phone.cards, 0).left, 0);
    expect(width(phone.continueBox)).toBeCloseTo(phone.footerContentWidth, 0);

    await page.setViewportSize(FIRST_DESKTOP_WIDTH);
    await expect
      .poll(async () => rowSpread(await readShapeStep(page)))
      .toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);
    const desktop = await readShapeStep(page);
    expect(width(desktop.continueBox), JSON.stringify(desktop)).toBeLessThan(
      desktop.footerContentWidth / 2,
    );
  });

  test("1C: at 899 px the plan is above the fields in one column with no Sugestii card and an unmeasured plan; at 900 px the plan is beside them, measured, and the card shows", async ({
    page,
  }) => {
    await page.setViewportSize(LAST_PHONE_WIDTH);
    await openRoom(page, "ro", FRAME_ONE_C_ROOM.query);
    await expect(page.getByTestId("room-linear-suggestion")).toBeVisible();

    const phone = await readDimensionsLayout(page);
    const phoneDetail = JSON.stringify(phone);
    expect(phone.plan.bottom, phoneDetail).toBeLessThanOrEqual(
      present(phone.corner, "the corner toggle").top + LAYOUT_TOLERANCE_PX,
    );
    expect(phone.plan.left, phoneDetail).toBeCloseTo(phone.fields.left, 0);
    expect(phone.cta.right, phoneDetail).toBeCloseTo(
      phone.footerContentRight,
      0,
    );
    expect(width(phone.cta), phoneDetail).toBeGreaterThan(
      phone.footerContentWidth / 2,
    );
    expect(
      await page.getByTestId("room-suggestion-card").boundingBox(),
    ).toBeNull();
    await expect(page.getByTestId("room-plan-box")).toHaveAttribute(
      "data-plan-measured",
      "false",
    );

    await page.setViewportSize(FIRST_DESKTOP_WIDTH);
    await expect(page.getByTestId("room-suggestion-card")).toBeVisible();
    await expect(page.getByTestId("room-plan-box")).toHaveAttribute(
      "data-plan-measured",
      "true",
    );
    const desktop = await readDimensionsLayout(page);
    const desktopDetail = JSON.stringify(desktop);
    expect(desktop.plan.left, desktopDetail).toBeGreaterThan(
      desktop.fields.right,
    );
    expect(width(desktop.cta), desktopDetail).toBeLessThan(
      desktop.footerContentWidth / 2,
    );
  });
});

// ===========================================================================================
// Criterion 4 — the top bar is D1A's.
// ===========================================================================================

test.describe("criterion 4: the top bar is D1A's", () => {
  for (const locale of LOCALES) {
    for (const witness of [
      { name: "1A", query: "" },
      { name: "1B", query: "shape=L&direction=left" },
      { name: "1C", query: FRAME_ONE_C_ROOM.query },
      { name: "1D", query: TYPED_L_ROOM.query },
    ]) {
      test(`${witness.name} in ${locale}: a 76 px band, the step pill, the room title, the locale chip 40 px from the edge and nothing painted before it`, async ({
        page,
      }) => {
        await openRoom(page, locale, witness.query);
        await expect(roomScreen(page)).toHaveAttribute(
          "data-room-substate",
          witness.name,
        );

        await expectTheTopBarOfD1A(page, {
          locale,
          title: titlesFor(locale).room.title,
        });
      });
    }
  }
});

// ===========================================================================================
// Criterion 5 — D1A.
// ===========================================================================================

test.describe("criterion 5: D1A", () => {
  for (const locale of LOCALES) {
    test(`three cards in one row, in frame order, in a column of at most 1120 px centred in the body, glyph above name, in ${locale}`, async ({
      page,
    }) => {
      await openRoom(page, locale);
      const layout = await readShapeStep(page);
      const detail = JSON.stringify(layout);

      expect(layout.cardIds, detail).toEqual([
        "room-shape-card-linear",
        "room-shape-card-L",
        "room-shape-card-U",
      ]);
      expect(rowSpread(layout), detail).toBeLessThanOrEqual(
        LAYOUT_TOLERANCE_PX,
      );
      for (const [index, card] of layout.cards.entries()) {
        if (index === 0) continue;
        expect(card.left, detail).toBeGreaterThan(
          nth(layout.cards, index - 1).right,
        );
      }
      const column = unionOf(layout.cards);
      expect(width(column), detail).toBeLessThanOrEqual(
        SHAPE_COLUMN_MAX_PX + LAYOUT_TOLERANCE_PX,
      );
      expect(
        Math.abs(centreX(column) - layout.bodyContentCentreX),
        detail,
      ).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);
      for (const card of layout.glyphsAndNames) {
        expect(card.glyphBottom, detail).toBeLessThanOrEqual(
          card.nameTop + LAYOUT_TOLERANCE_PX,
        );
      }
    });

    test(`Continue is right-aligned in the footer, 52 px tall and narrower than it; the U card draws no refusal and enables Continue, in ${locale}`, async ({
      page,
    }) => {
      await openRoom(page, locale);
      const layout = await readShapeStep(page);
      const detail = JSON.stringify(layout);

      expect(layout.continueBox.right, detail).toBeCloseTo(
        layout.footerContentRight,
        0,
      );
      expect(height(layout.continueBox), detail).toBeCloseTo(CTA_HEIGHT_PX, 0);
      expect(width(layout.continueBox), detail).toBeLessThan(
        layout.footerContentWidth,
      );

      // Restated at M7B U6 S1 (census E1): the approved policy builds the U, so its card draws no
      // refusal and Continue leads on.
      await page.getByTestId("room-shape-card-U").click();
      await expect(page.getByTestId("room-shape-refusal")).toHaveCount(0);
      await expect(continueButton(page)).toBeEnabled();
    });
  }
});

// ===========================================================================================
// Criterion 6 — D1B.
// ===========================================================================================

test.describe("criterion 6: D1B", () => {
  for (const locale of LOCALES) {
    for (const state of ONE_B_STATES) {
      test(`${state.name} in ${locale}: a form column of at most 520 px, 56 px from a plan panel that fills the body's height, fields in one row in field order, the toggle above them`, async ({
        page,
      }) => {
        await openRoom(page, locale, state.query);
        await expect(page.getByTestId("room-lengths-hint")).toBeVisible();
        // 1B has no lengths, so there is no drawing yet — only the measured box.
        await expect(page.getByTestId("room-plan-box")).toHaveAttribute(
          "data-plan-measured",
          "true",
        );

        const layout = await readDimensionsLayout(page);
        const detail = JSON.stringify(layout);

        expect(width(layout.fields), detail).toBeLessThanOrEqual(
          FORM_COLUMN_MAX_PX + LAYOUT_TOLERANCE_PX,
        );
        expect(width(layout.chips), detail).toBeLessThanOrEqual(
          FORM_COLUMN_MAX_PX + LAYOUT_TOLERANCE_PX,
        );
        expect(
          Math.abs(layout.plan.left - layout.fields.right - COLUMN_GAP_PX),
          detail,
        ).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);
        expect(
          Math.abs(layout.plan.bottom - layout.bodyContentBottom),
          detail,
        ).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);
        expect(width(layout.plan), detail).toBeLessThanOrEqual(
          PLAN_PANEL_MAX_PX + LAYOUT_TOLERANCE_PX,
        );

        expect(layout.fieldOrder, detail).toEqual([
          ...FIELD_ORDER[state.shape],
        ]);
        const labelTops = layout.labels.map((label) => label.top);
        expect(
          Math.max(...labelTops) - Math.min(...labelTops),
          detail,
        ).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);
        for (const [index, label] of layout.labels.entries()) {
          if (index === 0) continue;
          expect(label.left, detail).toBeGreaterThan(
            nth(layout.labels, index - 1).left,
          );
        }

        if (!DRAWS_THE_CORNER_TOGGLE[state.shape]) {
          expect(layout.corner, detail).toBeNull();
        } else {
          expect(layout.corner, detail).not.toBeNull();
          expect(
            present(layout.corner, "the corner toggle").bottom,
            detail,
          ).toBeLessThanOrEqual(Math.min(...labelTops) + LAYOUT_TOLERANCE_PX);
        }
      });
    }
  }
});

// ===========================================================================================
// Criterion 7 — the large live plan is fitted to the box it measures.
// ===========================================================================================

test.describe("criterion 7: the large live plan", () => {
  for (const room of FITTED_ROOMS) {
    test(`${room.name}: fitted to the measured box on its binding axis, one scale for every wall, 26 px walls and 14 px labels inside the box and off every bar`, async ({
      page,
    }) => {
      await openRoom(page, "ro", room.query);
      await expectMeasuredPlan(page);

      const drawing = await readPlanDrawing(page);
      expectTheDesktopDrawingFitted(drawing, room.wallsMm);
    });
  }

  test("a typed length redraws at the same box, and the fit holds", async ({
    page,
  }) => {
    await openRoom(page, "ro", TYPED_L_ROOM.query);
    await expectMeasuredPlan(page);
    const before = await readPlanDrawing(page);

    const wallA = page.getByTestId("room-length-wallA");
    await wallA.fill("");
    await wallA.pressSequentially("5200");
    await expect(page.getByTestId("room-plan-label-A")).toContainText("5200");

    const after = await readPlanDrawing(page);
    expect(after.boxWidth, JSON.stringify({ before, after })).toBeCloseTo(
      before.boxWidth,
      1,
    );
    expect(after.boxHeight).toBeCloseTo(before.boxHeight, 1);
    expectTheDesktopDrawingFitted(after, { A: 5200, B: TYPED_L_ROOM.wallB });
  });

  test("a resize from 1440 to 1100 wide redraws at the new box, and the fit holds", async ({
    page,
  }) => {
    await openRoom(page, "ro", TYPED_L_ROOM.query);
    await expectMeasuredPlan(page);
    const wide = await readPlanDrawing(page);

    await page.setViewportSize({ width: 1100, height: DESKTOP.height });
    await expect
      .poll(async () => (await readPlanDrawing(page)).boxWidth)
      .toBeLessThan(wide.boxWidth - 100);
    await expect
      .poll(async () => {
        const drawing = await readPlanDrawing(page);
        return Math.abs(drawing.svgWidth - drawing.boxWidth);
      })
      .toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);

    expectTheDesktopDrawingFitted(await readPlanDrawing(page), {
      A: TYPED_L_ROOM.wallA,
      B: TYPED_L_ROOM.wallB,
    });
  });
});

// ===========================================================================================
// Criterion 8 — nothing sized for another box is ever shown.
// ===========================================================================================

test.describe("criterion 8: nothing sized for another box is shown", () => {
  test("at 1440 px, at first load and after a reload, the drawing is measured and box-sized within a bounded pre-hydration window and on every paint after it", async ({
    page,
  }) => {
    await recordPlanPaints(page);
    await openRoom(page, "ro", TYPED_L_ROOM.query);
    await expectMeasuredPlan(page);
    const firstLoad = await readPlanPaints(page);

    await page.reload();
    await expectMeasuredPlan(page);
    const afterReload = await readPlanPaints(page);

    for (const [load, paints] of [
      ["first load", firstLoad],
      ["after reload", afterReload],
    ] as const) {
      const detail = JSON.stringify(paints);
      const windowLength = paints.findIndex(isMeasuredAndBoxSized);
      test.info().annotations.push({
        type: "pre-hydration paints",
        description: `${load}: ${String(windowLength)} of ${String(paints.length)}`,
      });

      // **Accepted limitation, not a defect — coordinator ruling on wave 7L, recorded as 7L risk R9 in
      // docs/milestones/M7-room-and-presets.md.** Zero is not achievable: the server has no viewport
      // hint, and the phone's server render must stay byte-identical at every viewport, so the
      // server always emits the phone-sized (unmeasured) drawing. A desktop browser paints that
      // before the ResizeObserver fill mode can resolve after hydration; closing the gap entirely
      // was attempted and either broke phone SSR byte-identity or raised a hydration mismatch.
      // What stays strict: the window converges (a measured paint exists), it is bounded, every
      // paint inside it is the phone render rather than some other wrong size, and every paint
      // after it is measured and box-sized.
      expect(
        windowLength,
        `${load} never converged: ${detail}`,
      ).toBeGreaterThanOrEqual(0);
      expect(windowLength, `${load}: ${detail}`).toBeLessThanOrEqual(
        MAX_PRE_HYDRATION_PLAN_PAINTS,
      );
      expect(
        paints
          .slice(0, windowLength)
          .filter((paint) => paint.measured !== "false"),
        `${load}: a pre-hydration paint that is not the phone render: ${detail}`,
      ).toEqual([]);
      expect(
        paints
          .slice(windowLength)
          .filter((paint) => !isMeasuredAndBoxSized(paint)),
        `${load}: a paint after convergence is unmeasured or not box-sized: ${detail}`,
      ).toEqual([]);
    }
  });

  test("at 390 px the plan never enters fill mode, at first load or after a reload", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await recordPlanPaints(page);
    await openRoom(page, "ro", TYPED_L_ROOM.query);
    await expect(page.getByTestId("room-plan-label-A")).toBeVisible();
    const firstLoad = await readPlanPaints(page);

    await page.reload();
    await expect(page.getByTestId("room-plan-label-A")).toBeVisible();
    const afterReload = await readPlanPaints(page);

    for (const paints of [firstLoad, afterReload]) {
      const detail = JSON.stringify(paints);
      expect(paints.length, detail).toBeGreaterThan(0);
      expect(
        paints.filter((paint) => paint.measured !== "false"),
        detail,
      ).toEqual([]);
      expect(
        paints.filter((paint) => paint.inlineHeight === ""),
        detail,
      ).toEqual([]);
    }
  });
});

// ===========================================================================================
// Criterion 9 — never a throw, and never a wider document.
// ===========================================================================================

test.describe("criterion 9: never a throw", () => {
  test("at 900 x 400 the page raises no error, the drawing stays inside its clipping box and the document is no wider than the viewport", async ({
    page,
  }) => {
    const pageErrors = recordPageErrors(page);
    await page.setViewportSize({ width: 900, height: 400 });
    await openRoom(page, "ro", TYPED_L_ROOM.query);
    await expectMeasuredPlan(page);

    const drawing = await readPlanDrawing(page);
    expect(drawing.overflow, JSON.stringify(drawing)).toBe("hidden");
    expect(await documentScrollsSideways(page)).toBe(false);
    expect(pageErrors).toEqual([]);
  });

  test("a box held below the desktop minimum is drawn at the minimum and clipped, with no error and no wider document", async ({
    page,
  }) => {
    const pageErrors = recordPageErrors(page);
    await openRoom(page, "ro", TYPED_L_ROOM.query);
    await expectMeasuredPlan(page);

    // **The floor cannot be reached by a viewport alone**: `.planCard` spans every row of the form
    // column's grid, so the box is never shorter than the column it stands beside — measured
    // 188 x 259 px at 900 x 400, against the desktop set's 26 x 74 minimum. The box is
    // therefore held under the minimum here, in the page, to exercise the floor D6 e promises.
    const shortBoxPx = DESKTOP_MINIMUM_BOX_HEIGHT_PX - 30;
    await page.addStyleTag({
      content: `[data-testid="room-plan-box"] { flex: 0 0 auto !important; height: ${String(shortBoxPx)}px !important; }`,
    });
    await expect
      .poll(async () => (await readPlanDrawing(page)).boxHeight)
      .toBeLessThan(DESKTOP_MINIMUM_BOX_HEIGHT_PX);
    await expect
      .poll(async () => (await readPlanDrawing(page)).svgHeight)
      .toBeGreaterThanOrEqual(DESKTOP_MINIMUM_BOX_HEIGHT_PX);

    const drawing = await readPlanDrawing(page);
    expect(drawing.svgHeight, JSON.stringify(drawing)).toBeGreaterThan(
      drawing.boxHeight,
    );
    expect(drawing.overflow).toBe("hidden");
    expect(await documentScrollsSideways(page)).toBe(false);
    expect(pageErrors).toEqual([]);
  });
});

// ===========================================================================================
// Criterion 10 — D1C.
// ===========================================================================================

test.describe("criterion 10: D1C", () => {
  for (const locale of LOCALES) {
    test(`${FRAME_ONE_C_ROOM.name} in ${locale}: wall B red in its box, label and plan; the reason below the row, spanning it; then the clause, the card and the note; Continue disabled`, async ({
      page,
    }) => {
      await openRoom(page, locale, FRAME_ONE_C_ROOM.query);
      await expect(roomScreen(page)).toHaveAttribute(
        "data-room-substate",
        "1C",
      );
      await expectMeasuredPlan(page);

      const red = await readWallBRefusalPaint(page);
      const redDetail = JSON.stringify(red);
      expect(red.inputInvalid, redDetail).toBe("true");
      expect(red.labelColour, redDetail).toBe(red.refusal);
      expect(red.boxBorderColour, redDetail).toBe(red.refusal);
      expect(red.planWallFill, redDetail).toBe(red.refusal);
      expect(red.planLabelColour, redDetail).toBe(red.refusal);
      expect(red.otherPlanWallsMarked, redDetail).toEqual([]);

      const column = await readOneCColumn(page);
      const detail = JSON.stringify(column);
      expect(column.reasons.length, detail).toBe(1);
      const reason = nth(column.reasons, 0);
      expect(reason.top, detail).toBeGreaterThanOrEqual(
        column.fieldRowBottom - LAYOUT_TOLERANCE_PX,
      );
      expect(
        Math.abs(reason.left - column.firstFieldLeft),
        detail,
      ).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);
      expect(
        Math.abs(reason.right - column.lastFieldRight),
        detail,
      ).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);
      expect(column.clause, detail).not.toBeNull();
      expect(column.card, detail).not.toBeNull();
      expect(column.note, detail).not.toBeNull();
      expect(
        present(column.clause, "the clause").top,
        detail,
      ).toBeGreaterThanOrEqual(reason.bottom);
      expect(
        present(column.card, "the card").top,
        detail,
      ).toBeGreaterThanOrEqual(present(column.clause, "the clause").bottom);
      expect(
        present(column.note, "the note").top,
        detail,
      ).toBeGreaterThanOrEqual(present(column.card, "the card").bottom);
      await expect(continueButton(page)).toBeDisabled();
    });

    for (const viewport of [DESKTOP, SHORT_DESKTOP]) {
      test(`${WORST_CASE_ROOM.name} at ${String(viewport.width)} x ${String(viewport.height)} in ${locale}: every reason under the row, every field and Continue reachable, the footer fixed, nothing sideways`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await openRoom(page, locale, WORST_CASE_ROOM.query);
        await expect(
          page.getByTestId("room-length-reason-height"),
        ).toBeVisible();

        const column = await readOneCColumn(page);
        const detail = JSON.stringify(column);
        expect(column.reasons.length, detail).toBe(3);
        for (const reason of column.reasons) {
          expect(reason.top, detail).toBeGreaterThanOrEqual(
            column.fieldRowBottom - LAYOUT_TOLERANCE_PX,
          );
          expect(
            Math.abs(reason.left - column.firstFieldLeft),
            detail,
          ).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);
          expect(
            Math.abs(reason.right - column.lastFieldRight),
            detail,
          ).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);
        }

        const footerBefore = await footerBox(page);
        await expectEveryTargetReachable(page);
        const footerAfter = await footerBox(page);
        expect(
          footerAfter,
          JSON.stringify({ footerBefore, footerAfter }),
        ).toEqual(footerBefore);
        expect(footerAfter.bottom).toBeCloseTo(viewport.height, 0);
      });
    }
  }
});

// ===========================================================================================
// Criterion 12 — the card is the chip.
// ===========================================================================================

test.describe("criterion 12: the suggestion card is the linear chip", () => {
  test("activating the card settles the same query and the same fields as the chip, lands on 1D, focuses the chip, and writes and composes nothing", async ({
    browser,
  }) => {
    const byCard = await settleFromFrameRoom(browser, (page) =>
      page.getByTestId("room-suggestion-action").click(),
    );
    const byChip = await settleFromFrameRoom(browser, (page) =>
      page.getByTestId("room-shape-chip-control-linear").click(),
    );
    const detail = JSON.stringify({ byCard, byChip });

    expect(byCard.query, detail).toEqual(byChip.query);
    expect(byCard.query, detail).toEqual(
      canonicalQuery(FRAME_ONE_C_ROOM.asLinearQuery),
    );
    expect(byCard.substate, detail).toBe("1D");
    expect(byCard.fields, detail).toEqual(FRAME_ONE_C_ROOM.typed);
    expect(byCard.fields, detail).toEqual(byChip.fields);
    expect(byCard.focusedTestId, detail).toBe("room-shape-chip-control-linear");
    expect(byCard.designWrites, detail).toEqual([]);
    expect(byCard.everComposed, detail).toBe(false);
  });

  test("activated from the keyboard, the card moves focus to the linear chip, never to the body", async ({
    browser,
  }) => {
    const byKeyboard = await settleFromFrameRoom(browser, async (page) => {
      await page.getByTestId("room-suggestion-action").focus();
      await page.keyboard.press("Enter");
    });
    const detail = JSON.stringify(byKeyboard);

    expect(byKeyboard.focusedTestId, detail).toBe(
      "room-shape-chip-control-linear",
    );
    expect(byKeyboard.substate, detail).toBe("1D");
    expect(byKeyboard.designWrites, detail).toEqual([]);
  });
});

// ===========================================================================================
// Criterion 14 — desktop-only is layout-only.
// ===========================================================================================

test.describe("criterion 14: desktop-only is layout-only", () => {
  test("at 390 x 844 the Sugestii card has no box and no tab stop while the clause shows as today; at 1440 the same walk reaches the card", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await openRoom(page, "ro", FRAME_ONE_C_ROOM.query);
    await expect(page.getByTestId("room-linear-suggestion")).toBeVisible();

    expect(
      await page.getByTestId("room-suggestion-card").boundingBox(),
    ).toBeNull();
    await expect(page.getByTestId("room-suggestion-card")).toBeHidden();
    const phoneStops = await tabStops(page);
    expect(phoneStops, JSON.stringify(phoneStops)).not.toContain(
      "room-suggestion-action",
    );
    // The walk is not vacuous: it reaches the controls on either side of the card.
    expect(phoneStops).toContain("room-length-height");
    expect(phoneStops).toContain("room-back");

    await page.setViewportSize(DESKTOP);
    await page.reload();
    await expect(page.getByTestId("room-suggestion-card")).toBeVisible();
    expect(await tabStops(page)).toContain("room-suggestion-action");
  });

  test("at 390 x 844 the 1F plan aside has no box and is not visible; at 1440 it is drawn", async ({
    page,
  }) => {
    test.setTimeout(COMPOSE_TIMEOUT_MS);
    await page.setViewportSize(PHONE);
    const heldWrites = await holdDesignWrites(page);
    try {
      await openRoom(page, "ro", TYPED_L_ROOM.query);
      await composeAndHold(page);

      expect(
        await page.getByTestId("room-compose-plan").boundingBox(),
      ).toBeNull();
      await expect(page.getByTestId("room-compose-plan")).toBeHidden();

      await page.setViewportSize(DESKTOP);
      await expect(page.getByTestId("room-compose-plan")).toBeVisible();
    } finally {
      await heldWrites.release();
    }
  });
});

// ===========================================================================================
// Criterion 15 — D1F.
// ===========================================================================================

test.describe("criterion 15: D1F", () => {
  for (const locale of LOCALES) {
    test(`in ${locale}: the steps column beside the room's own plan, the labels 1D showed and nothing marked, no drawn body, the form unmounted rather than hidden, and the composition title`, async ({
      page,
    }) => {
      test.setTimeout(COMPOSE_TIMEOUT_MS);
      const heldWrites = await holdDesignWrites(page);
      try {
        await openRoom(page, locale, TYPED_L_ROOM.query);
        await expectMeasuredPlan(page);
        const labelsAtOneD = await planLabelTexts(page);

        await composeAndHold(page);
        await expectMeasuredPlan(page);

        const layout = await readComposeLayout(page);
        const detail = JSON.stringify(layout);
        expect(width(layout.steps), detail).toBeLessThanOrEqual(
          STEPS_COLUMN_MAX_PX + LAYOUT_TOLERANCE_PX,
        );
        expect(width(layout.panel), detail).toBeLessThanOrEqual(
          COMPOSE_PANEL_MAX_PX + LAYOUT_TOLERANCE_PX,
        );
        expect(
          Math.abs(layout.panel.left - layout.steps.right - COLUMN_GAP_PX),
          detail,
        ).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);

        expect(await planLabelTexts(page), detail).toEqual(labelsAtOneD);
        const drawing = await readPlanDrawing(page);
        expect(drawing.walls.map((wall) => wall.marked)).toEqual([
          "false",
          "false",
        ]);
        expect(drawing.labels.map((label) => label.marked)).toEqual([
          "false",
          "false",
        ]);
        expect(layout.canvasCount, detail).toBe(0);
        await expect(page.getByTestId("room-fields")).toHaveCount(0);

        await expectTheTopBarOfD1A(page, {
          locale,
          title: titlesFor(locale).room.compose.title,
        });
      } finally {
        await heldWrites.release();
      }
    });
  }
});

// ===========================================================================================
// Criterion 16 — help targets.
// ===========================================================================================

test.describe("criterion 16: help targets", () => {
  for (const viewport of [DESKTOP, FIRST_DESKTOP_WIDTH]) {
    for (const locale of LOCALES) {
      for (const shape of ["linear", "L", "U"] as const) {
        test(`a ${shape} room at ${String(viewport.width)} x ${String(viewport.height)} in ${locale}: each wall's help is a 44 px square whose hit area covers no input`, async ({
          page,
        }) => {
          await page.setViewportSize(viewport);
          await openRoom(page, locale, ONE_B_QUERY[shape]);
          await expect(page.getByTestId("room-lengths-hint")).toBeVisible();

          const layout = await helpTargetsAndInputs(page);
          const detail = JSON.stringify(layout);
          expect(layout.targets.length, detail).toBe(
            FIELD_ORDER[shape].length - 1,
          );
          for (const target of layout.targets) {
            expect(width(target.box), detail).toBeCloseTo(TOUCH_TARGET_PX, 0);
            expect(height(target.box), detail).toBeCloseTo(TOUCH_TARGET_PX, 0);
            expect(width(target.hit), detail).toBeGreaterThanOrEqual(
              TOUCH_TARGET_PX - SCAN_STEP_PX,
            );
            expect(height(target.hit), detail).toBeGreaterThanOrEqual(
              TOUCH_TARGET_PX - SCAN_STEP_PX,
            );
            expect(
              layout.inputs.filter((input) => overlaps(target.hit, input.box)),
              detail,
            ).toEqual([]);
          }
        });
      }
    }
  }
});

// ===========================================================================================
// Criterion 17 — nothing sideways.
// ===========================================================================================

test.describe("criterion 17: nothing scrolls sideways", () => {
  const STATES = [
    { name: "1A", query: "" },
    { name: "1B, an L room", query: "shape=L&direction=left" },
    { name: "1B, a straight room", query: "shape=linear" },
    { name: "1B, a U room", query: "shape=U&direction=left" },
    { name: "1C's worst case", query: WORST_CASE_ROOM.query },
  ];

  for (const locale of LOCALES) {
    for (const state of STATES) {
      test(`${state.name} in ${locale}, at 900, 1280, 1440 and 1920 wide`, async ({
        page,
      }) => {
        await openRoom(page, locale, state.query);
        await expectNothingSidewaysAtEveryWidth(page);
      });
    }

    test(`1F in ${locale}, at 900, 1280, 1440 and 1920 wide`, async ({
      page,
    }) => {
      test.setTimeout(COMPOSE_TIMEOUT_MS);
      const heldWrites = await holdDesignWrites(page);
      try {
        await openRoom(page, locale, TYPED_L_ROOM.query);
        await composeAndHold(page);
        await expectNothingSidewaysAtEveryWidth(page);
      } finally {
        await heldWrites.release();
      }
    });
  }
});

// ===========================================================================================
// Shared assertions — criteria that more than one sub-state owes.
// ===========================================================================================

async function expectTheTopBarOfD1A(
  page: Page,
  expected: { readonly locale: Locale; readonly title: string },
): Promise<void> {
  await expect(page.getByTestId("top-bar-title")).toHaveText(expected.title);
  await expect(page.getByTestId("top-bar-step")).toHaveAttribute(
    "aria-label",
    stepSentence(expected.locale, 1),
  );
  await expect(page.locator("[role='progressbar'], progress")).toHaveCount(0);

  const bar = await readTopBar(page);
  const detail = JSON.stringify(bar);
  expect(
    Math.abs(height(bar.band) - TOP_BAR_BAND_PX),
    detail,
  ).toBeLessThanOrEqual(BAND_TOLERANCE_PX);
  expect(
    Math.abs(bar.viewportWidth - bar.chip.right - TOP_BAR_INSET_PX),
    detail,
  ).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);
  expect(bar.chip.left, detail).toBeGreaterThan(bar.titleTextRight);
  expect(bar.chipIsLastInTheBand, detail).toBe(true);

  // **Nothing painted between the title and the chip** — the borrowed divider is gone. Every pixel
  // of the strip, above the band's own bottom rule, is the band's paper.
  const strip = {
    x: Math.ceil(bar.titleTextRight) + 2,
    y: Math.ceil(bar.band.top) + 2,
    width: Math.floor(bar.chip.left) - Math.ceil(bar.titleTextRight) - 4,
    height: Math.floor(height(bar.band)) - 6,
  };
  expect(strip.width, detail).toBeGreaterThan(0);
  const paperPixels = await countPixels(page, strip, {
    kind: "near",
    color: bar.paper,
    tolerance: PAPER_TOLERANCE,
  });
  expect(paperPixels, detail).toBe(strip.width * strip.height);
}

/** Rendering noise on a flat fill: the band is one colour with no gradient and no image, so anything
 *  past this is a painted thing rather than antialiasing. */
const PAPER_TOLERANCE = 3;

function expectTheDesktopDrawingFitted(
  drawing: PlanDrawing,
  wallsMm: Readonly<Partial<Record<"A" | "B" | "C", number>>>,
): void {
  const detail = JSON.stringify({ drawing, wallsMm });
  expect(drawing.measured, detail).toBe("true");
  expect(
    drawing.walls.map((wall) => wall.id),
    detail,
  ).toEqual(Object.keys(wallsMm));
  expect(
    Math.abs(drawing.svgWidth - drawing.boxWidth),
    detail,
  ).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);

  const extent = unionOf(drawing.walls);
  const drawingRegionHeight = drawing.boxHeight - DESKTOP_LABEL_LANE_PX;
  const widthShortfall = drawing.boxWidth - width(extent);
  const heightShortfall = drawingRegionHeight - height(extent);
  expect(widthShortfall, detail).toBeGreaterThanOrEqual(-LAYOUT_TOLERANCE_PX);
  expect(heightShortfall, detail).toBeGreaterThanOrEqual(-LAYOUT_TOLERANCE_PX);
  expect(Math.min(widthShortfall, heightShortfall), detail).toBeLessThanOrEqual(
    LAYOUT_TOLERANCE_PX,
  );
  expect(extent.top, detail).toBeGreaterThanOrEqual(
    DESKTOP_LABEL_LANE_PX - LAYOUT_TOLERANCE_PX,
  );

  for (const wall of drawing.walls) {
    const thickness = wall.id === "A" ? height(wall) : width(wall);
    expect(thickness, detail).toBeCloseTo(DESKTOP_WALL_PX, 0);
  }
  expectOneScaleForEveryWall(drawing, wallsMm);

  for (const label of drawing.labels) {
    expect(label.fontSize, detail).toBe(`${String(DESKTOP_LABEL_LINE_PX)}px`);
    expect(label.left, detail).toBeGreaterThanOrEqual(-LAYOUT_TOLERANCE_PX);
    expect(label.top, detail).toBeGreaterThanOrEqual(-LAYOUT_TOLERANCE_PX);
    expect(label.right, detail).toBeLessThanOrEqual(
      drawing.boxWidth + LAYOUT_TOLERANCE_PX,
    );
    expect(label.bottom, detail).toBeLessThanOrEqual(
      drawing.boxHeight + LAYOUT_TOLERANCE_PX,
    );
    expect(
      drawing.walls.filter((wall) => overlaps(shrunk(label), wall)),
      detail,
    ).toEqual([]);
  }
}

/** Owner ruling R4: one px/mm for every drawn wall, ±1 px over the longest wall. The length a wall
 *  runs is its long side less nothing — a wall down the screen starts under wall A's thickness. */
function expectOneScaleForEveryWall(
  drawing: PlanDrawing,
  wallsMm: Readonly<Partial<Record<"A" | "B" | "C", number>>>,
): void {
  const runs = drawing.walls.map((wall) => ({
    lengthMm: present(wallsMm[wall.id], `wall ${wall.id}'s length`),
    runPx: wall.id === "A" ? width(wall) : height(wall),
  }));
  const longest = runs.reduce((first, second) =>
    second.lengthMm > first.lengthMm ? second : first,
  );
  const pxPerMm = longest.runPx / longest.lengthMm;
  for (const run of runs) {
    expect(
      Math.abs(run.runPx - run.lengthMm * pxPerMm) *
        (longest.lengthMm / run.lengthMm),
      JSON.stringify({ runs }),
    ).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX);
  }
}

async function expectNothingSidewaysAtEveryWidth(page: Page): Promise<void> {
  for (const viewport of SIDEWAYS_VIEWPORTS) {
    await page.setViewportSize(viewport);
    const overflow = await readSidewaysOverflow(page);
    const detail = JSON.stringify({ viewport, overflow });
    expect(overflow.document.scrollWidth, detail).toBeLessThanOrEqual(
      overflow.document.clientWidth,
    );
    for (const column of overflow.columns) {
      expect(column.scrollWidth, detail).toBeLessThanOrEqual(
        column.clientWidth,
      );
    }
  }
}

/** Every chip, field, reason, note and *Continuă* can be scrolled to and tapped at its centre, and
 *  nothing in the form column scrolls sideways — `room-length-fields-fit.e2e.spec.ts`'s reach claim,
 *  at desktop. */
async function expectEveryTargetReachable(page: Page): Promise<void> {
  const column = await formColumnScroll(page);
  const detail = JSON.stringify(column);
  expect(column.scrollWidth, detail).toBeLessThanOrEqual(column.clientWidth);
  expect(column.overflowX, detail).toBe("hidden");
  expect(["auto", "scroll"], detail).toContain(column.overflowY);
  expect(await documentScrollsSideways(page)).toBe(false);

  const reachable = [
    ...(await page
      .locator(
        [
          "input[data-testid^='room-shape-chip-control-']",
          "input[data-testid^='room-length-']",
          "[data-testid^='room-length-reason-']",
          "[data-testid='room-presets-after-valid']",
        ].join(", "),
      )
      .all()),
    continueButton(page),
  ];
  expect(reachable.length).toBeGreaterThan(8);
  for (const target of reachable) {
    await target.scrollIntoViewIfNeeded();
    const reach = await reachOf(target);
    expect(reach.isTopmostAtItsCentre, JSON.stringify(reach)).toBe(true);
    expect(reach.clippedPx, JSON.stringify(reach)).toBeLessThan(1);
  }
}

// ===========================================================================================
// Navigation — how the tests reach a state. No assertion lives below this line.
// ===========================================================================================

const COMPOSE_TIMEOUT_MS = 90_000;

function roomScreen(page: Page): Locator {
  return page.locator("main[data-room-substate]");
}

function continueButton(page: Page): Locator {
  return page.getByTestId("room-continue");
}

async function openRoom(page: Page, locale: Locale, query = ""): Promise<void> {
  const search = query === "" ? "" : `?${query}`;
  await page.goto(`/${locale}/configurator/room${search}`);
  await roomScreen(page).waitFor();
}

async function expectMeasuredPlan(page: Page): Promise<void> {
  const box = page.getByTestId("room-plan-box");
  await expect(box).toHaveAttribute("data-plan-measured", "true");
  await expect(box.locator("rect").first()).toBeAttached();
}

interface HeldWrites {
  readonly release: () => Promise<void>;
}

/** Holds every `POST /api/designs` — the mint that ends composition — so 1F stays on screen for as
 *  long as a test measures it, and aborts them on release so no row is ever written. */
async function holdDesignWrites(page: Page): Promise<HeldWrites> {
  const held: Route[] = [];
  const isDesignMint = (url: URL) => url.pathname === "/api/designs";
  await page.route(isDesignMint, async (route) => {
    if (route.request().method() === "POST") {
      held.push(route);
      return;
    }
    await route.continue();
  });
  return {
    release: async () => {
      await Promise.all(
        held.map((route) => route.abort().catch(() => undefined)),
      );
      await page.unrouteAll({ behavior: "ignoreErrors" });
    },
  };
}

/** From a valid room at 1D: *Continuă*, then wait for the composition to finish while its write is
 *  held. */
async function composeAndHold(page: Page): Promise<void> {
  await continueButton(page).click();
  await expect(page.getByTestId("room-compose-notice")).toHaveAttribute(
    "data-compose-phase",
    "composed",
    { timeout: COMPOSE_TIMEOUT_MS / 2 },
  );
}

interface SettledShapeChange {
  readonly query: string;
  readonly substate: string | null;
  readonly fields: Readonly<Record<string, string>>;
  readonly focusedTestId: string | null;
  readonly designWrites: readonly string[];
  readonly everComposed: boolean;
}

/** Opens frame D1C's room in a fresh page, activates something, and reads the state it settled in:
 *  the canonical query, the fields as typed, where focus went, and anything written or composed. */
async function settleFromFrameRoom(
  browser: Browser,
  activate: (page: Page) => Promise<void>,
): Promise<SettledShapeChange> {
  const context = await browser.newContext({ viewport: DESKTOP });
  const page = await context.newPage();
  const designWrites: string[] = [];
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname.startsWith("/api/designs") &&
      ["POST", "PUT"].includes(request.method())
    ) {
      designWrites.push(`${request.method()} ${request.url()}`);
    }
  });
  await page.addInitScript(() => {
    const flags = window as unknown as { __everComposed: boolean };
    flags.__everComposed = false;
    new MutationObserver(() => {
      if (document.querySelector("[data-testid='room-compose']") !== null) {
        flags.__everComposed = true;
      }
    }).observe(document, { childList: true, subtree: true });
  });
  try {
    await openRoom(page, "ro", FRAME_ONE_C_ROOM.query);
    await page.getByTestId("room-suggestion-action").waitFor();
    await activate(page);
    await page.waitForURL((url) => url.searchParams.get("shape") === "linear");
    await expect(roomScreen(page)).toHaveAttribute("data-room-substate", "1D");
    await page.waitForLoadState("networkidle");
    return {
      query: canonicalQuery(new URL(page.url()).search),
      substate: await roomScreen(page).getAttribute("data-room-substate"),
      fields: {
        wallA: await page.getByTestId("room-length-wallA").inputValue(),
        height: await page.getByTestId("room-length-height").inputValue(),
      },
      focusedTestId: await page.evaluate(
        () => document.activeElement?.getAttribute("data-testid") ?? null,
      ),
      designWrites,
      everComposed: await page.evaluate(
        () => (window as unknown as { __everComposed: boolean }).__everComposed,
      ),
    };
  } finally {
    await context.close();
  }
}

/** A query with its keys sorted, so two settles are compared by content rather than key order. */
function canonicalQuery(search: string): string {
  const params = new URLSearchParams(search);
  params.sort();
  return params.toString();
}

/** The `data-testid` (or tag) of each stop a keyboard walk from the top of the page lands on. */
async function tabStops(page: Page): Promise<readonly string[]> {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  const stops: string[] = [];
  for (let press = 0; press < MAX_TAB_STOPS; press += 1) {
    await page.keyboard.press("Tab");
    stops.push(
      await page.evaluate(() => {
        const focused = document.activeElement;
        return focused?.getAttribute("data-testid") ?? focused?.tagName ?? "";
      }),
    );
  }
  return stops;
}

/** More than one pass over 1C's controls, so a stop that exists is met. */
const MAX_TAB_STOPS = 30;

// ===========================================================================================
// Readouts — measurement only, taken in the page.
// ===========================================================================================

interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** The item a readout needs, or a thrown error naming it — never a silent `undefined`. */
function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined)
    throw new Error(`no item ${String(index)} of ${String(items.length)}`);
  return item;
}

function present<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined)
    throw new Error(`missing: ${what}`);
  return value;
}

function width(rect: Rect): number {
  return rect.right - rect.left;
}

function height(rect: Rect): number {
  return rect.bottom - rect.top;
}

function centreX(rect: Rect): number {
  return (rect.left + rect.right) / 2;
}

function unionOf(rects: readonly Rect[]): Rect {
  return {
    left: Math.min(...rects.map((rect) => rect.left)),
    top: Math.min(...rects.map((rect) => rect.top)),
    right: Math.max(...rects.map((rect) => rect.right)),
    bottom: Math.max(...rects.map((rect) => rect.bottom)),
  };
}

function overlaps(first: Rect, second: Rect): boolean {
  return (
    first.left < second.right &&
    second.left < first.right &&
    first.top < second.bottom &&
    second.top < first.bottom
  );
}

/** Half a pixel off every side: a label *touching* a bar at a shared sub-pixel edge is not over it. */
function shrunk(rect: Rect): Rect {
  return {
    left: rect.left + 0.5,
    top: rect.top + 0.5,
    right: rect.right - 0.5,
    bottom: rect.bottom - 0.5,
  };
}

/** The spread of the cards' tops — zero when they stand in one row. */
function rowSpread(layout: ShapeStepLayout): number {
  const tops = layout.cards.map((card) => card.top);
  return Math.max(...tops) - Math.min(...tops);
}

interface ShapeStepLayout {
  readonly cardIds: readonly string[];
  readonly cards: readonly Rect[];
  readonly glyphsAndNames: readonly {
    readonly glyphBottom: number;
    readonly nameTop: number;
  }[];
  readonly bodyContentCentreX: number;
  readonly continueBox: Rect;
  readonly footerContentRight: number;
  readonly footerContentWidth: number;
}

async function readShapeStep(page: Page): Promise<ShapeStepLayout> {
  return page.getByTestId("room-shapes").evaluate((shapes) => {
    const need = <T>(value: T | null | undefined, what: string): T => {
      if (value === null || value === undefined)
        throw new Error(`missing: ${what}`);
      return value;
    };
    const rectOf = (element: Element) => {
      const { left, top, right, bottom } = element.getBoundingClientRect();
      return { left, top, right, bottom };
    };
    const contentEdges = (element: Element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const left = box.left + Number.parseFloat(style.paddingLeft);
      const right = box.right - Number.parseFloat(style.paddingRight);
      return { left, right };
    };
    const cards = [
      ...shapes.querySelectorAll<HTMLElement>(
        "[data-testid^='room-shape-card-']",
      ),
    ];
    const body = need(shapes.parentElement, "the body");
    const bodyEdges = contentEdges(body);
    const cta = need(
      document.querySelector("[data-testid='room-continue']"),
      "Continue",
    );
    const footerEdges = contentEdges(need(cta.parentElement, "the footer"));
    return {
      cardIds: cards.map((card) => card.dataset.testid ?? ""),
      cards: cards.map(rectOf),
      glyphsAndNames: cards.map((card) => {
        const glyph = need(card.querySelector("svg"), "a glyph");
        return {
          glyphBottom: glyph.getBoundingClientRect().bottom,
          nameTop: need(
            glyph.nextElementSibling,
            "a name",
          ).getBoundingClientRect().top,
        };
      }),
      bodyContentCentreX: (bodyEdges.left + bodyEdges.right) / 2,
      continueBox: rectOf(cta),
      footerContentRight: footerEdges.right,
      footerContentWidth: footerEdges.right - footerEdges.left,
    };
  });
}

interface DimensionsLayout {
  readonly chips: Rect;
  readonly corner: Rect | null;
  readonly fields: Rect;
  readonly labels: readonly Rect[];
  readonly fieldOrder: readonly string[];
  readonly plan: Rect;
  readonly bodyContentBottom: number;
  readonly cta: Rect;
  readonly footerContentRight: number;
  readonly footerContentWidth: number;
}

async function readDimensionsLayout(page: Page): Promise<DimensionsLayout> {
  return page.getByTestId("room-fields").evaluate((fields) => {
    const need = <T>(value: T | null | undefined, what: string): T => {
      if (value === null || value === undefined)
        throw new Error(`missing: ${what}`);
      return value;
    };
    const rectOf = (element: Element) => {
      const { left, top, right, bottom } = element.getBoundingClientRect();
      return { left, top, right, bottom };
    };
    const byTestId = (testId: string) =>
      document.querySelector(`[data-testid='${testId}']`);
    const plan = need(byTestId("room-plan"), "the plan");
    const body = need(plan.parentElement, "the body");
    const corner = byTestId("room-corner");
    const cta = need(byTestId("room-continue"), "Continue");
    const footer = need(cta.parentElement, "the footer");
    const footerBox = footer.getBoundingClientRect();
    const footerStyle = getComputedStyle(footer);
    const footerLeft =
      footerBox.left + Number.parseFloat(footerStyle.paddingLeft);
    const footerRight =
      footerBox.right - Number.parseFloat(footerStyle.paddingRight);
    const inputs = [
      ...fields.querySelectorAll<HTMLInputElement>(
        "input[data-testid^='room-length-']",
      ),
    ].sort(
      (first, second) =>
        first.getBoundingClientRect().left -
        second.getBoundingClientRect().left,
    );
    return {
      chips: rectOf(need(byTestId("room-shape-chips"), "the chips")),
      corner: corner === null ? null : rectOf(corner),
      fields: rectOf(fields),
      labels: [...fields.querySelectorAll("label")].map(rectOf),
      fieldOrder: inputs.map((input) =>
        (input.dataset.testid ?? "").replace("room-length-", ""),
      ),
      plan: rectOf(plan),
      bodyContentBottom:
        body.getBoundingClientRect().bottom -
        Number.parseFloat(getComputedStyle(body).paddingBottom),
      cta: rectOf(cta),
      footerContentRight: footerRight,
      footerContentWidth: footerRight - footerLeft,
    };
  });
}

interface OneCColumn {
  readonly fieldRowBottom: number;
  readonly firstFieldLeft: number;
  readonly lastFieldRight: number;
  readonly reasons: readonly Rect[];
  readonly clause: Rect | null;
  readonly card: Rect | null;
  readonly note: Rect | null;
}

/** 1C's column: where the row of field boxes ends, the reasons under it, and what follows. */
async function readOneCColumn(page: Page): Promise<OneCColumn> {
  return page.getByTestId("room-fields").evaluate((fields) => {
    const need = <T>(value: T | null | undefined, what: string): T => {
      if (value === null || value === undefined)
        throw new Error(`missing: ${what}`);
      return value;
    };
    const rectOf = (element: Element) => {
      const { left, top, right, bottom } = element.getBoundingClientRect();
      return { left, top, right, bottom };
    };
    const rectOrNull = (testId: string) => {
      const element = document.querySelector(`[data-testid='${testId}']`);
      return element === null ? null : rectOf(element);
    };
    const boxes = [
      ...fields.querySelectorAll("input[data-testid^='room-length-']"),
    ].map((input) =>
      need(input.parentElement, "a field box").getBoundingClientRect(),
    );
    return {
      fieldRowBottom: Math.max(...boxes.map((box) => box.bottom)),
      firstFieldLeft: Math.min(...boxes.map((box) => box.left)),
      lastFieldRight: Math.max(...boxes.map((box) => box.right)),
      reasons: [
        ...fields.querySelectorAll("[data-testid^='room-length-reason-']"),
      ].map(rectOf),
      clause: rectOrNull("room-linear-suggestion"),
      card: rectOrNull("room-suggestion-card"),
      note: rectOrNull("room-presets-after-valid"),
    };
  });
}

interface WallBRefusalPaint {
  readonly refusal: string;
  readonly inputInvalid: string | null;
  readonly labelColour: string;
  readonly boxBorderColour: string;
  readonly planWallFill: string;
  readonly planLabelColour: string;
  readonly otherPlanWallsMarked: readonly string[];
}

async function readWallBRefusalPaint(page: Page): Promise<WallBRefusalPaint> {
  return page.getByTestId("room-length-wallB").evaluate((input) => {
    const need = <T>(value: T | null | undefined, what: string): T => {
      if (value === null || value === undefined)
        throw new Error(`missing: ${what}`);
      return value;
    };
    const probe = document.createElement("span");
    probe.style.color = "var(--refusal)";
    need(document.querySelector("main"), "main").append(probe);
    const refusal = getComputedStyle(probe).color;
    probe.remove();
    const label = need(
      document.querySelector(`label[for='${CSS.escape(input.id)}']`),
      "wall B's label",
    );
    const planLabels = [
      ...document.querySelectorAll<HTMLElement>(
        "[data-testid^='room-plan-label-']",
      ),
    ];
    const planWalls = [
      ...document.querySelectorAll("[data-testid='room-plan-box'] rect"),
    ];
    const wallBIndex = planLabels.findIndex(
      (planLabel) => planLabel.dataset.testid === "room-plan-label-B",
    );
    return {
      refusal,
      inputInvalid: input.getAttribute("aria-invalid"),
      labelColour: getComputedStyle(label).color,
      boxBorderColour: getComputedStyle(
        need(input.parentElement, "a field box"),
      ).borderTopColor,
      planWallFill: getComputedStyle(
        need(planWalls[wallBIndex], "wall B's bar"),
      ).fill,
      planLabelColour: getComputedStyle(
        need(planLabels[wallBIndex], "wall B's label"),
      ).color,
      otherPlanWallsMarked: planLabels
        .filter((planLabel) => planLabel.dataset.marked === "true")
        .map((planLabel) => planLabel.dataset.testid ?? "")
        .filter((testId) => testId !== "room-plan-label-B"),
    };
  });
}

interface TopBarReadout {
  readonly viewportWidth: number;
  readonly band: Rect;
  readonly chip: Rect;
  readonly titleTextRight: number;
  readonly chipIsLastInTheBand: boolean;
  readonly paper: readonly [number, number, number];
}

async function readTopBar(page: Page): Promise<TopBarReadout> {
  return page.getByTestId("top-bar-title").evaluate((title) => {
    const need = <T>(value: T | null | undefined, what: string): T => {
      if (value === null || value === undefined)
        throw new Error(`missing: ${what}`);
      return value;
    };
    const rectOf = (element: Element) => {
      const { left, top, right, bottom } = element.getBoundingClientRect();
      return { left, top, right, bottom };
    };
    const cell = need(title.closest("header"), "the title cell");
    const band = need(cell.parentElement, "the band");
    const chip = need(
      document.querySelector("[data-testid='top-bar-locale']"),
      "the locale chip",
    );
    const range = document.createRange();
    range.selectNodeContents(title);
    const chipBox = chip.getBoundingClientRect();
    const everythingInTheBand = [...band.querySelectorAll("*")].filter(
      (element) =>
        element.getBoundingClientRect().width > 0 &&
        !chip.contains(element) &&
        !element.contains(chip),
    );
    const paper = need(
      getComputedStyle(cell).backgroundColor.match(/\d+/g),
      "the paper colour",
    )
      .slice(0, 3)
      .map(Number) as [number, number, number];
    return {
      viewportWidth: document.documentElement.clientWidth,
      band: rectOf(band),
      chip: rectOf(chip),
      titleTextRight: range.getBoundingClientRect().right,
      chipIsLastInTheBand: everythingInTheBand.every(
        (element) =>
          element.getBoundingClientRect().right <= chipBox.left + 0.5,
      ),
      paper,
    };
  });
}

interface PlanDrawingWall extends Rect {
  readonly id: "A" | "B" | "C";
  readonly marked: string | null;
}

interface PlanDrawingLabel extends Rect {
  readonly fontSize: string;
  readonly marked: string | null;
}

interface PlanDrawing {
  readonly measured: string | null;
  readonly overflow: string;
  readonly boxWidth: number;
  readonly boxHeight: number;
  readonly svgWidth: number;
  readonly svgHeight: number;
  readonly walls: readonly PlanDrawingWall[];
  readonly labels: readonly PlanDrawingLabel[];
}

/** The drawing in the box's own coordinates — the padding box, which is what the SVG and the labels
 *  are positioned against. Each bar is matched to its wall through the label drawn from the same
 *  wall, in the same order (`plan-preview.tsx` maps both off one list). */
async function readPlanDrawing(page: Page): Promise<PlanDrawing> {
  return page.getByTestId("room-plan-box").evaluate((box) => {
    const boxRect = box.getBoundingClientRect();
    const originX = boxRect.left + box.clientLeft;
    const originY = boxRect.top + box.clientTop;
    const local = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left - originX,
        top: rect.top - originY,
        right: rect.right - originX,
        bottom: rect.bottom - originY,
      };
    };
    const svg = box.querySelector("svg");
    const labels = [
      ...box.querySelectorAll<HTMLElement>("[data-testid^='room-plan-label-']"),
    ];
    const walls = [...box.querySelectorAll("rect")];
    return {
      measured: box.getAttribute("data-plan-measured"),
      overflow: getComputedStyle(box).overflow,
      boxWidth: boxRect.width - box.clientLeft * 2,
      boxHeight: boxRect.height - box.clientTop * 2,
      svgWidth: Number(svg?.getAttribute("width") ?? Number.NaN),
      svgHeight: Number(svg?.getAttribute("height") ?? Number.NaN),
      walls: walls.map((wall, index) => ({
        ...local(wall),
        id: (labels[index]?.dataset.testid ?? "").replace(
          "room-plan-label-",
          "",
        ) as "A" | "B" | "C",
        marked: wall.getAttribute("data-marked"),
      })),
      labels: labels.map((label) => ({
        ...local(label),
        fontSize: getComputedStyle(label).fontSize,
        marked: label.getAttribute("data-marked"),
      })),
    };
  });
}

async function planLabelTexts(page: Page): Promise<readonly string[]> {
  return page.locator("[data-testid^='room-plan-label-']").allTextContents();
}

interface PlanPaint {
  readonly measured: string | null;
  readonly svgWidth: number;
  readonly boxWidth: number;
  readonly inlineHeight: string;
}

/**
 * Records the box every time the DOM changes while it holds a drawn wall — including the nodes the
 * HTML parser inserts from the server render, before any script has run.
 *
 * **Still watches the whole document, not just the box's own subtree — tried and reverted (7L review
 * finding F3).** Scoping the observer to the box (with a narrow hand-off observer watching only for
 * its first arrival, then re-attaching to the box itself) was measured against this suite's own
 * fixed code and against the `useLayoutEffect`→`useEffect` revert this file's `MAX_PRE_HYDRATION_
 * PLAN_PAINTS` comment measures: **scoped, both read 1 of 2 paints, on every leg, fixed or
 * reverted — the regression became invisible.** A `MutationObserver` fires once per microtask
 * checkpoint at which a mutation was recorded, not once per browser paint; box-scoped, the box
 * mutates the same fixed number of times (unmeasured → measured) whichever effect commits it, so the
 * count cannot see *when* that commit happened relative to a paint — only document-wide observation,
 * with its unrelated hydration mutations landing in the same or a different microtask checkpoint
 * depending on that timing, happens to expose it. Document-wide is kept, deliberately, because it is
 * the version that still catches the defect this criterion exists for; the trade-off — a count that
 * also reflects unrelated hydration activity — is why each leg's ceiling is set at its own measured
 * value with no headroom, below.
 */
async function recordPlanPaints(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const paints: unknown[] = [];
    (window as unknown as { __planPaints: unknown[] }).__planPaints = paints;
    new MutationObserver(() => {
      const box = document.querySelector<HTMLElement>(
        "[data-testid='room-plan-box']",
      );
      const svg = box?.querySelector("svg") ?? null;
      if (box === null || svg === null) return;
      if (box.querySelector("rect") === null) return;
      paints.push({
        measured: box.getAttribute("data-plan-measured"),
        svgWidth: Number(svg.getAttribute("width")),
        boxWidth: box.getBoundingClientRect().width - box.clientLeft * 2,
        inlineHeight: box.style.height,
      });
    }).observe(document, { childList: true, subtree: true, attributes: true });
  });
}

function isMeasuredAndBoxSized(paint: PlanPaint): boolean {
  return (
    paint.measured === "true" &&
    Math.abs(paint.svgWidth - paint.boxWidth) <= LAYOUT_TOLERANCE_PX
  );
}

async function readPlanPaints(page: Page): Promise<readonly PlanPaint[]> {
  return page.evaluate(
    () => (window as unknown as { __planPaints: PlanPaint[] }).__planPaints,
  );
}

interface ComposeLayout {
  readonly steps: Rect;
  readonly panel: Rect;
  readonly canvasCount: number;
}

async function readComposeLayout(page: Page): Promise<ComposeLayout> {
  return page.getByTestId("room-compose").evaluate((compose) => {
    const need = <T>(value: T | null | undefined, what: string): T => {
      if (value === null || value === undefined)
        throw new Error(`missing: ${what}`);
      return value;
    };
    const rectOf = (element: Element) => {
      const { left, top, right, bottom } = element.getBoundingClientRect();
      return { left, top, right, bottom };
    };
    const rows = need(
      compose.querySelector("[data-testid='room-compose-rows']"),
      "the rows",
    );
    return {
      steps: rectOf(rows),
      panel: rectOf(
        need(compose.querySelector("[data-testid='room-plan']"), "the plan"),
      ),
      canvasCount: compose.querySelectorAll("canvas").length,
    };
  });
}

interface SidewaysOverflow {
  readonly document: {
    readonly scrollWidth: number;
    readonly clientWidth: number;
  };
  readonly columns: readonly {
    readonly testId: string;
    readonly scrollWidth: number;
    readonly clientWidth: number;
  }[];
}

/** The document, and every column the screen is built of — the top bar, the body and the footer. */
async function readSidewaysOverflow(page: Page): Promise<SidewaysOverflow> {
  return page.evaluate(() => {
    const columns = [
      ...document.querySelectorAll("main[data-room-substate] > div"),
    ];
    return {
      document: {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      },
      columns: columns.map((column, index) => ({
        testId: column.getAttribute("data-testid") ?? `column-${String(index)}`,
        scrollWidth: column.scrollWidth,
        clientWidth: column.clientWidth,
      })),
    };
  });
}

async function documentScrollsSideways(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
}

interface FormColumnScroll {
  readonly overflowX: string;
  readonly overflowY: string;
  readonly scrollWidth: number;
  readonly clientWidth: number;
}

/** The first ancestor of the fields that clips or scrolls — the form column. */
async function formColumnScroll(page: Page): Promise<FormColumnScroll> {
  return page.getByTestId("room-fields").evaluate((fields) => {
    let column: HTMLElement | null = fields.parentElement;
    while (
      column !== null &&
      getComputedStyle(column).overflowY === "visible"
    ) {
      column = column.parentElement;
    }
    if (column === null)
      throw new Error("no column clips or scrolls the fields");
    return {
      overflowX: getComputedStyle(column).overflowX,
      overflowY: getComputedStyle(column).overflowY,
      scrollWidth: column.scrollWidth,
      clientWidth: column.clientWidth,
    };
  });
}

async function footerBox(page: Page): Promise<Rect> {
  return continueButton(page).evaluate((cta) => {
    const need = <T>(value: T | null | undefined, what: string): T => {
      if (value === null || value === undefined)
        throw new Error(`missing: ${what}`);
      return value;
    };
    const { left, top, right, bottom } = need(
      cta.parentElement,
      "the footer",
    ).getBoundingClientRect();
    return { left, top, right, bottom };
  });
}

interface Reach {
  readonly isTopmostAtItsCentre: boolean;
  readonly clippedPx: number;
}

/** Whether a tap at the element's centre lands on it, and how much of it its scrolling column — or,
 *  outside one, the viewport — still cuts off (`room-length-fields-fit.e2e.spec.ts`'s `reachOf`). */
async function reachOf(target: Locator): Promise<Reach> {
  return target.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const answered = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2,
    );
    let column: HTMLElement | null = element.parentElement;
    while (
      column !== null &&
      getComputedStyle(column).overflowY === "visible"
    ) {
      column = column.parentElement;
    }
    const visible =
      column === null
        ? { top: 0, bottom: window.innerHeight }
        : column.getBoundingClientRect();
    return {
      isTopmostAtItsCentre: answered !== null && element.contains(answered),
      clippedPx:
        Math.max(0, visible.top - box.top) +
        Math.max(0, box.bottom - visible.bottom),
    };
  });
}

/** The grid the hit area is sampled on. A measured side can read short of the true one by a step. */
const SCAN_STEP_PX = 0.5;
/** How far past the button's own box the grid reaches, so a widened target is not cut off by it. */
const SCAN_MARGIN_PX = 24;

interface HelpLayout {
  readonly inputs: readonly { readonly id: string; readonly box: Rect }[];
  readonly targets: readonly {
    readonly id: string;
    readonly hit: Rect;
    readonly box: Rect;
  }[];
}

/** Every visible input, and each help button's hit area as `elementFromPoint` answers it —
 *  `room-length-fields-fit.e2e.spec.ts`'s scan, at desktop. */
async function helpTargetsAndInputs(page: Page): Promise<HelpLayout> {
  return page.evaluate(
    ({ step, margin }) => {
      const rectOf = (element: Element) => {
        const { left, top, right, bottom } = element.getBoundingClientRect();
        return { left, top, right, bottom };
      };
      const inputs = [...document.querySelectorAll("input")]
        .filter((input) => input.getBoundingClientRect().width > 0)
        .map((input) => ({
          id: input.dataset.testid ?? "",
          box: rectOf(input),
        }));
      const buttons = [
        ...document.querySelectorAll<HTMLElement>(
          "[data-testid^='room-length-help-wall']",
        ),
      ];
      const targets = buttons.map((button) => {
        const box = rectOf(button);
        const hit = {
          left: Infinity,
          top: Infinity,
          right: -Infinity,
          bottom: -Infinity,
        };
        for (let y = box.top - margin; y < box.bottom + margin; y += step) {
          for (let x = box.left - margin; x < box.right + margin; x += step) {
            const answered = document.elementFromPoint(x, y);
            if (answered === null || !button.contains(answered)) continue;
            hit.left = Math.min(hit.left, x);
            hit.top = Math.min(hit.top, y);
            hit.right = Math.max(hit.right, x + step);
            hit.bottom = Math.max(hit.bottom, y + step);
          }
        }
        return { id: button.dataset.testid ?? "", hit, box };
      });
      return { inputs, targets };
    },
    { step: SCAN_STEP_PX, margin: SCAN_MARGIN_PX },
  );
}

function recordPageErrors(page: Page): readonly string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  return errors;
}
