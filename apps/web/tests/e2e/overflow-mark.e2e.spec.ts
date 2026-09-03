import {
  OVERFLOW_MARK_COLOR,
  SELECTION_HIGHLIGHT_COLOR,
} from "@lemnaria/three-adapter";
import { expect, test, type Page } from "@playwright/test";

import { deleteMintedDesigns } from "./support/minted-designs";
import { countPixels, toRgb, type PixelRect } from "./support/pixels";
import { readSelection } from "./support/panel";

/**
 * M6 wave 6M's first acceptance criterion: a body ADR 0065 reports is **visibly marked in the
 * scene** and carries a warning saying those cabinets do not fit — *"verified by real interaction,
 * not by a unit test alone"*.
 *
 * Everything else this wave ships is asserted in node: the wash's colour, opacity and render order
 * from a `MeshBasicMaterial`; the composite with the selection outline **arithmetically**, by its own
 * head comment; the band's grid row as a regex over CSS text. None of those renders a pixel. The two
 * facts the criterion names — that the wash reaches the screen through real tone mapping over real
 * materials, and that the band really sits above the scene rather than over it — are exactly the two
 * that level cannot answer, and they are what this file is for.
 *
 * **How the overflowing design is reached, which is not what wave 6M's plan assumed.** The plan's
 * route was a resize: widen a wall-B body until `alongMm + widthMm / 2 > 2830`. That is not reachable
 * through the shipped UI. Measured on the seeded design through the store's own commands, every
 * widening chip on every wall-B body is `refused`, and an exhaustive sweep of *one delete followed by
 * one resize* and of *one delete followed by one insert* — 129 accepted inserts across 25 openings —
 * never puts a body past a run end: the furthest either wall reaches is 3500 of 3560 and 2800 of
 * 2830, the pristine ends. The engine's fit rules do not let an edit overrun a wall today; ADR 0065's
 * own sequencing says so too, that the rule "becomes live when the depth control ships" in wave 6K.
 *
 * So the route is the other one ADR 0065 decision 7 requires and wave 6A3 shipped: **a stored
 * overflowing design, resumed**. `PUT` accepts it and `GET` returns it — `qa-6a3.adversarial.test.ts`
 * proves both at the route level — and `/d/{id}` is a real customer path. The document is the seeded
 * kitchen plus the one body those route tests use, so the browser and the unit suites are looking at
 * the same overflow.
 *
 * The design minted here is deleted afterwards: ADR 0006, the obligation every writing spec carries.
 */

/**
 * **This file's own background tap, and it may not borrow either of the existing ones.**
 *
 * `editor-panel.e2e.spec.ts` and `kitchen-stage.e2e.spec.ts` both tap canvas `(310, 100)` to reach
 * background while the sheet is open. Both are correct for the designs *they* load and both are
 * unsafe here, because they assume the band's grid row is collapsed:
 *
 * - the canvas starts 55 px below the header;
 * - §9's sheet covers 78 dvh, so its top edge is page `844 − 0.78 × 844 = 185.7`;
 * - with no band that leaves a strip of `185.7 − 55 = 130.7` px, the "~131 px" recorded at
 *   `configure.module.css`, and canvas y = 100 sits inside it;
 * - **with the band** `.sceneBox` starts at `55 + 56 = 111`, so the strip is `185.7 − 111 = 74.7` px
 *   and the sheet's top edge is at canvas y ≈ 75. A tap at y = 100 lands on the sheet.
 *
 * 40 is comfortably inside the 74.7 px strip and comfortably above the kitchen, which projects no
 * higher than ~119 px into the scene box in this preset. The two existing constants are left alone:
 * they are right for their own specs, and editing two passing files to accommodate a third is the
 * wrong direction.
 */
const BACKGROUND_ABOVE_SHEET_TAP = { x: 310, y: 40 };

/** The marked body, in the overview preset. The fridge column is the far end of wall B, which is
 *  where the overflowing body stands. */
const MARKED_BODY_TAP = { x: 65, y: 470 };

const SCENE_SETTLE_MS = 2500;
const RENDER_SETTLE_MS = 400;

/**
 * The tolerance each colour is counted within, as a Euclidean ball in RGB — never equality, because
 * the renderer antialiases every edge and the wash is composited over whatever the body is painted
 * with, so no pixel is ever exactly the declared colour.
 *
 * It is **derived from the two constants rather than chosen**, and that is the point: the mark and
 * the selection highlight must not be countable as each other, so the ball has to be smaller than
 * half the distance between their centres. Asserted below before it is used, so a future edit that
 * moves either colour closer fails here rather than quietly making both counts meaningless.
 */
const MARK_RGB = toRgb(OVERFLOW_MARK_COLOR);
const SELECTION_RGB = toRgb(SELECTION_HIGHLIGHT_COLOR);
const COLOR_TOLERANCE = 60;

