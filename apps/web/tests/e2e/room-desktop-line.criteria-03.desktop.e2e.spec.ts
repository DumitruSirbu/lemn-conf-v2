// **Step 1's desktop line** — M7 wave 7L, slice S5 (`docs/decisions/0104`, decision 1 and
// Amendment B): the **layout contract** of frames D1A, D1B, D1C and D1F, asserted at the `desktop`
// project's 1440 x 900 unless a test names another viewport.
//
// **This file carries criterion 3.** The contract is one spec split in three by criterion, so that no
// file outgrows an e2e shard; the other two are
// `room-desktop-line.criteria-04-10.desktop.e2e.spec.ts` and
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
  LAST_PHONE_WIDTH,
  FIRST_DESKTOP_WIDTH,
  LAYOUT_TOLERANCE_PX,
  FRAME_ONE_C_ROOM,
  openRoom,
  nth,
  present,
  width,
  rowSpread,
  readShapeStep,
  readDimensionsLayout,
} from "./support/room-desktop-line";

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
