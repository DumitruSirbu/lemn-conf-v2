import { expect, test, type Page } from "@playwright/test";

import {
  capturePatch,
  countChangedPixels,
  countPixelsIn,
  type CapturedPatch,
  type PixelRect,
} from "./support/pixels";
import { readSelection } from "./support/panel";
import { deleteMintedDesigns } from "./support/minted-designs";

/**
 * M4's desktop line (`docs/milestones/M4-editor-surface.md`, "Surfaces" — Desktop): frames D2A and
 * D2B at 1440 × 900, where §9's panel is a 420 px right rail the scene re-lays out beside instead
 * of a sheet drawn over it. Same section components as mobile; the branch is the shell only, and
 * it is a CSS media query rather than a React one.
 *
 * This file also carries the two **visual** assertions that no longer have anywhere to stand at
 * 390 × 844. A selected body's highlight and a selected void's highlight were captured on mobile
 * until M4; §9's sheet now covers the scene the moment either is selected, and the strip left above
 * it is empty room in both camera presets — so the two captures would differ because a sheet
 * appeared, which is an assertion that passes with selection rendering entirely broken. Here the
 * scene is visible beside the panel, so both captures are taken **with the panel open**, at one
 * canvas size and one camera, and the only thing that differs between them is what is selected.
 *
 * Coordinates are **page** pixels found by clicking the running scene and reading
 * `[data-testid="selection-debug"]`, and there are two sets, because the scene is 1440 px wide with
 * nothing selected and 1020 px wide once the rail takes its space — the same world point is not the
 * same pixel in the two states.
 */

/**
 * **Every tap below was re-measured in the running app on 2026-09-08**, after the owner's ruling
 * gave the desktop top bar its taller box (frame D2A's own 17.5 + 40 chip + 17.5 + 1 rule = 76 px,
 * up from 55), which cost the canvas 21 px and re-projected the whole scene.
 *
 * **They are measurements, not the old values less 21.** Each was found by scanning a grid of page
 * points in the running app — closing the panel between probes so every full-width point is taken
 * from the "nothing selected" state, and re-opening the rail on `p0` before every rail-open one —
 * and reading `[data-testid="selection-debug"]` back after each click. The band each anchor sits in
 * is recorded with it, because a coordinate without its band is a number the next reader cannot
 * check. Every anchor was then clicked five times in a row on both the seeded document and a
 * narrowed walnut one, and selected its body 5/5 in all cases: nothing here flaps.
 *
 * **The 21 px shift did not break the old values** — all four still selected their intended bodies.
 * Three are moved anyway, to the middle of their measured bands rather than 25-30 px from an edge,
 * which is the margin this file's own history asks for.
 */

/** The sink cabinet, in the 1440 px-canvas coordinates a first tap lands in.
 *
 *  Measured band at x 700: `p0` from y 540 to 690, background above 535. At y 610 the band runs
 *  x 660-740. The old {700, 560} still reaches `p0`, but with only ~25 px above it; this sits
 *  ~70 px from the nearer vertical edge and ~40 px from each horizontal one. */
const SINK_CABINET_FULL_WIDTH = { x: 700, y: 610 };
/** The same scene once the rail has taken its 420 px and the world has re-projected into 1020 px:
 *  a base cabinet well clear of the patches below, and the fridge column.
 *
 *  Measured band with the rail open: at y 650 `p2` runs x 640-720 (`p1` to its left, `p4` from
 *  ~730), and at x 680 it runs y 570-730. The old {700, 640} still reaches `p2` but leaves only
 *  ~30 px before `p4`; this is ~50 px from either horizontal edge and ~80 px from either vertical
 *  one. The 2026-09-06 note this replaces recorded a **flapping** `p0`/background boundary across
 *  545-560 as the reason to take an anchor deep inside a band — that reasoning is why this one
 *  moved even though the old value passed. */
