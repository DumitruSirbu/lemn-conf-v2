import { expect, type Locator, type Page } from "@playwright/test";

import {
  dismissPanel,
  readSelection,
  storedRevision,
  waitForFirstSave,
} from "./support/panel";
import {
  SINK_CABINET_TAP,
  tapCanvas,
  tapSceneStripAboveSheet,
} from "./support/canvas-taps";
import { openSeededDesign, test } from "./support/seeded-design";

// Emulated touch is not a digitiser: no finger-sized contact area, drag-vs-tap slop, mobile GPU, device pixel ratio
// or iOS Safari (`docs/best-practices/browser-and-visual-qa.md`).

/** Background above the sheet's top edge, the only part of the scene a tap reaches while the sheet is open. Only `x`
 *  is used: the strip's height is measured live. */
const SCENE_STRIP_TAP = { x: 310, y: 100 };

const VIEWPORT_HEIGHT_PX = 844;
/** §10: "roughly 70–83 vh". */
const MIN_SHEET_FRACTION = 0.7;
const MAX_SHEET_FRACTION = 0.83;
/** The milestone's touch scale for this viewport: rows 76–86 px, chips at least 44 px. */
const MIN_ROW_HEIGHT_PX = 76;
const MAX_ROW_HEIGHT_PX = 86;
const MIN_CHIP_HEIGHT_PX = 44;

const SETTLE_MS = 400;
const SWIPE_DISTANCE_PX = 160;
const SCENE_SETTLE_MS = 2000;

test.beforeEach(async ({ page, seededDesign }) => {
  await openSeededDesign(page, seededDesign);
  await page.waitForTimeout(SCENE_SETTLE_MS);
});

async function selectSinkCabinet(page: Page): Promise<void> {
  await tapCanvas(page, SINK_CABINET_TAP);
  await expect(page.getByTestId("editor-panel")).toHaveCount(1);
  await expect(async () => {
    expect((await readSelection(page)).selectionId).toBe("p0");
  }).toPass({ timeout: 2000 });
}

/** The first row §9 offers that is not the body already standing there — what "replace it" means
 *  when the list is derived rather than hard-coded. */
async function firstReplacementRow(page: Page): Promise<Locator> {
  const rows = page.locator('[data-testid^="offer-"][data-current="false"]');
  await expect(rows.first()).toBeVisible();
  return rows.first();
}

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("expected the element to have a layout box");
  return box;
}

/**
 * A real touch drag dispatched event by event with `Input.dispatchTouchEvent`. Not `Input.synthesizeScrollGesture`:
 * that returns once dispatched and animates the scroll over later frames, which left `scrollTop` at 0 on CI runners.
 * Playwright's touchscreen taps but cannot swipe, and a `touchmove` from page script is untrusted and scrolls nothing.
 */
async function swipeUpInside(page: Page, box: { x: number; y: number }) {
  const session = await page.context().newCDPSession(page);
  const send = async (
    type: "touchStart" | "touchMove" | "touchEnd",
    y: number,
  ) =>
    session.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x: box.x, y }],
    });

  await send("touchStart", box.y);
  // Several steps: a single large move reads as a fling to some scroll implementations.
  for (let offset = 32; offset <= SWIPE_DISTANCE_PX; offset += 32) {
    await send("touchMove", box.y - offset);
  }
  await send("touchEnd", box.y - SWIPE_DISTANCE_PX);
  await session.detach();
  await page.waitForTimeout(SETTLE_MS);
}

/** §10's loop, by touch, in one test. Every step reads back through `SelectionDebug`, which publishes the store's
 *  own `meta`, so "the edit happened" is a statement about the model, not a styled button. */