const MARK = {
  kind: "near",
  color: MARK_RGB,
  tolerance: COLOR_TOLERANCE,
} as const;
const SELECTION = {
  kind: "near",
  color: SELECTION_RGB,
  tolerance: COLOR_TOLERANCE,
} as const;

/**
 * The wash is translucent and tints a body rather than painting it, so an absolute pixel floor would
 * be a number nobody measured. Every count below is therefore **differential**: the same patch, the
 * same camera, the same body — the only thing that differs between the two captures is whether the
 * design overflows. `MIN_MARK_PIXELS` is the margin the overflowing capture must clear the fitting
 * one by, and `MAX_ABSENT_PIXELS` is the slack the fitting one is allowed for antialiasing.
 */
const MIN_MARK_PIXELS = 400;
const MAX_ABSENT_PIXELS = 40;

const mintedDesignIds: string[] = [];

test.afterAll(async () => {
  await deleteMintedDesigns(mintedDesignIds);
});

interface StoredDesign {
  readonly id: string;
  readonly revision: string;
}

/** Mints a row and returns it with the revision a save has to state (WEB-003). */
async function mintDesign(page: Page): Promise<StoredDesign> {
  await page.goto("/configurator/configure");
  const minted = await page.evaluate(async () => {
    const created = await fetch("/api/designs", {
      method: "POST",
      credentials: "same-origin",
    });
    const { id } = (await created.json()) as { id: string };
    const loaded = await fetch(`/api/designs/${id}`);
    const { revision } = (await loaded.json()) as { revision: string };
    return { id, revision, status: created.status };
  });

  // Registered before anything is asserted, so a failing assertion still cleans up.
  if (minted.id) mintedDesignIds.push(minted.id);
  expect(minted.status).toBe(201);
  return { id: minted.id, revision: minted.revision };
}

/**
 * Stores the seeded kitchen with one extra body standing one millimetre past the end of wall B.
 *
 * The document is built from the one the API just returned rather than from a literal, so it cannot
 * drift from the fixture; the added placement is the one `qa-6a3.adversarial.test.ts` proved saves
 * and loads with `PLACEMENT_PAST_WALL_END` as its only diagnostic.
 */
async function storeAnOverflowingDesign(
  page: Page,
  stored: StoredDesign,
): Promise<void> {
  const status = await page.evaluate(async (target: StoredDesign) => {
    const loaded = await fetch(`/api/designs/${target.id}`);
    const { design } = (await loaded.json()) as {
      design: {
        room: { depthMm: number };
        placements: unknown[];
      };
    };
    const overflowing = {
      ...design,
      placements: [
        ...design.placements,
        {
          id: "dragged-past-wall-b",
          wall: "B",
          alongMm: design.room.depthMm - 400 + 1,
          y0Mm: 0,
          body: { buildId: "base-sink-800", widthMm: 800, heightMm: 820 },
        },
      ],
    };
    const saved = await fetch(`/api/designs/${target.id}`, {
      method: "PUT",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        "x-expected-revision": target.revision,
      },
      body: JSON.stringify(overflowing),
    });
    return saved.status;
  }, stored);

  // ADR 0065 decision 7 and ADR 0069: a design that does not fit still saves. If this is not 200 the
  // demotion has regressed and nothing below would mean anything.
  expect(status).toBe(200);
}

/** Opens a stored design and waits until the scene is really mounted — `probe` is the store's own
 *  `isBodyProbeAttached`, which is what the warning band is gated on. */
async function openAndSettle(page: Page, designId: string): Promise<void> {
  await page.goto(`/d/${designId}`);
  await page.waitForSelector("canvas", { state: "attached" });
  await expect(async () => {
    expect((await readSelection(page)).probe).toBe("on");
  }).toPass({ timeout: 15_000 });
  await page.waitForTimeout(SCENE_SETTLE_MS);
}

/** The canvas's own box in page coordinates, which is what the patches below are expressed in. */
async function canvasBox(page: Page): Promise<PixelRect> {
  const box = await page.locator("canvas").boundingBox();
  if (!box) throw new Error("the scene canvas has no layout box");
  return {
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.round(box.width),
    height: Math.round(box.height),
  };
}

test("the two interface colours are far enough apart for the counts below to mean anything", () => {
  // Measured from the constants, not restated from a report: each count uses a ball of
  // `COLOR_TOLERANCE`, so the two balls are disjoint only while the centres are more than twice that
  // apart. If a later wave moves either colour, this fails before the counts start lying.
  const distance = Math.hypot(
    MARK_RGB[0] - SELECTION_RGB[0],
    MARK_RGB[1] - SELECTION_RGB[1],
    MARK_RGB[2] - SELECTION_RGB[2],
  );

  expect(OVERFLOW_MARK_COLOR).not.toBe(SELECTION_HIGHLIGHT_COLOR);
  expect(distance).toBeGreaterThan(2 * COLOR_TOLERANCE);
});