const FAR_BASE_CABINET = { x: 680, y: 650 };
/** The fridge column, with the rail open. Measured band: at y 560 `p7` runs from the canvas edge
 *  to ~230 (`p6` beyond it), and at x 140 it runs y 470 to past 790. The old {200, 500} still
 *  reaches `p7` with ~30 px to spare before `p6`; this has ~90 px. */
const FRIDGE = { x: 140, y: 560 };
/** The sink cabinet again, in the coordinates it occupies **once the rail is open** — the centre of
 *  `SINK_PATCH` below, which is that body's own measured highlight box. `SINK_CABINET_FULL_WIDTH`
 *  is a 1440 px-canvas point and selects nothing here; the two are not the same world point.
 *
 *  **Kept at the value it had**, re-confirmed 2026-09-08. Measured band with the rail open: at
 *  y 590 `p0` runs x 460-550, and at x 510 it runs y 540-685 — so this point is at least 40 px
 *  from every edge, which is margin enough, and moving it would break the one relationship stated
 *  above: that it is the centre of `SINK_PATCH`. */
const SINK_CABINET_WITH_RAIL = { x: 510, y: 588 };

const VIEWPORT_WIDTH_PX = 1440;
const RAIL_WIDTH_PX = 420;
const SCENE_WIDTH_WITH_RAIL_PX = VIEWPORT_WIDTH_PX - RAIL_WIDTH_PX;

/** The milestone's desktop spacing scale: rows 52–70 px, chips on the same larger scale. */
const MIN_ROW_HEIGHT_PX = 52;
const MAX_ROW_HEIGHT_PX = 70;
const MIN_CHIP_HEIGHT_PX = 52;

/**
 * Patches of **page** pixels around the two bodies under test; **the canvas starts 76 px down**.
 *
 * **Re-measured 2026-09-09 after ADR 0104's withdrawal of the settings strip**, which took the
 * canvas from y 121, 1440 × 779 to **y 76, 1440 × 824**: the top bar is now frame D2A's one declared
 * 76 px row — five cells across it, not two — and the band that stood under it is gone.
 *
 * **The four click anchors below and the two patches have NOT been re-measured against that canvas**
 * and are the wave's one open item: the scene moved up 45 px and grew 45 px taller, so the camera's
 * aspect changed and a page point is a different world point. They need a browser with the e2e
 * harness, which is where they were found. They fail loudly rather than silently if a tap now
 * reaches another body — every one of them asserts the id it selected — and that is the failure this
 * note is here to make legible.
 *
 * **Both patches survived the shift and neither is changed**, which is a measurement and not an
 * assumption: with the rail open, each body's own region was isolated by differencing its selected
 * capture against **two** other states and keeping the pixels that moved in both, so the other
 * bodies' outlines drop out. `p0`'s region measures page x 432–592, y 479–706 and the box below
 * contains it; the vacated slot's measures x 44–267, y 604–842 and the box below contains that.
 * Each candidate was then checked against a deliberately larger box and returned the **same** count
 * — 10 416 and 6 026 — which is what says nothing is being clipped at an edge.
 *
 * A patch nudged until a count passes is the failure ADR 0028 exists for; a patch left alone
 * because it was re-measured and still frames its subject is not that.
 */
/** The sink cabinet's highlight. Re-measured with the rail open on 2026-09-08 at page x 432–592,
 *  y 479–706 — the box has ~2 px of margin below that region, which is tight but is containment
 *  rather than clipping, confirmed by the larger box reading the identical 10 416. */
const SINK_PATCH: PixelRect = { x: 420, y: 468, width: 180, height: 240 };
/** The opening the fridge leaves behind, once §5.1 has selected it. Found the same way as the tap
 *  coordinates: by removing the fridge in the running app and reading where the vacated slot
 *  projects with the rail open — re-measured 2026-09-08 at page x 44–267, y 604–842.
 *
 *  **The fridge leaves two stacked voids, and this frames the lower one, which is the one §5.1
 *  selects** (`B|2.45:v0:0.00`). That is deliberate: a box drawn around the whole column would take
 *  in a second, unselected void whose blue is in both frames of every pair, inflating the fill count
 *  with something no assertion here is about. Measured 983 blue pixels inside this box against
 *  1 925 across the column. */