test("the §10 loop completes by touch: select, replace, finish, handle, dismiss, inspect", async ({
  page,
  seededDesign,
}) => {
  await selectSinkCabinet(page);
  const before = await readSelection(page);
  const beforeLabel = await page.getByTestId("panel-label").textContent();
  expect(await storedRevision(page, seededDesign.id)).toBe(
    seededDesign.revision,
  );

  const replacement = await firstReplacementRow(page);
  const replacementId = await replacement.getAttribute("data-testid");
  await replacement.tap();
  await page.waitForTimeout(SETTLE_MS);
  await waitForFirstSave(page, seededDesign);

  await expect(page.getByTestId("editor-panel")).toHaveCount(1);
  expect(await page.getByTestId("panel-label").textContent()).not.toBe(
    beforeLabel,
  );
  await expect(page.getByTestId(String(replacementId))).toHaveAttribute(
    "data-current",
    "true",
  );

  await page.getByTestId("finish-pal.antracit").tap();
  await page.waitForTimeout(SETTLE_MS);
  await expect(page.getByTestId("finish-pal.antracit")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByTestId("handle-black").tap();
  await page.waitForTimeout(SETTLE_MS);
  await expect(page.getByTestId("handle-black")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // A refusal reaching the customer is a defect in the list that offered it (M4's acceptance criterion).
  await expect(page.getByTestId("panel-rejection")).toHaveCount(0);
  expect((await readSelection(page)).rejection).toBe("");

  await page.getByTestId("panel-done").tap();
  await expect(page.getByTestId("editor-panel")).toHaveCount(0);
  await expect(page.getByTestId("scene-hint")).toHaveCount(1);
  const after = await readSelection(page);
  expect(after.selectionId).toBe("");
  // The id is fixed by the fixture's own mint and does not change on a write.
  expect(after.designId).toBe(seededDesign.id);
  expect(before.designId).toBe(seededDesign.id);
});

/** The touch's compatibility mouse events are hit-tested at dispatch, when the sheet already covers the bottom
 *  ~78 dvh; `kitchen-canvas.tsx` cancels `touchend` so the tap that selects a body does not click a swatch under it. */
test("the tap that opens the sheet is not also delivered to the sheet", async ({
  page,
  seededDesign,
}) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/designs")) writes.push(request.method());
  });

  await selectSinkCabinet(page);
  await page.waitForTimeout(1000);

  const readout = await readSelection(page);
  expect(readout.designId).toBe(seededDesign.id);
  // Checked after `writes`, deliberately: the check below is itself a `GET` and would fall in the collector's window.
  expect(writes).toEqual([]);
  expect(await storedRevision(page, seededDesign.id)).toBe(
    seededDesign.revision,
  );
  // The handle section's note marks the §6.5 default; a ghost tap on a chip would have replaced it with a real choice.
  await expect(page.getByTestId("section-handle")).toContainText("Implicit");
});

test("the sheet occupies 70-83 vh, scrolls internally, and keeps its footer pinned", async ({
  page,
}) => {
  await selectSinkCabinet(page);

  const sheet = await boxOf(page.getByTestId("editor-panel"));
  expect(sheet.height / VIEWPORT_HEIGHT_PX).toBeGreaterThanOrEqual(
    MIN_SHEET_FRACTION,
  );
  expect(sheet.height / VIEWPORT_HEIGHT_PX).toBeLessThanOrEqual(
    MAX_SHEET_FRACTION,
  );
  // It sits on the bottom edge, so what is left of the viewport is scene rather than a gap.
  expect(sheet.y + sheet.height).toBeCloseTo(VIEWPORT_HEIGHT_PX, 0);

  const body = page
    .getByTestId("replace-rows")
    .locator("xpath=ancestor::div[1]");
  const scroll = await body.evaluate((element) => ({
    overflowY: getComputedStyle(element).overflowY,
    scrollable: element.scrollHeight > element.clientHeight,
  }));
  expect(scroll.overflowY).toBe("auto");
  expect(scroll.scrollable).toBe(true);

  const footerBefore = await boxOf(page.getByTestId("panel-done"));
  await swipeUpInside(page, { x: sheet.x + sheet.width / 2, y: sheet.y + 320 });

  // Polled, not sampled once: the smooth scroll runs for about 200 ms, so a single read after a fixed wait is a
  // race that CI runners lose.
  await expect
    .poll(async () => body.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);

  const footerAfter = await boxOf(page.getByTestId("panel-done"));
  expect(footerAfter.y).toBeCloseTo(footerBefore.y, 0);
});

test("rows and chips meet the touch scale, and chip rows scroll rather than wrap", async ({
  page,
}) => {
  await selectSinkCabinet(page);

  const rowHeights = await page
    .locator('[data-testid^="offer-"]')
    .evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().height),
    );
  expect(rowHeights.length).toBeGreaterThan(0);
  for (const height of rowHeights) {
    expect(height).toBeGreaterThanOrEqual(MIN_ROW_HEIGHT_PX);
    expect(height).toBeLessThanOrEqual(MAX_ROW_HEIGHT_PX);
  }

  const chipHeights = await page
    .locator('[data-testid^="handle-"], [data-testid^="finish-"]')
    .evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().height),
    );
  expect(chipHeights.length).toBeGreaterThan(0);
  for (const height of chipHeights)
    expect(height).toBeGreaterThanOrEqual(MIN_CHIP_HEIGHT_PX);

  // §10: chips scroll horizontally rather than wrapping. `decor-list` is named because `colour-options` is not always
  // the carousel: the same testid carries `.woodPair` for the veneer tier, which does not scroll.
  const finishRow = page.locator(
    '[data-finish-control="decor-list"] [data-testid="colour-options"]',
  );
  expect(
    await finishRow.evaluate((element) => getComputedStyle(element).overflowX),
  ).toBe("auto");
  // Scoped to the carousel's container: the way back out of an override is deliberately outside `colour-options`,
  // so a page-wide sweep would read it as a wrapped chip.
  const chipTops = await finishRow
    .locator('[data-testid^="finish-"]')
    .evaluateAll((elements) =>
      elements.map((element) =>
        Math.round(element.getBoundingClientRect().top),
      ),
    );
  expect(new Set(chipTops).size).toBe(1);

  // The reset sits on its own row beneath the carousel and spans it, so it cannot scroll out of sight.
  const followRow = page.getByTestId("finish-follow-kitchen");
  const carouselBox = await boxOf(finishRow);
  const followBox = await boxOf(followRow);
  expect(followBox.y).toBeGreaterThanOrEqual(
    carouselBox.y + carouselBox.height,
  );
  expect(followBox.width).toBeCloseTo(carouselBox.width, 0);
});

