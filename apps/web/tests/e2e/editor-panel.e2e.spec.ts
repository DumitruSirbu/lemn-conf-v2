import { expect, test, type Locator, type Page } from "@playwright/test";

import { dismissPanel, readSelection } from "./support/panel";
import { deleteMintedDesigns } from "./support/minted-designs";

/**
 * M4's phase gate (`docs/milestones/M4-editor-surface.md`, "Surfaces" — Mobile): §9's panel at
 * 390 × 844 with real touch, in a real browser, against a real WebGL canvas and the test database.
 *
 * `docs/best-practices/browser-and-visual-qa.md` is why this file exists at all: `tests/panel/` is
 * model-only, so every `disabled` prop and every section of §9 was asserted as a value and never as
 * something rendered. This is the render half.
 *
 * What it still does **not** prove, per that same guide: emulated touch is not a digitiser. There
 * is no finger-sized contact area, no drag-vs-tap slop, no mobile GPU, no device pixel ratio and no
 * iOS Safari here. A handset pass remains open (`docs/STATUS.md`).
 */

/** The seeded sink cabinet, in the default overview preset. Found by tapping the running scene and
 *  reading `[data-testid="selection-debug"]`; sensitive to `CAMERA_PRESETS.overview` and the seed. */
const SINK_CABINET_TAP = { x: 215, y: 500 };
/** Background **above** the sheet's top edge, which is the only part of the scene a tap can reach
 *  while the sheet is open — measured at 390 × 844 as page y ≈ 186, canvas y ≈ 131. */
const SCENE_STRIP_TAP = { x: 310, y: 100 };

const VIEWPORT_HEIGHT_PX = 844;
/** §10 and the milestone's Surfaces line: "roughly 70–83 vh". */
const MIN_SHEET_FRACTION = 0.7;
const MAX_SHEET_FRACTION = 0.83;
/** The milestone's touch scale for this viewport: rows 76–86 px, chips at least 44 px. */
const MIN_ROW_HEIGHT_PX = 76;
const MAX_ROW_HEIGHT_PX = 86;
const MIN_CHIP_HEIGHT_PX = 44;

const SETTLE_MS = 400;
const SCENE_SETTLE_MS = 2000;

const mintedDesignIds: string[] = [];

test.afterAll(async () => {
  await deleteMintedDesigns(mintedDesignIds);
});

test.beforeEach(async ({ page }) => {
  await page.goto("/configurator/configure");
  await page.waitForSelector("canvas", { state: "attached" });
  await page.waitForTimeout(SCENE_SETTLE_MS);
});

/** Registers whatever the design turned into for deletion, before anything is asserted about it —
 *  ADR 0006's third mechanism, and the reason it is called on the way past rather than at the end. */
async function keepForDeletion(page: Page): Promise<void> {
  const { designId } = await readSelection(page);
  if (designId && !mintedDesignIds.includes(designId))
    mintedDesignIds.push(designId);
}