const VACATED_FRIDGE_PATCH: PixelRect = {
  x: 20,
  y: 585,
  width: 252,
  height: 268,
};

/**
 * **A selection is counted by what changed, not by what colour it is** (wave 6V, ADR 0091
 * decision 6).
 *
 * What stood here counted pixels within 60 units of `SELECTION_HIGHLIGHT_COLOR`. That identified
 * the outline by its colour, which was only sound while the product's colours were closed, and
 * since wave 6R they are not: ADR 0078 decision 1 gives MDF a picker admitting every six-digit
 * hex, `#ff2d2d` included. `pixel-counter-witness.desktop.e2e.spec.ts` records what that costs —
 * on a kitchen painted the highlight's own hex the retired counter reports **16 061** pixels of
 * highlight in this file's sink patch **with the sink cabinet not selected**.
 *
 * Both captures of a pair are taken with the rail open and one body selected in each, so the canvas
 * size, the camera and the design are identical and the selection is the only difference — the
 * measurement this file was already taking and throwing away. The customer's colour is in **both**
 * frames and cancels.
 *
 * **The noise floor is measured, not chosen.** Two captures of the same patch in the same state, at
 * 1440 x 900 on 2026-09-07, differ by **0 pixels at a floor of 0** — in all three camera presets,
 * over this file's two patches and over the whole canvas, immediately, after a 1 200 ms wait, and
 * with the pointer hovering the scene (the Risks section's named traps). The render is
 * deterministic between captures. `NOISE_FLOOR` is 8 anyway: slack over a measured zero, and every
 * count below is quoted at it. The same pair is re-measured inside each test rather than trusted.
 *
 * **The four-row table, re-measured at 1440 x 900 in the overview preset on 2026-09-08** — after
 * the top-bar ruling shortened the canvas to 779 px and re-projected the scene — as differences
 * against the baseline state *a different body (`p2`) selected*. "Nothing selected" is not a
 * baseline this instrument can use — the rail closes, the canvas grows back to 1440 px and the
 * whole scene re-projects — which is why the row is named and empty rather than dropped:
 *
 * | state, differenced against `p2` selected | sink patch | vacated-fridge patch |
 * | ---------------------------------------- | ---------- | -------------------- |
 * | nothing selected                         |  no baseline (the canvas re-projects) |
 * | sink cabinet (`p0`) selected             |     10 416 |                    0 |
 * | a different body (`p7`) selected         |          0 |                    0 |
 * | the vacated fridge opening selected      |          0 |                6 026 |
 *
 * Against the pre-ruling readings of 10 722 and 6 213, each lost about 3 % to the 21 px of canvas
 * height the taller top bar took. ~~Both remain more than three times `MIN_CHANGED_PIXELS`.~~
 *
 * **Struck 2026-09-11, and the whole table above it is now stale in the same way.** Every figure
 * here was measured with the 8 px outline. ADR 0107 decision 5 halved it at `378776a`, and a void
 * outline draws from the same constants, so the two depth-tested passes halved their footprint
 * while the 2 px occluded pass did not. The body case keeps a wide margin; the void's 6 026 does
 * not, and "more than three times" is very likely false for it today.
 *
 * **The floor is left where it is, deliberately.** It is a floor against negative cases that
 * measure 0, so it still turns red if the highlight is deleted — the discrimination is intact and
 * only the margin shrank. Moving a threshold on a geometric estimate is how a gate stops measuring
 * anything, so the table is marked stale rather than re-derived: **re-measure it, then decide.**
 *
 * **The positive counts did not collapse; they roughly tripled.** The retired counter read 3 603
 * and 1 691 on the same two states in the same run (3 962 and 1 759 in the 2026-09-06 table, before
 * wave 6V's casing pass took part of the outline's width for a near-black second colour). The new
 * instrument sees the whole outline move, not the fraction of it that is within 60 units of one
 * hex, so it is *more* sensitive on both positive cases and reads the same 0 on every negative one.
 *
 * `MIN_CHANGED_PIXELS` is 3 000 — under half of the sparser positive case, the void's 6 213, which
 * is the ratio the retired 800-against-1 759 floor had. Every palette measured reaches at least
 * 10 104 on the body case: 10 722 unfinished, 10 104 on `#ff2d2d`, 10 722 on `#2d5fff`, 10 720 on
 * `veneer.nuc`. `MAX_UNCHANGED_PIXELS` is 10 against a measured 0 in every negative case.
 */
