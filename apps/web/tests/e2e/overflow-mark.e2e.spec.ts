import { NARROWED_ROOM_OVERFLOWING_DESIGN } from "@lemnaria/configurator-domain";
import {
  OVERFLOW_MARK_COLOR,
  SELECTION_HIGHLIGHT_COLOR,
} from "@lemnaria/three-adapter";
import { expect, type Page } from "@playwright/test";

import { ro } from "../support/romanian-content.e2e";
import { deleteMintedDesigns } from "./support/minted-designs";
import { atThisCanvas, SINK_CABINET_TAP } from "./support/canvas-taps";
import { countPixels, toRgb, type PixelRect } from "./support/pixels";
import { readSelection } from "./support/panel";
import {
  mintSeededDesign,
  openSeededDesign,
  test,
  type SeededDesign,
} from "./support/seeded-design";

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

/** ~~`p2`, the right-hand base cabinet on wall A — captured by tapping the running app on the
 *  document below and reading `[data-testid="selection-debug"]`.~~
 *
 *  **Struck 2026-09-16, and struck rather than re-measured because it has no correct value.** Wave
 *  7H made the camera a function of the customer's room; the six bodies this document marks stand
 *  past the end of wall A, and the preset frames the middle of the room, so none of them is on the
 *  canvas at any pixel. A grid of real taps across the whole scene returns only unmarked bodies.
 *  The owner ruled this accepted behaviour the same day — see the case below for what it cost.
 *
 *  Left here as a record rather than deleted: the next reader to want a marked body on screen needs
 *  to know that one was once reachable at (330, 440) and why it stopped being. */

/** The room this document declares, and the bodies that then reach past wall A — in the **byte**
 *  order `findOverflowingPlacementIds` publishes them in (`compareOpaqueIds`), which is why `p13`
 *  precedes `p2`. Derived from the design the API returns rather than written out, so the set cannot
 *  drift from the fixture.
 *
 *  The width is read off the domain's declared narrowed-room fixture (ADR 0083 decision 10) rather
 *  than restated here, so this spec and 6N-c's visual gate photograph the same room. The document
 *  itself is still built from what the API returns — only the number is shared. */
const NARROWED_ROOM_WIDTH_MM = NARROWED_ROOM_OVERFLOWING_DESIGN.room.widthMm;
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
 * ## Why this one stays colour-keyed, and what it now has to declare
 *
 * Wave 6V replaced the selection counters with a difference between two captures of the same
 * rectangle in two states of the app (ADR 0091 decision 6). **The mark is not such a state.** It
 * follows from `room.widthMm`, which no control in M6 can change, so the only "before" available is
 * a second document — and the two documents do not render into the same rectangle. Measured at
 * 1440 x 900 on 2026-09-07: ADR 0065's flagged total grows the price row, the canvas box moves from
 * `y 100, h 800` to `y 114.19, h 785.81`, and the scene re-projects into it. Differencing the two
 * gives 215 088 changed pixels at this spec's floor of 8, and 378 281 at a floor of 0, out of the
 * 1 071 360 in that rectangle — between 19 % and 43 % of every rectangle moves, so the count is a
 * measurement of the layout rather than of the wash. **The two figures are quoted at 1440 x 900
 * while this spec runs at 390 x 844**: they establish that differencing is unavailable in
 * principle, which is a fact about the two documents rather than about a viewport, and the same
 * box shift happens at 390.
 * So this counter keeps naming a colour, and under work item 3 it states the fixture property that
 * makes it sound instead of assuming it. Two properties, both asserted below rather than argued:
 *
 * - **No body on either document wears a finish.** `expectNoPlacementWearsAFinish` reads them off
 *   the document this spec stores, which is the seeded design with one number changed. Red over
 *   green *and* blue by 50 is only the mark **on that fixture**: measured 0 on the seeded design in
 *   all three camera presets, and 7 875 once a body is marked. It is not a fact about the palette —
 *   a kitchen painted `#ff2d2d` reports 16 416 such pixels with no mark anywhere on it, and
 *   `pixel-counter-witness.desktop.e2e.spec.ts` records that count.
 * - **Nothing is selected when the count is taken.** `SELECTION_HIGHLIGHT_COLOR` is 210 over both
 *   other channels, so a selection outline is itself counted as a mark — 6 454 pixels of one, on a
 *   body the document says is not marked. The witness spec measures that too. This gate has always
 *   counted with nothing selected; it now says so as an assertion.
 *
 * ## Why this gate's threshold is 50 where the witness specs' is 80
 *
 * **ADR 0091 finding 5's wood breach is reached after all, and it was measured on the wrong
 * document.** The reading that said otherwise — a walnut kitchen at 0, 0 and 3 red-excess pixels —
 * came from a fixture that wrote a per-placement finish and no kitchen colour, so under ADR 0099
 * Amendment B its structural bodies followed `material.veneer`'s declared default and what it
 * photographed was **oak**. An unmarked oak kitchen puts 194 041 / 193 783 / 278 066 pixels past 50.
 * So a counter that may meet a wood has to clear `MARK_MIN_RED_EXCESS_OVER_ANY_FINISH`, which is 80.
 *
 * **This one may not, and the reason is the wash rather than the threshold.** The mark is 32 % of
 * `OVERFLOW_MARK_COLOR` over whatever the body is painted, so over the **white** kitchen this gate
 * photographs it carries only its own share of the red and nearly all of it falls under 80. Measured
 * 2026-09-09 at 390 × 844 through this file's own rectangle, on this file's own document, with the
 * fitting control reading **0 at every one of these thresholds**:
 *
 * | min excess |     40 |    50 |    55 |    70 |  76 |  80 |
 * | ---------- | ------ | ----- | ----- | ----- | --- | --- |
 * | marked     | 27 865 | 7 494 | 1 404 | 1 136 | 311 | 252 |
 *
 * At 80 this gate would be asserting a signal of 252 where it asserts one of 7 494, which is a gate
 * given up rather than a gate hardened. It keeps 50 **because it is the one counter here that takes
 * its own control through its own rectangle on its own document** — `fittingPixels` below, measured
 * 0 — where the witness specs photograph woods and have no such control to lean on. The two numbers
 * differ because the two fixtures differ, which is the whole of the rule the witness measurement
 * established: the threshold is a property of what the document under the wash is painted.
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

