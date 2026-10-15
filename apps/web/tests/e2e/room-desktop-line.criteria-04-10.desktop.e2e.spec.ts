// **Step 1's desktop line** — M7 wave 7L, slice S5 (`docs/milestones/M7-room-and-presets.md`,
// *Wave 7L — the plan (2026-09-28)*, D12 and §5): the **layout contract** of frames D1A, D1B, D1C
// and D1F, asserted at the `desktop` project's 1440 x 900 unless a test names another viewport.
//
// **This file carries criteria 4 to 10.** The contract is one spec split in three by criterion, so that no
// file outgrows an e2e shard; the other two are
// `room-desktop-line.criteria-03.desktop.e2e.spec.ts` and
// `room-desktop-line.criteria-12-17.desktop.e2e.spec.ts`, and what all three share is
// `support/room-desktop-line.ts`. Desktop project only: the `.desktop.` in the name is what
// `playwright.config.ts` routes by.
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
import { expect, test } from "@playwright/test";

import {
  LOCALES,
  DESKTOP,
  SHORT_DESKTOP,
  PHONE,
  SHAPE_COLUMN_MAX_PX,
  CTA_HEIGHT_PX,
  FORM_COLUMN_MAX_PX,
  COLUMN_GAP_PX,
  PLAN_PANEL_MAX_PX,
  DESKTOP_MINIMUM_BOX_HEIGHT_PX,
  LAYOUT_TOLERANCE_PX,
  MAX_PRE_HYDRATION_PLAN_PAINTS,
  FRAME_ONE_C_ROOM,
  WORST_CASE_ROOM,
  TYPED_L_ROOM,
  ONE_B_STATES,
  DRAWS_THE_CORNER_TOGGLE,
  FIELD_ORDER,
  FITTED_ROOMS,
  titlesFor,
  expectTheTopBarOfD1A,
  expectTheDesktopDrawingFitted,
  expectEveryTargetReachable,
  roomScreen,
  continueButton,
  openRoom,
  expectMeasuredPlan,
  nth,
  present,
  width,
  height,
  centreX,
  unionOf,
  rowSpread,
  readShapeStep,
  readDimensionsLayout,
  readOneCColumn,
  readWallBRefusalPaint,
  readPlanDrawing,
  recordPlanPaints,
  isMeasuredAndBoxSized,
  readPlanPaints,
  documentScrollsSideways,
  footerBox,
  recordPageErrors,
} from "./support/room-desktop-line";

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

      // The server cannot know the viewport and the phone's server render must stay byte-identical, so a
      // desktop load always paints the phone-sized drawing first; see ADR 0139 d11.
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