const NOISE_FLOOR = 8;
const MIN_CHANGED_PIXELS = 3000;
const MAX_UNCHANGED_PIXELS = 10;

/**
 * **The one counter here that still names a colour, and the fixture property that keeps it sound**
 * (wave 6V work item 3, ADR 0091 decision 4a).
 *
 * A void's translucent blue fill is drawn in **both** states of every pair — an unselected void is
 * blue too, which is asserted below rather than assumed — so a differencing counter cannot see it
 * and this stays colour-keyed. Its premise is that nothing else in the kitchen reads blue-over-red
 * by 25, and that premise is a fact about the **fixture**, not about the palette: it holds because
 * no placement on screen wears a finish. `expectNoPlacementWearsAFinish` asserts exactly that,
 * against the document the scene is drawing, so the day a fixture starts wearing a colour this
 * counter goes red instead of lying. The witness spec records the cost of not asserting it: a
 * kitchen painted `#2d5fff` reports **16 599** blue pixels in the sink patch, which holds no void.
 *
 * Re-measured 2026-09-08 on the shortened canvas: **983** pixels in the vacated-fridge patch with
 * the slot selected, **1 367** with it unselected, and **0** in the sink patch with the sink cabinet
 * selected — against 1 071, 1 429 and 0 before the ruling. The floor is 300.
 */
const VOID_BLUE_EXCESS = 25;
const MIN_VOID_FILL_PIXELS = 300;
const MAX_ABSENT_VOID_FILL_PIXELS = 10;

const VOID_FILL = { kind: "blueTint", minExcess: VOID_BLUE_EXCESS } as const;

const SCENE_SETTLE_MS = 2500;
const RENDER_SETTLE_MS = 400;
const COMMAND_SETTLE_MS = 600;

const mintedDesignIds: string[] = [];

test.afterAll(async () => {
  await deleteMintedDesigns(mintedDesignIds);
});

test.beforeEach(async ({ page }) => {
  await page.goto("/configurator/configure");
  await page.waitForSelector("canvas", { state: "attached" });
  await page.waitForTimeout(SCENE_SETTLE_MS);
});

async function keepForDeletion(page: Page): Promise<void> {
  const { designId } = await readSelection(page);
  if (designId && !mintedDesignIds.includes(designId))
    mintedDesignIds.push(designId);
}

/** Page coordinates, which is how the constants above were found — the canvas fills the stage and
 *  starts **76 px** below the top of the screen (frame D2A's own declared top bar, and nothing else:
 *  ADR 0104 decision 2 withdrew the settings band that used to stand under it), so a canvas-relative
 *  click would be a different world point. Measured at 1440 × 900 on 2026-09-09: 76 + 824 = 900,
 *  with nothing left unaccounted for. */
async function clickScene(
  page: Page,
  position: { x: number; y: number },
): Promise<void> {
  await page.mouse.click(position.x, position.y);
  await page.waitForTimeout(RENDER_SETTLE_MS);
}

async function selectInRail(page: Page, id: string): Promise<void> {
  await expect(async () => {
    expect((await readSelection(page)).selectionId).toBe(id);
  }).toPass({ timeout: 3000 });
}

async function canvasWidth(page: Page): Promise<number> {
  const box = await page.locator("canvas").boundingBox();
  if (!box) throw new Error("expected the canvas to have a layout box");
  return box.width;
}

/** How much of a patch moved between two states, at the measured floor. */
async function changedPixels(
  page: Page,
  before: CapturedPatch,
  after: CapturedPatch,
): Promise<number> {
  return countChangedPixels(page, before, after, NOISE_FLOOR);
}