async function selectSinkCabinet(page: Page): Promise<void> {
  await page.tap("canvas", { position: SINK_CABINET_TAP });
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
 * A real touch scroll inside the sheet, through Chromium's own gesture synthesis.
 *
 * Playwright's touchscreen taps but does not swipe, and a `touchmove` dispatched from page script
 * is untrusted and scrolls nothing — so a spec built on one would assert about a scroll that never
 * happened. `Input.synthesizeScrollGesture` with a touch source is the real thing.
 */
async function swipeUpInside(page: Page, box: { x: number; y: number }) {
  const session = await page.context().newCDPSession(page);
  await session.send("Input.synthesizeScrollGesture", {
    x: box.x,
    y: box.y,
    yDistance: -160,
    gestureSourceType: "touch",
    speed: 800,
  });
  await session.detach();
  await page.waitForTimeout(SETTLE_MS);
}

/**
 * **The phase gate.** §10's loop, by touch, in one test: select a body, replace it, set a finish,
 * set a handle, dismiss the sheet, and inspect the result.
 *
 * Every step reads back through `SelectionDebug`, which publishes `describeSelection`'s own `meta`
 * — the store's records, not the panel's local state — so "the edit happened" is a statement about
 * the model and not about a button having been styled.
 */
test("the §10 loop completes by touch: select, replace, finish, handle, dismiss, inspect", async ({
  page,
}) => {
  await selectSinkCabinet(page);
  const before = await readSelection(page);
  const beforeLabel = await page.getByTestId("panel-label").textContent();

  const replacement = await firstReplacementRow(page);
  const replacementId = await replacement.getAttribute("data-testid");
  await replacement.tap();
  await page.waitForTimeout(SETTLE_MS);
  await keepForDeletion(page);

  // Still open. The replacement is already in the model, and the panel — a projection of it — has
  // re-headed itself onto the new body and badged that row ACTUAL.
  await expect(page.getByTestId("editor-panel")).toHaveCount(1);
  expect(await page.getByTestId("panel-label").textContent()).not.toBe(
    beforeLabel,
  );
  await expect(page.getByTestId(String(replacementId))).toHaveAttribute(
    "data-current",
    "true",
  );

  await page.getByTestId("finish-graphite").tap();
  await page.waitForTimeout(SETTLE_MS);
  await expect(page.getByTestId("finish-graphite")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByTestId("handle-black").tap();
  await page.waitForTimeout(SETTLE_MS);
  await expect(page.getByTestId("handle-black")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Not one of the four edits was refused: M4 treats a refusal reaching the customer as a defect in
  // the list that offered it, so this is the acceptance criterion and not a smoke check.
  await expect(page.getByTestId("panel-rejection")).toHaveCount(0);
  expect((await readSelection(page)).rejection).toBe("");

  // Dismiss to inspect — §10's viewing model. The scene is on its own again and carries frame 2A's
  // instruction copy.
  await page.getByTestId("panel-done").tap();
  await expect(page.getByTestId("editor-panel")).toHaveCount(0);
  await expect(page.getByTestId("scene-hint")).toHaveCount(1);
  const after = await readSelection(page);
  expect(after.selectionId).toBe("");
  expect(after.designId).not.toBe("");
  expect(before.designId).toBe("");
});

/** Selecting a body must not also press whatever §9 puts under the finger. A touch on the canvas
 *  produces compatibility mouse events that are hit-tested when they are dispatched, by which time
 *  the sheet covers the bottom ~78 dvh — so one tap that selected the fridge used to arrive as a
 *  `click` on `finish-white` and applied a finish nobody chose, minting a design in the process.
 *  `kitchen-canvas.tsx` cancels `touchend` to stop it. This is that regression, stated as the
 *  milestone states it: the sheet never steals or leaks pointer events into the canvas. */
test("the tap that opens the sheet is not also delivered to the sheet", async ({
  page,
}) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/designs")) writes.push(request.method());
  });

  await selectSinkCabinet(page);
  await page.waitForTimeout(1000);

  const readout = await readSelection(page);
  await keepForDeletion(page);
  expect(readout.designId).toBe("");
  expect(writes).toEqual([]);
  // Nothing was chosen, so nothing is marked chosen: the handle section's note is what marks the
  // §6.5 default, and a ghost tap on a chip would have replaced it with a real choice.
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
  const scrolled = await body.evaluate((element) => element.scrollTop);
  const footerAfter = await boxOf(page.getByTestId("panel-done"));

  expect(scrolled).toBeGreaterThan(0);
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

  // §10: chips scroll horizontally rather than wrapping or shrinking below the touch target. One
  // line, and a container that scrolls — asserted as the rule rather than as today's overflow,
  // which depends on how many finishes the catalogue happens to carry.
  const finishRow = page
    .getByTestId("finish-white")
    .locator("xpath=ancestor::div[1]");
  expect(
    await finishRow.evaluate((element) => getComputedStyle(element).overflowX),
  ).toBe("auto");
  const chipTops = await page
    .locator('[data-testid^="finish-"]')
    .evaluateAll((elements) =>
      elements.map((element) =>
        Math.round(element.getBoundingClientRect().top),
      ),
    );
  expect(new Set(chipTops).size).toBe(1);
});

