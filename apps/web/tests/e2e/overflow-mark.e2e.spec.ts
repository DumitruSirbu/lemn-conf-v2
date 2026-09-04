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
 * from a `MeshBasicMaterial`; its composite with the selection outline arithmetically; the band's
 * placement as a regex over CSS text. None of those renders a pixel. The two facts the criterion
 * names — that the wash reaches the screen through real tone mapping over real materials, and that
 * the band really sits on the scene's bottom edge without taking its height — are exactly the two
 * that level cannot answer.
 *
 * ## The document, and why it is a room rather than a body
 *
 * The wave's plan assumed a resize would do it. It cannot: measured through the store's own commands
 * on the seeded design, every widening chip on every wall-B body is `refused`, and an exhaustive
 * sweep of one delete then one resize, and of one delete then one insert — 129 accepted inserts
 * across 25 openings — never puts a body past a run end. ADR 0065 says the same in words: the rule
 * "becomes live when the depth control ships", in wave 6K.
 *
 * So this resumes a stored document, the route ADR 0065 decision 7 requires and wave 6A3 shipped.
 * The document shrinks **`room.widthMm` alone**, from 3560 to 2800, and that choice is doing real
 * work rather than being convenient:
 *
 * - **Nothing moves.** Every body stands exactly where the seeded design puts it and the adapter's
 *   shell is built from the kit rather than from the document, so the fitting capture and the marked
 *   capture are the same scene. Whatever differs between them **is** the mark. An earlier version of
 *   this file added a body instead, and could not tell a wash from the cabinet it had just added.
 * - **The marked bodies are on camera.** `p2`, `p13` and `p19` stand in the middle of the overview
 *   preset at 390 px. The first two documents tried here marked `p7`/`p24` and `p4`/`p14`/`p20`,
 *   which are past the right edge of a 390 px viewport — the mark rendered perfectly and counted
 *   zero, which is how a spec reports a defect that is not there.
 * - It is the case ADR 0065 was written from — a room measured smaller than the run standing in it —
 *   and it is what M7's room control makes reachable.
 *
 * The design minted here is deleted afterwards: ADR 0006, the obligation every writing spec carries.
 */

/**
 * **This file's own background tap, and it may not borrow either of the existing ones.**
 *
 * `editor-panel.e2e.spec.ts` and `kitchen-stage.e2e.spec.ts` both tap canvas `(310, 100)` to reach
 * background while the sheet is open. Both are right for the screen they were measured on, and
 * neither survives wave 6G's settings row:
 *
 * - §9's sheet is pinned to the **viewport** at 78 dvh, so its top edge is page
 *   `844 − 0.78 × 844 = 185.68` and does not move when the canvas shrinks;
 * - the canvas now starts at page y **98.94**, measured, so the strip is `185.68 − 98.94 = 86.74` px
 *   and canvas y = 100 lands **on the sheet**.
 *
 * 40 is inside that strip with room to spare and above the kitchen. Confirmed by measurement, not by
 * arithmetic alone: the dismissal case at the end of this file taps it and the panel closes. The
 * band is not in this arithmetic at all — it is an overlay on the *bottom* of the scene box and takes
 * no flow height. The two existing constants are left alone: editing two passing files to accommodate
 * a third is the wrong direction.
 */
const BACKGROUND_ABOVE_SHEET_TAP = { x: 310, y: 40 };

/** `p2`, the right-hand base cabinet on wall A — **captured**, by tapping the running app on the
 *  document below and reading `[data-testid="selection-debug"]`. It is one of the six bodies this
 *  document marks, which is what makes the selectability case below about a *marked* body. */
const MARKED_BODY_TAP = { x: 330, y: 440 };

/** The room this document declares, and the bodies that then reach past wall A — in the **byte**
 *  order `findOverflowingPlacementIds` publishes them in (`compareOpaqueIds`), which is why `p13`
 *  precedes `p2`. Derived from the design the API returns rather than written out, so the set cannot
 *  drift from the fixture. */