/** The negative direction, named so a reader sees which claim is being made. A bound rather than an
 *  equality: `MAX_UNCHANGED_PIXELS` is antialiasing slack over a measured 0. */
async function expectUnchanged(
  page: Page,
  before: CapturedPatch,
  after: CapturedPatch,
): Promise<void> {
  expect(await changedPixels(page, before, after)).toBeLessThanOrEqual(
    MAX_UNCHANGED_PIXELS,
  );
}

/**
 * **The blue counter's premise, as an executable assertion** (wave 6V work item 3).
 *
 * Read back from `GET /api/designs/{id}` — the document the scene is drawing, after the delete that
 * minted it — rather than from `KITCHEN_L_DESIGN`, so a divergence between the fixture and what is
 * on screen shows up here instead of being assumed away. A design with no bodies would satisfy an
 * "every placement" check vacuously, so the count is asserted first.
 */
async function expectNoPlacementWearsAFinish(
  page: Page,
  designId: string,
): Promise<void> {
  expect(designId, "the delete should have minted a design").not.toBe("");
  // Retried: the delete schedules the save that creates the row, so the id is known here a moment
  // before the document is fetchable.
  await expect(async () => {
    const worn = await page.evaluate(async (id: string) => {
      const loaded = await fetch(`/api/designs/${id}`);
      if (!loaded.ok) return { placements: 0, finishes: ["not stored yet"] };
      const { design } = (await loaded.json()) as {
        design: { placements: { id: string; body: { finish?: unknown } }[] };
      };
      return {
        placements: design.placements.length,
        finishes: design.placements
          .filter((placement) => placement.body.finish !== undefined)
          .map((placement) => placement.id),
      };
    }, designId);

    expect(worn.placements).toBeGreaterThan(0);
    expect(worn.finishes).toEqual([]);
  }).toPass({ timeout: 10_000 });
}

/** Frame D2A: with nothing selected there is no panel, and the scene has the whole width. */
test("with nothing selected the scene is full width and no panel exists", async ({
  page,
}) => {
  await expect(page.getByTestId("editor-panel")).toHaveCount(0);
  await expect(page.getByTestId("scene-hint")).toHaveCount(1);
  expect(await canvasWidth(page)).toBe(VIEWPORT_WIDTH_PX);
});

/**
 * Frame D2B, and the camera half of it.
 *
 * "The camera does not jump" is asserted by returning: the scene is captured full width, a body is
 * selected so the rail takes 420 px and the scene re-lays out, and then the selection is cleared —
 * and the scene comes back **byte-identical**. A camera that had been moved, re-seated or re-framed
 * by the layout change would not, and neither would one still easing when the capture was taken.
 */
test("selecting a body opens a 420 px rail, the scene re-lays out, and the camera does not jump", async ({
  page,
}) => {
  const beforeSelection = await page.locator("canvas").screenshot();

  await clickScene(page, SINK_CABINET_FULL_WIDTH);
  await selectInRail(page, "p0");

  const rail = await page.getByTestId("editor-panel").boundingBox();
  expect(rail?.width).toBe(RAIL_WIDTH_PX);
  expect(rail?.x).toBe(SCENE_WIDTH_WITH_RAIL_PX);
  expect(await canvasWidth(page)).toBe(SCENE_WIDTH_WITH_RAIL_PX);
  // The rail takes its own space rather than covering the scene: the two are side by side.
  await expect(page.getByTestId("scene-hint")).toHaveCount(0);

  await page.getByTestId("panel-close").click();
  await expect(page.getByTestId("editor-panel")).toHaveCount(0);
  expect(await canvasWidth(page)).toBe(VIEWPORT_WIDTH_PX);

  await expect(async () => {
    const afterDeselection = await page.locator("canvas").screenshot();
    expect(Buffer.compare(beforeSelection, afterDeselection)).toBe(0);
  }).toPass({ timeout: 5000 });
});