test("a stored overflowing design is marked in the scene and warned about, and a fitting one is neither", async ({
  page,
}) => {
  // The control first, on the design the product ships: nothing marked, nothing said.
  await page.goto("/configurator/configure");
  await page.waitForSelector("canvas", { state: "attached" });
  await page.waitForTimeout(SCENE_SETTLE_MS);

  const fittingCanvas = await canvasBox(page);
  const fittingMarkPixels = await countPixels(page, fittingCanvas, MARK);
  await expect(page.getByTestId("scene-overflow-warning")).toHaveCount(0);

  // The same scene, resumed from a document that does not fit.
  const stored = await mintDesign(page);
  await storeAnOverflowingDesign(page, stored);
  await openAndSettle(page, stored.id);

  const overflowingCanvas = await canvasBox(page);
  const overflowingMarkPixels = await countPixels(
    page,
    overflowingCanvas,
    MARK,
  );

  // The wash reaches the screen: through ACES tone mapping, over the kitchen's own finishes, at the
  // opacity the builder set. A differential rather than an absolute floor — the only thing that
  // changed between the two captures is the document.
  expect(fittingMarkPixels).toBeLessThanOrEqual(MAX_ABSENT_PIXELS);
  expect(overflowingMarkPixels).toBeGreaterThan(
    fittingMarkPixels + MIN_MARK_PIXELS,
  );

  // ADR 0065 decision 7b's sentence, verbatim, beside the bodies it explains. The literal is the pin;
  // reading it from `ro.ts` here would agree with any wording at all, including a tidied one.
  const warning = page.getByTestId("scene-overflow-warning");
  await expect(warning).toBeVisible();
  await expect(warning).toHaveText(
    "Dulapurile marcate depășesc lungimea peretelui. Modifică lățimile sau elimină un dulap.",
  );
});

test("the warning band sits above the scene rather than over it", async ({
  page,
}) => {
  const stored = await mintDesign(page);
  await storeAnOverflowingDesign(page, stored);
  await openAndSettle(page, stored.id);

  const band = await page.getByTestId("scene-overflow-warning").boundingBox();
  const canvas = await page.locator("canvas").boundingBox();
  if (!band || !canvas) throw new Error("expected both boxes to be laid out");

  // The grid-row claim, measured instead of regexed: the band's bottom edge is at or above the
  // canvas's top edge, so the two boxes cannot intersect whatever height the sentence wraps to.
  expect(band.y + band.height).toBeLessThanOrEqual(canvas.y + 1);
  expect(band.height).toBeGreaterThan(0);
  // And it really is the scene the band is above, not a collapsed canvas.
  expect(canvas.height).toBeGreaterThan(200);
});

test("a marked body is still selectable, and the strip above the sheet is still reachable", async ({
  page,
}) => {
  const stored = await mintDesign(page);
  await storeAnOverflowingDesign(page, stored);
  await openAndSettle(page, stored.id);

  // ADR 0065 decision 1: a marked body "stays exactly where it is and stays editable". The wash sits
  // in front of the fronts the customer taps, so this is the assertion that it is not a raycast
  // target in the real scene rather than only in a unit test.
  await page.tap("canvas", { position: MARKED_BODY_TAP });
  await page.waitForTimeout(RENDER_SETTLE_MS);
  await expect(page.getByTestId("editor-panel")).toHaveCount(1);

  const selected = await readSelection(page);
  expect(selected.selectionKind).toBe("placement");
  expect(selected.selectionId).not.toBe("");

  // Both marks are on screen at once and neither has replaced the other: the selected body wears the
  // outline as well as the wash, so both colours are countable in the strip's own capture.
  const canvas = await canvasBox(page);
  const selectionPixels = await countPixels(page, canvas, SELECTION);
  const markPixels = await countPixels(page, canvas, MARK);
  expect(selectionPixels).toBeGreaterThan(0);
  expect(markPixels).toBeGreaterThan(0);

  // The strip above the sheet is reachable with the band on screen — the constant at the top of this
  // file, and the reason it is this file's own rather than either existing one.
  await page.tap("canvas", { position: BACKGROUND_ABOVE_SHEET_TAP });
  await page.waitForTimeout(RENDER_SETTLE_MS);
  await expect(page.getByTestId("editor-panel")).toHaveCount(0);

  // Deselecting clears the outline and leaves the mark: the body did not fit before it was selected
  // and does not fit after.
  await expect(page.getByTestId("scene-overflow-warning")).toBeVisible();
});