/**
 * Frame 2B's thumbnail, in the browser: every row paints a drawing, and every drawing is actually
 * served.
 *
 * `tests/panel/cabinet-thumbnails.test.ts` proves the file is on disk and the model resolves a URL.
 * Neither of those is the thing that fails silently — §13.4's `background-image` paints nothing
 * whether the URL is absent, wrong, or right but not served, and all three look identical to a
 * customer. So this asserts the rendered value is non-empty and then asks the server for it.
 */
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

/** The other half of "never steals or leaks": what the sheet does not cover stays live, and a
 *  gesture inside the sheet does not reach the camera. If the swipe had orbited the scene, the
 *  same canvas pixel would no longer pick the same body. */
test("the scene stays live above the sheet, and scrolling the sheet does not move the camera", async ({
  page,
}) => {
  await selectSinkCabinet(page);
  const sheet = await boxOf(page.getByTestId("editor-panel"));

  await swipeUpInside(page, { x: sheet.x + sheet.width / 2, y: sheet.y + 320 });

  // The strip of scene above the sheet still takes a tap, and it is the canvas that answers it.
  await page.tap("canvas", { position: SCENE_STRIP_TAP });
  await expect(page.getByTestId("editor-panel")).toHaveCount(0);
  expect((await readSelection(page)).selectionId).toBe("");

  await page.tap("canvas", { position: SINK_CABINET_TAP });
  await expect(async () => {
    expect((await readSelection(page)).selectionId).toBe("p0");
  }).toPass({ timeout: 2000 });
});

/**
 * The milestone asks for this test by name, "so that the viewing affordance can never quietly
 * become a deferred-commit model".
 *
 * The evidence is the model and the write path, both read **while the sheet is still open**: the
 * store's own records say the body changed, and the design has been minted and written — which only
 * happens after a command is applied. What is deliberately *not* used as evidence is the 3D scene:
 * at 390 × 844 the sheet leaves ~130 px of visible scene and it is empty room in both camera
 * presets, so there is no repainted pixel to photograph. The repaint is asserted where it is
 * visible, on desktop (`editor-rail.desktop.e2e.spec.ts`).
 */
test("an edit is in the model before the sheet is dismissed", async ({
  page,
}) => {
  await selectSinkCabinet(page);
  const before = await readSelection(page);

  const replacement = await firstReplacementRow(page);
  await replacement.tap();
  await page.waitForTimeout(SETTLE_MS);
  await keepForDeletion(page);

  await expect(page.getByTestId("editor-panel")).toHaveCount(1);
  await expect(async () => {
    const during = await readSelection(page);
    expect(during.metaKind || during.selectionId).not.toBe("");
    expect(during.designId).not.toBe("");
    expect(`${during.selectionId}/${during.metaKind}`).not.toBe(
      `${before.selectionId}/${before.metaKind}`,
    );
  }).toPass({ timeout: 5000 });
});

/**
 * §10: **Gata** and × are both *view* actions. Neither commits and neither cancels.
 *
 * "Does not commit" is asserted as no write leaving the browser on dismissal — every edit was
 * already written when it was made. "Does not cancel" is asserted by re-selecting the body and
 * finding the same panel state, which is read back out of the model.
 */
test("× and Gata both dismiss without committing or cancelling, and the state survives", async ({
  page,
}) => {
  await selectSinkCabinet(page);
  await page.getByTestId("finish-sage").tap();
  await page.waitForTimeout(SETTLE_MS);
  await keepForDeletion(page);
  await expect(page.getByTestId("finish-sage")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // The save that the edit itself scheduled has to be allowed to finish, or the quiet window below
  // would be measuring the network rather than the dismissal.
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
    await expect(page.getByTestId("finish-sage")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
  await dismissPanel(page);
});