test("rows and chips use the larger desktop spacing scale", async ({
  page,
}) => {
  await clickScene(page, SINK_CABINET_FULL_WIDTH);
  await selectInRail(page, "p0");

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
});

/**
 * M2's highlight gate, re-homed — and re-written twice, because each version proved less than it
 * looked like it did.
 *
 * The first captured the patch with the sink cabinet selected and again with a different body
 * selected and asserted the two PNGs differed. One pixel of one antialiased edge satisfies that,
 * which is why a highlight the project owner could not see passed it. The second counted the
 * highlight's own colour, which fails the moment a customer paints a front that colour — the
 * witness spec measures 16 061 such pixels here with nothing of this body selected.
 *
 * This differences the two captures the file was already taking. Three pairs, because a difference
 * on its own only says *something* moved:
 *
 * - **`p0` selected against `p2` selected, over the sink patch** — the body's own region moves.
 * - **the same pair over the vacated-fridge patch** — and no other region moves with it.
 * - **`p2` selected against `p7` selected, over the sink patch** — two states that both leave the
 *   sink cabinet unselected, so the patch must not move at all. This is the half that says the
 *   change tracks *this body's* selection rather than any change of selection, and it is what the
 *   retired counter's "absent from the region of a body that is not selected" was reaching for.
 */
test("a selected body's outline changes its own region and nothing else", async ({
  page,
}) => {
  await clickScene(page, SINK_CABINET_FULL_WIDTH);
  await selectInRail(page, "p0");
  const sinkWithTheSinkSelected = await capturePatch(page, SINK_PATCH);
  const fridgeWithTheSinkSelected = await capturePatch(
    page,
    VACATED_FRIDGE_PATCH,
  );

  await clickScene(page, FAR_BASE_CABINET);
  await selectInRail(page, "p2");
  const sinkWithAnotherSelected = await capturePatch(page, SINK_PATCH);
  const fridgeWithAnotherSelected = await capturePatch(
    page,
    VACATED_FRIDGE_PATCH,
  );
  const sinkWithAnotherSelectedAgain = await capturePatch(page, SINK_PATCH);

  await clickScene(page, FRIDGE);
  await selectInRail(page, "p7");
  const sinkWithAThirdSelected = await capturePatch(page, SINK_PATCH);

  // The noise floor, re-measured in this run rather than taken on trust from the block above.
  await expectUnchanged(
    page,
    sinkWithAnotherSelected,
    sinkWithAnotherSelectedAgain,
  );

  expect(
    await changedPixels(page, sinkWithAnotherSelected, sinkWithTheSinkSelected),
  ).toBeGreaterThanOrEqual(MIN_CHANGED_PIXELS);
  await expectUnchanged(
    page,
    fridgeWithAnotherSelected,
    fridgeWithTheSinkSelected,
  );
  await expectUnchanged(page, sinkWithAnotherSelected, sinkWithAThirdSelected);
});

/**
 * §5 and §10: every edit applies to the model immediately, on both viewports, and nothing is
 * staged for dismissal. Here that is visible rather than inferred — the 3D scene repaints while the
 * panel is still open, at one canvas size and one camera, with only the finish changed.
 */