const NARROWED_ROOM_WIDTH_MM = 2800;
const MARKED_PLACEMENT_IDS = ["p13", "p14", "p19", "p2", "p20", "p4"];

const SCENE_SETTLE_MS = 2500;
const RENDER_SETTLE_MS = 400;

/**
 * **The mark is counted by its red excess, not by its distance to `OVERFLOW_MARK_COLOR`.**
 *
 * The wash is a 32 % tint over whatever the body underneath is painted with, so the pixel it makes
 * is a blend and is never within counting distance of the constant that names it. Measured on this
 * render: the nearest scene pixel to `OVERFLOW_MARK_COLOR` moves only from **108.71** on a fitting
 * design to **62.32** when the wash covers thousands of pixels. A `near` test would have to open its
 * ball past 62 to see the mark at all — and the selection highlight is 90.14 away, so any ball wide
 * enough to catch the wash starts catching the highlight too. That is not a threshold to tune; it is
 * the wrong instrument. `pixels.ts` already says so for the void's blue fill, in the same words.
 *
 * `redTint` compares red against **both** other channels, because the kitchen's palette is warm and
 * oak is already red-over-blue. Red over green *and* blue by 50 is only the mark: measured **0** on
 * the seeded design in all three camera presets, and **7 875** once a body is marked.
 */
const MARK_MIN_RED_EXCESS = 50;
const MARK = { kind: "redTint", minExcess: MARK_MIN_RED_EXCESS } as const;

/** Under a third of the measured 7 875, so a camera or layout shift has room to move without either
 *  hiding a real regression or passing on a handful of stray warm pixels. */
const MIN_MARK_PIXELS = 2000;
/** Measured **0** on the fitting design in every preset. The slack is for antialiasing, not for a
 *  mark. */
const MAX_ABSENT_PIXELS = 40;

/**
 * The ball the desktop selection spec counts highlight pixels in. Used here in the one direction that
 * is still meaningful: with a mark on screen and nothing selected, **no** pixel may be counted as a
 * highlight.
 */
const SELECTION_RGB = toRgb(SELECTION_HIGHLIGHT_COLOR);
const COLOR_TOLERANCE = 60;
const SELECTION = {
  kind: "near",
  color: SELECTION_RGB,
  tolerance: COLOR_TOLERANCE,
} as const;

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
 * Stores the seeded kitchen with wall A declared narrower than the run standing on it.
 *
 * Built from the document the API just returned rather than from a literal, so it cannot drift from
 * the fixture, and it returns the ids that then overflow so the assertions read the same answer the
 * domain does.
 */
async function storeANarrowedRoom(
  page: Page,
  stored: StoredDesign,
): Promise<readonly string[]> {
  const result = await page.evaluate(
    async (target: StoredDesign & { readonly widthMm: number }) => {
      const loaded = await fetch(`/api/designs/${target.id}`);
      const { design } = (await loaded.json()) as {
        design: {
          room: { widthMm: number; depthMm: number };
          placements: {
            id: string;
            wall: string;
            alongMm: number;
            body: { widthMm: number };
          }[];
        };
      };
      const narrowed = {
        ...design,
        room: { ...design.room, widthMm: target.widthMm },
      };
      const overflowing = narrowed.placements
        .filter(
          (placement) =>
            placement.alongMm + placement.body.widthMm / 2 >
            (placement.wall === "A"
              ? narrowed.room.widthMm
              : narrowed.room.depthMm),
        )
        .map((placement) => placement.id);

      const saved = await fetch(`/api/designs/${target.id}`, {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-expected-revision": target.revision,
        },
        body: JSON.stringify(narrowed),
      });
      return { status: saved.status, overflowing };
    },
    { ...stored, widthMm: NARROWED_ROOM_WIDTH_MM },
  );

  // ADR 0065 decision 7 and ADR 0069: a design that does not fit still saves. If this is not 200 the
  // demotion has regressed and nothing below would mean anything.
  expect(result.status).toBe(200);
  expect([...result.overflowing].sort()).toEqual(MARKED_PLACEMENT_IDS);
  return result.overflowing;
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