/** The `seededDesign` fixture owns the one row each test narrows. This file's two fitting-control
 *  captures need a second, unmutated row beside it — the document under test is narrowed by the
 *  time the control's rectangle is known — and this is that row's own cleanup (wave 7E4 D3: `mint`
 *  now runs from `mintSeededDesign`'s own origin rather than the retired editor route). */
const fittingControlIds: string[] = [];

test.afterAll(async () => {
  await deleteMintedDesigns(fittingControlIds);
});

async function mintFittingControl(page: Page): Promise<SeededDesign> {
  const control = await mintSeededDesign(page);
  fittingControlIds.push(control.id);
  return control;
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
  stored: SeededDesign,
): Promise<readonly string[]> {
  const result = await page.evaluate(
    async (target: SeededDesign & { readonly widthMm: number }) => {
      const loaded = await fetch(`/api/designs/${target.id}`);
      const { design } = (await loaded.json()) as {
        design: {
          room: { widthMm: number; depthMm: number };
          placements: {
            id: string;
            wall: string;
            alongMm: number;
            body: { widthMm: number; finish?: unknown };
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
      // The red counter's premise, carried out of the page beside the ids it is measured against.
      const wearingAFinish = narrowed.placements
        .filter((placement) => placement.body.finish !== undefined)
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
      return {
        status: saved.status,
        overflowing,
        wearingAFinish,
        placements: narrowed.placements.length,
      };
    },
    { ...stored, widthMm: NARROWED_ROOM_WIDTH_MM },
  );

  // ADR 0065 decision 7 and ADR 0069: a design that does not fit still saves. If this is not 200 the
  // demotion has regressed and nothing below would mean anything.
  expect(result.status).toBe(200);
  expect([...result.overflowing].sort()).toEqual(MARKED_PLACEMENT_IDS);

  // **The red counter's fixture property**, asserted on the document about to be photographed and
  // on the seeded design it was built from, which is also the control. A design with no bodies
  // would satisfy "every placement" vacuously, so the count is asserted first.
  expect(result.placements).toBeGreaterThan(0);
  expect(result.wearingAFinish).toEqual([]);
  return result.overflowing;
}

/** The counter's other premise: an outline is red over both other channels by 210, so a selection
 *  on screen would be counted as a wash. Both counting states below are freshly opened documents
 *  with no selection, and this is where that stops being an assumption. */
async function expectNothingIsSelected(page: Page): Promise<void> {
  await expect(page.getByTestId("editor-panel")).toHaveCount(0);
  expect((await readSelection(page)).selectionId).toBe("");
}

/** Opens a stored design and waits until the scene is really mounted — `probe` is the store's own
 *  `isBodyProbeAttached`, which is what the warning band is gated on. Write access is confirmed by
 *  `openSeededDesign`; this only adds the probe wait `openSeededDesign` itself has no opinion on. */
async function openAndSettle(page: Page, design: SeededDesign): Promise<void> {
  await openSeededDesign(page, design);
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
  seededDesign,
}) => {
  // The marked capture first, so the band's height is known and the same rectangle can be used for
  // both.
  await storeANarrowedRoom(page, seededDesign);
  await openAndSettle(page, seededDesign);

  const warning = page.getByTestId("scene-overflow-warning");
  await expect(warning).toBeVisible();
  // ADR 0065 decision 7b's sentence, resolved through the catalogue. The pin on the *wording* is
  // the copy lock, which byte-compares `src/messages/ro.json` against the corpus Gate O1 approved;
  // what this browser can add — and a node test cannot — is that the band on the page carries that
  // leaf and not a tidied one somebody typed into the component.
  await expect(warning).toHaveText(ro.configure.overflowWarning);

  const band = await boxOf(page, "scene-overflow-warning");
  const clip = sceneClip(await canvasBox(page), band.height);
  await expectNothingIsSelected(page);
  const markedPixels = await countPixels(page, clip, MARK);
  const highlightPixels = await countPixels(page, clip, SELECTION);

  // The control, on the design the product ships, through the same rectangle. A second,
  // unmutated row beside the narrowed one (wave 7E4 D3, D1): the row under test has already been
  // narrowed by this point, so the fitting baseline needs its own.
  const fittingControl = await mintFittingControl(page);
  expect(fittingControl.id).not.toBe(seededDesign.id);
  await openAndSettle(page, fittingControl);
  await expect(page.getByTestId("scene-overflow-warning")).toHaveCount(0);
  await expectNothingIsSelected(page);
  const fittingPixels = await countPixels(page, clip, MARK);

  // The wash reaches the screen: through ACES tone mapping, over the kitchen's own finishes, at the
  // opacity the builder set. A differential of two *counts* rather than an absolute floor — the two
  // documents are the same scene, so what the count gains is the mark. It is not a difference of
  // two captures: the header above the canvas is taller on the flagged document, so the two frames
  // do not share a rectangle (see `MARK` above for the measurement).
  //
  // **What this asserted until 2026-09-16, and why it no longer can.** It asked that the mark be
  // *prominent*: `markedPixels > fittingPixels + MIN_MARK_PIXELS`, a floor of 2 000 under the 7 875
  // then measured. Wave 7H made the camera a function of the customer's room, and the bodies this
  // document marks are the ones past the end of wall A — so the preset, which frames the middle of
  // the room, no longer frames them. Measured after the change: **333**. Not one marked body is
  // reachable anywhere on the canvas.
  //
  // **The owner ruled on 2026-09-16 that this is accepted behaviour**: the band is what tells the
  // customer their kitchen overflows, and a marked body framed off screen is not a defect. So the
  // claim is restated rather than the floor lowered — *the wash reaches the framebuffer*, which is
  // the half ADR 0091 decision 6 is about, and it is measured against the **noise floor** rather
  // than against a prominence bar. `MAX_ABSENT_PIXELS` is that floor and is independently
  // measured — 0 on the fitting design in every preset, 40 of slack for antialiasing — and 333
  // clears it eightfold.
  expect(fittingPixels).toBeLessThanOrEqual(MAX_ABSENT_PIXELS);
  expect(markedPixels).toBeGreaterThan(fittingPixels + MAX_ABSENT_PIXELS);

  // **And the tripwire for the ruling's own trigger.** `MIN_MARK_PIXELS` keeps the value it was
  // measured at; it is no longer the bar, it is the line that says the world has changed. If a
  // later wave frames the marked bodies again — the overflow warning growing a tap that moves the
  // camera to them is the improvement the owner called *"great to have"* — this goes red, and
  // whoever reads it should restore the prominence assertion above rather than raise this number.
  expect(markedPixels).toBeLessThan(MIN_MARK_PIXELS);

  // And nothing is selected, so a screen full of mark must contain no highlight at all. This is what
  // "the two never read as each other" means where it can actually be measured.
  expect(highlightPixels).toBeLessThanOrEqual(MAX_ABSENT_PIXELS);
});

test("the warning band is pinned to the scene's bottom edge and costs the canvas no height", async ({
  page,
  seededDesign,
}) => {
  // Wave 6G moved this band out of the flow. What has to be true now is that it sits on the scene
  // box's bottom edge and that **the band** takes nothing from the canvas.
  //
  // The fitting baseline is the same row, read **before** it is narrowed (wave 7E4 D3): nothing
  // measured here depends on the marked state, so one row serves as its own control rather than
  // needing a second mint.
  await openAndSettle(page, seededDesign);
  const fittingCanvas = await canvasBox(page);
  const fittingBar = await boxOf(page, "price-bar");

  await storeANarrowedRoom(page, seededDesign);
  await openAndSettle(page, seededDesign);

  const band = await boxOf(page, "scene-overflow-warning");
  const canvas = await canvasBox(page);
  const bar = await boxOf(page, "price-bar");

  // Pinned low: the band's bottom edge is the canvas's bottom edge, directly above the price bar.
  expect(band.y + band.height).toBeCloseTo(canvas.y + canvas.height, 0);
  expect(band.height).toBeGreaterThanOrEqual(56);

  // **Whatever the canvas loses, the price bar took it — and this band took none of it.** When this
  // case was written the overflowing document also made the bar carry ADR 0065's flagged total,
  // which wrapped at 390 px: the bar grew 92 → 125.69 and the canvas lost exactly that. ADR 0104
  // decision 8b moved that sentence out of the bar and onto the scene, so the bar now holds a fixed
  // height and both numbers are zero — the same property, satisfied more strongly.
  //
  // The first assertion is what makes the second non-vacuous: the band stands 56 px tall (above),
  // and the canvas loses less than that, so the band cannot be paying for itself out of the canvas.
  // Put the band back in the flow and this fails.
  const canvasLossPx = fittingCanvas.height - canvas.height;
  const barGrowthPx = bar.height - fittingBar.height;
  expect(canvasLossPx).toBeLessThan(band.height);
  expect(canvasLossPx - barGrowthPx).toBeCloseTo(0, 0);

  // The scene's top edge does not move at all, which is the half the band could have broken on its
  // own and did not.
  expect(canvas.y).toBeCloseTo(fittingCanvas.y, 0);
  expect(canvas.height).toBeGreaterThan(200);
});

test("the orbit hint rides above the band rather than inside it", async ({
  page,
  seededDesign,
}) => {
  // Both are bottom-anchored overlays on the same box. Pinned independently the 56 px band would be
  // drawn straight through the hint pill, which stands 16 px off the same edge.
  await storeANarrowedRoom(page, seededDesign);
  await openAndSettle(page, seededDesign);

  const hint = await boxOf(page, "scene-hint");
  const band = await boxOf(page, "scene-overflow-warning");

  expect(hint.y + hint.height).toBeLessThanOrEqual(band.y);
});

/**
 * **This case lost half its subject on 2026-09-16, and the half it lost is recorded rather than
 * quietly dropped.**
 *
 * It used to tap a **marked** body and prove two things at once: that the body is still selectable
 * (ADR 0065 decision 1 — it *"stays exactly where it is and stays editable"*) and that the wash in
 * front of it is not a raycast target, in the real scene rather than only in a unit test.
 *
 * Wave 7H made the camera a function of the customer's room. The bodies this document marks stand
 * past the end of wall A, and the preset frames the middle of the room, so **no marked body is on
 * the canvas at any pixel** — a grid of real taps across the whole scene returns
 * `p0, p1, p5, p6, p7, p8, p11, p12, p15, p17, p18, p22, p23, p25` and none of the six marked ones.
 * `MARKED_BODY_TAP` therefore has no correct value; it is struck rather than re-measured.
 *
 * **The owner ruled this accepted on 2026-09-16**: the band is what tells the customer, the body is
 * still editable through the rail, and being unreachable at this preset without dragging does not
 * violate ADR 0065 decision 1. **So what is lost here is the browser-level proof that the wash is
 * not a raycast target.** The adapter's own suite still holds that claim; this file no longer adds
 * a running-scene witness to it, and no other spec has picked it up. It returns when a marked body
 * can be framed again — which is the trigger the ruling names.
 *
 * What the case keeps is the rest of its subject, and every part of it still runs: an on-screen
 * body is selectable with the band up, the strip above the sheet is reachable, and dismissing
 * leaves the mark where it was.
 */
test("a body is selectable with the band up, and the strip above the sheet is still reachable", async ({
  page,
  seededDesign,
}) => {
  await storeANarrowedRoom(page, seededDesign);
  await openAndSettle(page, seededDesign);

  // An **unmarked** body, because no marked one is on screen. The seeded sink cabinet, at this
  // file's own re-measured constant.
  await page.tap("canvas", {
    position: await atThisCanvas(page, SINK_CABINET_TAP),
  });
  await page.waitForTimeout(RENDER_SETTLE_MS);
  await expect(page.getByTestId("editor-panel")).toHaveCount(1);

  const selected = await readSelection(page);
  expect(selected.selectionKind).toBe("placement");

  // The strip above the sheet is reachable with the band on screen — the constant at the top of this
  // file, and the reason it is this file's own rather than either existing one.
  await page.tap("canvas", { position: BACKGROUND_ABOVE_SHEET_TAP });
  await page.waitForTimeout(RENDER_SETTLE_MS);
  await expect(page.getByTestId("editor-panel")).toHaveCount(0);

  // Deselecting clears the outline and leaves the mark: the body did not fit before it was selected
  // and does not fit after.
  await expect(page.getByTestId("scene-overflow-warning")).toBeVisible();
});
