// **Step 1's desktop line** — M7 wave 7L, slice S5 (`docs/decisions/0104`, decision 1 and
// Amendment B): the **layout contract** of frames D1A, D1B, D1C and D1F, asserted at the `desktop`
// project's 1440 x 900 unless a test names another viewport.
//
// **This file carries criteria 12 and 14 to 17.** The contract is one spec split in three by criterion, so that no
// file outgrows an e2e shard; the other two are
// `room-desktop-line.criteria-03.desktop.e2e.spec.ts` and
// `room-desktop-line.criteria-04-10.desktop.e2e.spec.ts`, and what all three share is
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
  FIRST_DESKTOP_WIDTH,
  PHONE,
  COLUMN_GAP_PX,
  STEPS_COLUMN_MAX_PX,
  COMPOSE_PANEL_MAX_PX,
  TOUCH_TARGET_PX,
  LAYOUT_TOLERANCE_PX,
  FRAME_ONE_C_ROOM,
  WORST_CASE_ROOM,
  TYPED_L_ROOM,
  ONE_B_QUERY,
  FIELD_ORDER,
  titlesFor,
  expectTheTopBarOfD1A,
  expectNothingSidewaysAtEveryWidth,
  COMPOSE_TIMEOUT_MS,
  openRoom,
  expectMeasuredPlan,
  holdDesignWrites,
  composeAndHold,
  settleFromFrameRoom,
  canonicalQuery,
  tabStops,
  width,
  height,
  overlaps,
  readPlanDrawing,
  planLabelTexts,
  readComposeLayout,
  SCAN_STEP_PX,
  helpTargetsAndInputs,
} from "./support/room-desktop-line";

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