/** Frame 2B's thumbnail: §13.4's `background-image` paints nothing whether the URL is absent, wrong, or right but
 *  not served, and all three look identical, so this asserts the value is non-empty and asks the server for it. */
test("every offer row paints a drawing, and every drawing is served", async ({
  page,
}) => {
  await selectSinkCabinet(page);

  const thumbnailUrls = await page
    .locator('[data-testid^="offer-"] [data-testid="row-thumb"]')
    .evaluateAll((elements) =>
      elements.map((element) => getComputedStyle(element).backgroundImage),
    );
  expect(thumbnailUrls.length).toBeGreaterThan(0);

  for (const backgroundImage of thumbnailUrls) {
    expect(backgroundImage).toMatch(/^url\(".*\/cabinets\/[\w-]+\.svg"\)$/);
    const url = backgroundImage.slice('url("'.length, -'")'.length);
    expect((await page.request.get(url)).status()).toBe(200);
  }
});

/** What the sheet does not cover stays live, and a gesture inside the sheet does not reach the camera: an orbit
 *  would change which body the same canvas pixel picks. */
test("the scene stays live above the sheet, and scrolling the sheet does not move the camera", async ({
  page,
}) => {
  await selectSinkCabinet(page);
  const sheet = await boxOf(page.getByTestId("editor-panel"));

  await swipeUpInside(page, { x: sheet.x + sheet.width / 2, y: sheet.y + 320 });

  // The strip of scene above the sheet still takes a tap, and it is the canvas that answers it.
  await tapSceneStripAboveSheet(page, SCENE_STRIP_TAP);
  await expect(page.getByTestId("editor-panel")).toHaveCount(0);
  expect((await readSelection(page)).selectionId).toBe("");

  await tapCanvas(page, SINK_CABINET_TAP);
  await expect(async () => {
    expect((await readSelection(page)).selectionId).toBe("p0");
  }).toPass({ timeout: 2000 });
});

/** The evidence is the model and the write path, read while the sheet is still open. The 3D scene is not used: the
 *  sheet leaves only a strip of empty room, so there is no repainted pixel to photograph (the repaint is asserted on
 *  desktop, `editor-rail.desktop.e2e.spec.ts`). */
test("an edit is in the model before the sheet is dismissed", async ({
  page,
  seededDesign,
}) => {
  await selectSinkCabinet(page);
  const before = await readSelection(page);

  const replacement = await firstReplacementRow(page);
  await replacement.tap();
  await page.waitForTimeout(SETTLE_MS);
  await waitForFirstSave(page, seededDesign);

  await expect(page.getByTestId("editor-panel")).toHaveCount(1);
  await expect(async () => {
    const during = await readSelection(page);
    expect(during.metaKind || during.selectionId).not.toBe("");
    // `waitForFirstSave` above is the stronger claim that a write actually landed.
    expect(during.designId).toBe(seededDesign.id);
    expect(`${during.selectionId}/${during.metaKind}`).not.toBe(
      `${before.selectionId}/${before.metaKind}`,
    );
  }).toPass({ timeout: 5000 });
});

/** §10: Gata and × are view actions. "Does not commit" is no write leaving the browser on dismissal; "does not
 *  cancel" is re-selecting the body and finding the same panel state. */
test("× and Gata both dismiss without committing or cancelling, and the state survives", async ({
  page,
}) => {
  await selectSinkCabinet(page);
  // *Stejar Bardolino Natur*, one of PAL's six decors (the seeded kitchen carries no settings, so it is PAL); the
  // test needs an edit that lands.
  await page.getByTestId("finish-pal.stejar-bardolino").tap();
  await page.waitForTimeout(SETTLE_MS);
  await expect(page.getByTestId("finish-pal.stejar-bardolino")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // The edit's own scheduled save must finish, or the quiet window below would measure the network, not the dismissal.
  await expect(async () => {
    expect((await readSelection(page)).saveStatus).toBe("idle");
  }).toPass({ timeout: 10_000 });

  for (const dismissal of ["panel-close", "panel-done"] as const) {
    const writes: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/designs")) writes.push(request.method());
    });

    await page.getByTestId(dismissal).tap();
    await expect(page.getByTestId("editor-panel")).toHaveCount(0);
    expect((await readSelection(page)).selectionId).toBe("");
    await page.waitForTimeout(1000);
    expect(writes).toEqual([]);

    await selectSinkCabinet(page);
    await expect(
      page.getByTestId("finish-pal.stejar-bardolino"),
    ).toHaveAttribute("aria-pressed", "true");
  }
  await dismissPanel(page);
});