async function boxOf(page: Page, testId: string): Promise<PixelRect> {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) throw new Error(`${testId} has no layout box`);
  return box;
}

async function canvasBox(page: Page): Promise<PixelRect> {
  const box = await page.locator("canvas").boundingBox();
  if (!box) throw new Error("the scene canvas has no layout box");
  return box;
}

/**
 * The scene's own pixels: the canvas, clipped **above the warning band**.
 *
 * The band is an amber overlay drawn on the canvas, and its own text (`#7c4a0c`) clears the red
 * excess this file counts by. Clipping it out is what keeps the count a statement about the scene
 * rather than about the sentence explaining it — and the same rectangle is used for both captures,
 * so the two are directly comparable even though the price bar makes the canvas shorter on the
 * marked document.
 */
function sceneClip(canvas: PixelRect, bandHeightPx: number): PixelRect {
  return {
    x: Math.round(canvas.x),
    y: Math.round(canvas.y),
    width: Math.round(canvas.width),
    height: Math.round(canvas.height - bandHeightPx),
  };
}

test("the mark's colour cannot be counted as the selection highlight", () => {
  // The arithmetic half, and it is deliberately modest: the two constants are 90.14 apart, which
  // clears the 60-unit ball the desktop selection spec counts in. QA measured the *composited* worst
  // case at 76.1, which also clears it. Neither clears 120, and an earlier version of this file
  // asserted exactly that — a bound nobody had measured.
  //
  // The operational half is in the next test, which counts highlight pixels on a screen that has a
  // mark on it and no selection.
  const distance = Math.hypot(
    ((OVERFLOW_MARK_COLOR >> 16) & 0xff) - SELECTION_RGB[0],
    ((OVERFLOW_MARK_COLOR >> 8) & 0xff) - SELECTION_RGB[1],
    (OVERFLOW_MARK_COLOR & 0xff) - SELECTION_RGB[2],
  );

  expect(OVERFLOW_MARK_COLOR).not.toBe(SELECTION_HIGHLIGHT_COLOR);
  expect(Math.round(distance * 100) / 100).toBe(90.14);
  expect(distance).toBeGreaterThan(COLOR_TOLERANCE);
});

test("a stored overflowing design is marked in the scene and warned about, and a fitting one is neither", async ({
  page,
}) => {
  // The marked capture first, so the band's height is known and the same rectangle can be used for
  // both.
  const stored = await mintDesign(page);
  await storeANarrowedRoom(page, stored);
  await openAndSettle(page, stored.id);

  const warning = page.getByTestId("scene-overflow-warning");
  await expect(warning).toBeVisible();
  // ADR 0065 decision 7b's sentence, verbatim. The literal is the pin; reading it from `ro.ts` here
  // would agree with any wording at all, including a tidied one.
  await expect(warning).toHaveText(
    "Dulapurile marcate depășesc lungimea peretelui. Modifică lățimile sau elimină un dulap.",
  );

  const band = await boxOf(page, "scene-overflow-warning");
  const clip = sceneClip(await canvasBox(page), band.height);
  const markedPixels = await countPixels(page, clip, MARK);
  const highlightPixels = await countPixels(page, clip, SELECTION);

  // The control, on the design the product ships, through the same rectangle.
  await page.goto("/configurator/configure");
  await page.waitForSelector("canvas", { state: "attached" });
  await page.waitForTimeout(SCENE_SETTLE_MS);
  await expect(page.getByTestId("scene-overflow-warning")).toHaveCount(0);
  const fittingPixels = await countPixels(page, clip, MARK);

  // The wash reaches the screen: through ACES tone mapping, over the kitchen's own finishes, at the
  // opacity the builder set. A differential rather than an absolute floor — the two documents are
  // the same scene, so the difference is the mark and nothing else.
  expect(fittingPixels).toBeLessThanOrEqual(MAX_ABSENT_PIXELS);
  expect(markedPixels).toBeGreaterThan(fittingPixels + MIN_MARK_PIXELS);

  // And nothing is selected, so a screen full of mark must contain no highlight at all. This is what
  // "the two never read as each other" means where it can actually be measured.
  expect(highlightPixels).toBeLessThanOrEqual(MAX_ABSENT_PIXELS);
});