test("an edit repaints the scene while the panel is still open", async ({
  page,
}) => {
  await clickScene(page, SINK_CABINET_FULL_WIDTH);
  await selectInRail(page, "p0");
  const before = await page.screenshot({ clip: SINK_PATCH });

  await page.getByTestId("finish-pal.antracit").click();
  await page.waitForTimeout(COMMAND_SETTLE_MS);
  await keepForDeletion(page);

  await expect(page.getByTestId("editor-panel")).toHaveCount(1);
  await expect(page.getByTestId("finish-pal.antracit")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const after = await page.screenshot({ clip: SINK_PATCH });
  expect(Buffer.compare(before, after)).not.toBe(0);
});

/**
 * M2's void-highlight gate, re-written for the same reason as the body one above, and carrying
 * the half M3 left to the eye: **how a selected void differs from a selected body**.
 *
 * The delete is what creates the void — `KITCHEN_L_DESIGN` is fully occupied by construction — and
 * §5.1 leaves the vacated opening selected, so the first capture is the selected void.
 *
 * **Two instruments, and the split is deliberate.** *Selected* is a state the design toggles in and
 * out of, so it is differenced: the slot's own region moves when the slot is selected and the
 * cabinet's does not, and vice versa. The **fill** is not a state — an unselected void is blue too,
 * which is what makes blue-on-its-own no selection signal — so it is in both frames of every pair
 * and no difference can see it. It stays counted by colour, and it declares its fixture first.
 *
 * The pair is what tells the two apart: a selected body's region carries a moving outline and **no**
 * blue at all; a selected slot's region carries a moving outline **and** the void mesh's fill.
 */
test("a selected void is highlighted, and is distinguishable from a selected body", async ({
  page,
}) => {
  await clickScene(page, SINK_CABINET_FULL_WIDTH);
  await selectInRail(page, "p0");

  await clickScene(page, FRIDGE);
  await selectInRail(page, "p7");
  await page.getByTestId("panel-remove").click();
  await page.waitForTimeout(COMMAND_SETTLE_MS);
  await keepForDeletion(page);

  const vacated = await readSelection(page);
  expect(vacated.selectionKind).toBe("void");
  // The blue counter below identifies the fill by its colour, so the design on screen has to be one
  // in which nothing else is blue. Asserted, not assumed — and asserted against the document the
  // scene is actually drawing rather than against the fixture it was seeded from.
  await expectNoPlacementWearsAFinish(page, vacated.designId);

  const vacatedWhileSelected = await capturePatch(page, VACATED_FRIDGE_PATCH);
  const sinkWhileTheVoidIsSelected = await capturePatch(page, SINK_PATCH);

  await clickScene(page, FAR_BASE_CABINET);
  await expect(async () => {
    expect((await readSelection(page)).selectionKind).toBe("placement");
  }).toPass({ timeout: 3000 });
  const vacatedWhileAnotherSelected = await capturePatch(
    page,
    VACATED_FRIDGE_PATCH,
  );
  const sinkWhileAnotherSelected = await capturePatch(page, SINK_PATCH);

  await clickScene(page, SINK_CABINET_WITH_RAIL);
  await selectInRail(page, "p0");
  const vacatedWhileTheSinkSelected = await capturePatch(
    page,
    VACATED_FRIDGE_PATCH,
  );
  const sinkWhileTheSinkSelected = await capturePatch(page, SINK_PATCH);

  // Each selection moves its own region and only its own.
  expect(
    await changedPixels(
      page,
      vacatedWhileAnotherSelected,
      vacatedWhileSelected,
    ),
  ).toBeGreaterThanOrEqual(MIN_CHANGED_PIXELS);
  expect(
    await changedPixels(
      page,
      sinkWhileAnotherSelected,
      sinkWhileTheSinkSelected,
    ),
  ).toBeGreaterThanOrEqual(MIN_CHANGED_PIXELS);
  await expectUnchanged(
    page,
    sinkWhileAnotherSelected,
    sinkWhileTheVoidIsSelected,
  );
  await expectUnchanged(
    page,
    vacatedWhileAnotherSelected,
    vacatedWhileTheSinkSelected,
  );

  // The fill, by colour, on a fixture that has just declared itself unpainted. It is present in the
  // slot whether or not the slot is selected — the fill is the void's own, not a selection state —
  // and absent from the selected cabinet's region, which is what keeps the two kinds apart.
  expect(
    await countPixelsIn(page, vacatedWhileSelected, VOID_FILL),
  ).toBeGreaterThanOrEqual(MIN_VOID_FILL_PIXELS);
  expect(
    await countPixelsIn(page, vacatedWhileAnotherSelected, VOID_FILL),
  ).toBeGreaterThanOrEqual(MIN_VOID_FILL_PIXELS);
  expect(
    await countPixelsIn(page, sinkWhileTheSinkSelected, VOID_FILL),
  ).toBeLessThanOrEqual(MAX_ABSENT_VOID_FILL_PIXELS);
});