test("the warning band is pinned to the scene's bottom edge and costs the canvas no height", async ({
  page,
}) => {
  // Wave 6G moved this band out of the flow. What has to be true now is that it sits on the scene
  // box's bottom edge and that **the band** takes nothing from the canvas.
  await page.goto("/configurator/configure");
  await page.waitForSelector("canvas", { state: "attached" });
  await page.waitForTimeout(SCENE_SETTLE_MS);
  const fittingCanvas = await canvasBox(page);
  const fittingBar = await boxOf(page, "price-bar");

  const stored = await mintDesign(page);
  await storeANarrowedRoom(page, stored);
  await openAndSettle(page, stored.id);

  const band = await boxOf(page, "scene-overflow-warning");
  const canvas = await canvasBox(page);
  const bar = await boxOf(page, "price-bar");

  // Pinned low: the band's bottom edge is the canvas's bottom edge, directly above the price bar.
  expect(band.y + band.height).toBeCloseTo(canvas.y + canvas.height, 0);
  expect(band.height).toBeGreaterThanOrEqual(56);

  // **The canvas does get shorter, and none of it is this band.** The overflowing document also
  // makes the price bar carry ADR 0065's flagged total, which wraps at 390 px and grows the price
  // row — wave 6C's, and it predates 6M. Measured: the bar grows 92 → 125.69 and the canvas loses
  // exactly that. The band's own contribution is the difference between those two, which is zero.
  const canvasLossPx = fittingCanvas.height - canvas.height;
  const barGrowthPx = bar.height - fittingBar.height;
  expect(barGrowthPx).toBeGreaterThan(0);
  expect(canvasLossPx - barGrowthPx).toBeCloseTo(0, 0);

  // The scene's top edge does not move at all, which is the half the band could have broken on its
  // own and did not.
  expect(canvas.y).toBeCloseTo(fittingCanvas.y, 0);
  expect(canvas.height).toBeGreaterThan(200);
});

test("the orbit hint rides above the band rather than inside it", async ({
  page,
}) => {
  // Both are bottom-anchored overlays on the same box. Pinned independently the 56 px band would be
  // drawn straight through the hint pill, which stands 16 px off the same edge.
  const stored = await mintDesign(page);
  await storeANarrowedRoom(page, stored);
  await openAndSettle(page, stored.id);

  const hint = await boxOf(page, "scene-hint");
  const band = await boxOf(page, "scene-overflow-warning");

  expect(hint.y + hint.height).toBeLessThanOrEqual(band.y);
});

test("a marked body is still selectable, and the strip above the sheet is still reachable", async ({
  page,
}) => {
  const stored = await mintDesign(page);
  const overflowing = await storeANarrowedRoom(page, stored);
  await openAndSettle(page, stored.id);

  // ADR 0065 decision 1: a marked body "stays exactly where it is and stays editable". The wash sits
  // in front of the fronts the customer taps, so this is where it is proved not to be a raycast
  // target in the real scene rather than only in a unit test.
  await page.tap("canvas", { position: MARKED_BODY_TAP });
  await page.waitForTimeout(RENDER_SETTLE_MS);
  await expect(page.getByTestId("editor-panel")).toHaveCount(1);

  const selected = await readSelection(page);
  expect(selected.selectionKind).toBe("placement");
  // Not merely *a* body: one of the bodies this document marks.
  expect(overflowing).toContain(selected.selectionId);

  // The strip above the sheet is reachable with the band on screen — the constant at the top of this
  // file, and the reason it is this file's own rather than either existing one.
  await page.tap("canvas", { position: BACKGROUND_ABOVE_SHEET_TAP });
  await page.waitForTimeout(RENDER_SETTLE_MS);
  await expect(page.getByTestId("editor-panel")).toHaveCount(0);

  // Deselecting clears the outline and leaves the mark: the body did not fit before it was selected
  // and does not fit after.
  await expect(page.getByTestId("scene-overflow-warning")).toBeVisible();
});
