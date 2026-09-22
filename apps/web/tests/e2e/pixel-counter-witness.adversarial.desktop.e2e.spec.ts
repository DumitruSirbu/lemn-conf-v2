import {
  freeColourFinish,
  materialById,
  paletteFinish,
} from "@lemnaria/configurator-domain";
import type { Finish } from "@lemnaria/configurator-domain";
import {
  CAMERA_PRESETS,
  SELECTION_HIGHLIGHT_COLOR,
  SELECTION_OUTLINE_CASING_COLOR,
} from "@lemnaria/three-adapter";
import { expect, type Page } from "@playwright/test";

import {
  FAR_BASE_CABINET,
  SINK_CABINET_FULL_WIDTH,
  SINK_PATCH,
} from "./support/desktop-scene-points";
import { readSelection } from "./support/panel";
import {
  MARK_MIN_RED_EXCESS_OVER_ANY_FINISH,
  capturePatch,
  countChangedPixels,
  countPixelsIn,
  toRgb,
  type CapturedPatch,
} from "./support/pixels";
import {
  openSeededDesign,
  test,
  type SeededDesign,
} from "./support/seeded-design";

/**
 * **Adversarial QA against wave 6V**, and it exists because two of that wave's claims are true only
 * about things it did not measure.
 *
 * 6V's own evidence file (`pixel-counter-witness.desktop.e2e.spec.ts`) shows the differencing
 * counter surviving fronts that break the retired ones, and that reproduces exactly. What it does
 * not show is either of the following, both of which this file measures on the running app:
 *
 * - **The casing pass reaches the framebuffer.** Work item 1's remedy is a second, near-black
 *   outline pass, and its acceptance criterion asks for an outline *distinguishable from a front
 *   painted the highlight's own colour* in a captured render. `selection-outline.test.ts` proves
 *   the two constants are 242.5 apart in the model; the differencing counter proves *something*
 *   changed. Neither says the near-black is on screen — the outline is expanded 3 mm past the body
 *   and crosses onto neighbours and background, so a red-only outline over a red front would still
 *   difference by roughly the same count. Measured here directly and separately.
 * - **Whether the mark counter's threshold survives the woods.** 6V records that `veneer.nuc`
 *   measures 0, 0 and 3 pixels past a threshold of 50 and files ADR 0091 finding 5's model bound of
 *   137 as one the renderer does not reach. **Both readings were of the wrong document**: the
 *   fixture wrote a per-placement finish and no kitchen colour, so under ADR 0099 Amendment B its
 *   structural bodies followed `material.veneer`'s declared default and it was **oak** on screen.
 *   Measured properly, oak reaches a red excess of 76 and puts 194 041 / 193 783 / 278 066 pixels
 *   past 50 with no mark anywhere on it, against a ceiling of 40. A counter that may meet a wood now
 *   clears `MARK_MIN_RED_EXCESS_OVER_ANY_FINISH` (`support/pixels.ts`), and this file photographs the
 *   wood that was never photographed and holds it there.
 *
 * Every design minted here is deleted afterwards (ADR 0006).
 */

/** `editor-rail.desktop.e2e.spec.ts`'s taps and patch, deliberately not re-derived: this file is a
 *  third reading of the same rectangle and a patch of its own would measure a different thing.
 *
 *  **Copied across on 2026-09-08**, when the top-bar ruling took the canvas to y 121, 1440 × 779 and
 *  those taps were re-measured against the running app. Both were re-confirmed on a repainted
 *  document reached through `/d/{id}`, which is the route this file drives — five clicks each,
 *  right body 5/5. The patch is unchanged and still contains `p0`'s own region (page x 432–592,
 *  y 479–706). */

const SCENE_SETTLE_MS = 2500;
const RENDER_SETTLE_MS = 400;

/** `editor-rail.desktop.e2e.spec.ts`'s measured floor and its slack over a measured zero. */
const NOISE_FLOOR = 8;
const MAX_UNCHANGED_PIXELS = 10;

/**
 * The casing counted by nearness to its own constant, at a third of the ball the selection counter
 * uses. Narrow deliberately: `pal.antracit` (`#2b2d30`) is 50.9 from this constant, so a 60-unit
 * ball would be breached by a decor the product ships. At 40 the only thing in the patch that
 * satisfies it is the pass itself, which the control reading below demonstrates rather than assumes.
 */
const CASING_TOLERANCE = 40;
const CASING = {
  kind: "near",
  color: toRgb(SELECTION_OUTLINE_CASING_COLOR),
  tolerance: CASING_TOLERANCE,
} as const;

/** Re-measured 2026-09-11 at 1440 x 900: **616** near-black pixels in the sink patch with the sink
 *  cabinet selected on a kitchen painted `#ff2d2d`, and **0** with a different body selected. The
 *  floor is half the measurement; the ceiling is the same slack every other absence here uses.
 *
 *  **Why it moved from 1 923.** ADR 0107 decision 5 halved the highlight on the owner's ruling, and
 *  the casing is a *sum* — `SELECTION_OUTLINE_WIDTH_PX + 2` — so the near-black rim visible either
 *  side of the core went from 2 px to 1 px. The count fell by more than the half that implies
 *  (3.1x, not 2x) because at a 1 px rim anti-aliasing blends most of the edge toward the front's own
 *  colour, and a blended sample leaves the tolerance ball. **The rim is now at its resolution floor**:
 *  it still reaches the framebuffer, deterministically and at 616 px on two consecutive runs, but a
 *  further thinning has no pixels left to give.
 *
 *  **The sum form did not protect the rim here, and this comment should not be read as claiming it
 *  did.** `SELECTION_OUTLINE_CASING_WIDTH_PX` adds a constant rather than scaling by a ratio so that
 *  the rim survives a change to the core — but `378776a` moved the addend too, 4 → 2, so the rim
 *  halved with everything else. `selection-outline.ts` states the intended discipline: if the owner
 *  asks for thinner again, **the core is what moves and the addend stays at 2**. Under that
 *  discipline the rim holds; it was departed from once, and this floor is the consequence.
 *
 *  The floor is re-measured rather than lowered until it passes. It still discriminates by a wide
 *  margin: see `MAX_ABSENT_CASING_PIXELS` below for what else in the scene is near-black and by how
 *  much this floor still clears it. */
const MIN_CASING_PIXELS = 300;

/**
 * **What may read near-black in this patch when nothing is selected.**
 *
 * **This constant's premise changed on 2026-09-16 and the number followed it.** It used to say *the
 * casing pass is the only near-black source in the patch*, with 10 as slack over a control measured
 * at **0**. That was exactly true until M7 wave 7H made the camera a function of the customer's
 * room; the scene re-framed, and a deliberately black strip came into the patch.
 *
 * **What it is, identified rather than tolerated.** `bowl_edge_back` — `kitchen-parts.ts:1455`, in
 * the `"sink-faucet"` builder — a 558 x 12 x 2 mm box of `M.shadowGap` seated at y = -0.024 under
 * `sink_rim_back`, whose own comment calls it the *"inner shadow line right under the rim"*. It is
 * authored black on purpose and is **not** a defect: no seam, no z-fighting, nothing to fix in
 * geometry. It reads as 14 pixels on one 1 px diagonal, and it cannot be excluded by moving the
 * box — it sits inside `p0`'s highlight, which is what the patch exists to contain.
 *
 * **Two palette members fall inside `CASING_TOLERANCE`, and both are named because the second is a
 * near miss rather than an absence.** Swept over all 14 of `kitchen-parts.ts`'s declared materials,
 * measured from `SELECTION_OUTLINE_CASING_COLOR` (`#101010`):
 *
 * - `M.shadowGap` `#16181a`, distance **14.1** — the sink rim strips, `drain_hole`, and the
 *   corner-return carcasses' `front_liner`. This is the one in the patch today.
 * - `M.glassDark` `#15171a`, distance **13.2** — smoked glass, which is the **hob top**. It sits
 *   just *outside* this patch's right edge today. A camera change that brings it in would add far
 *   more than 14, and the next reader needs to know it was a near miss.
 *
 * The third-nearest is `M.dark` (graphite, `#3a3d40`) at **78**, comfortably outside the 40-ball, so
 * nothing else in the palette can enter without a new material.
 *
 * **Why 50 and not 15.** The count is anti-aliasing-sensitive: the visible line is about 73 px long
 * and only 14 samples currently clear the ball, so another GPU or driver moves it by several either
 * way. A ceiling of 15 would be calibrated to one machine. **The gate keeps its teeth regardless:**
 * `MIN_CASING_PIXELS` is 300 against a control of 14, which is **~21x separation**, so deleting the
 * casing pass still fails this spec by a wide margin. That ratio is what justifies the slack, not
 * the observation.
 */
const MAX_ABSENT_CASING_PIXELS = 50;

/** `overflow-mark.e2e.spec.ts`'s own slack for an absence, reused so the two files agree on what
 *  counts as "no mark on screen". **The slack is shared; the threshold is not** — that gate counts a
 *  white kitchen at 50 and this file counts woods at 80, for the reason `support/pixels.ts` records. */
const MAX_ABSENT_MARK_PIXELS = 40;

/**
 * **The threshold this file's own measurement retired**, kept so the reason 80 exists stays
 * falsifiable rather than becoming a number in a comment.
 *
 * An unmarked oak kitchen — the veneer tier's declared default, and so the wood a customer reaches
 * by choosing the tier and nothing else — puts 194 041 / 193 783 / 278 066 pixels past this in the
 * three camera presets. Nearly all of them are ordinary door fronts, untouched by any recent change.
 */
const RETIRED_MARK_MIN_RED_EXCESS = 50;
const MIN_OAK_RETIRED_MARK_PIXELS = 100_000;

const MARK = {
  kind: "redTint",
  minExcess: MARK_MIN_RED_EXCESS_OVER_ANY_FINISH,
} as const;
const RETIRED_MARK = {
  kind: "redTint",
  minExcess: RETIRED_MARK_MIN_RED_EXCESS,
} as const;

const MDF = "material.painted-mdf";
const VENEER = "material.veneer";

/**
 * **The two woods and where each one's red excess actually stops**, which is what turns "under the
 * threshold" from a pass into a separation.
 *
 * Each `ceilingRedExcess` is a **dense edge measured on the running app**, not a bound argued from
 * the palette: the wood piles tens of thousands of pixels at exactly that value and none above its
 * own maximum. Counting at the edge and again at the threshold brackets the wood's ceiling
 * from both sides — a lighting or tone-mapping change that pushes the wood up fails the first
 * assertion, and one that stops rendering it warm at all fails the second. A single "under 80"
 * assertion would pass on a kitchen that had gone grey.
 *
 * Measured 2026-09-09 at 1440 × 900, whole canvas, nothing selected, no mark on the document:
 *
 * | wood   | max excess | pixels at its edge |
 * | ------ | ---------- | ------------------ |
 * | oak    |         76 | 51 841 at 72       |
 * | walnut |         51 | 27 879 at 45       |
 */
const UNMARKED_WOODS = [
  {
    name: "oak, the veneer tier's own declared default",
    finish: materialById(VENEER).defaultFinish,
    ceilingRedExcess: 72,
  },
  {
    name: "walnut",
    finish: paletteFinish("veneer.nuc"),
    ceilingRedExcess: 45,
  },
] as const;

/** Under half of the smaller of the two piles above, so a camera or tone-mapping nudge has room to
 *  move the population without either hiding a regression or passing on stray warm pixels. */
const MIN_WOOD_CEILING_PIXELS = 10_000;
/** The unpainted seeded design reads **16** at the lower of the two edges. */
const MAX_UNPAINTED_CEILING_PIXELS = 100;

/**
 * Repaints the stored seeded kitchen in one finish on one material, built from the document the
 * API returned rather than from a literal, and returns what the saved document then wears so the
 * fixture property is read off the document instead of assumed.
 *
 * **It writes the colour at both levels, and neither half is redundant** (ADR 0099, Amendment B).
 * A cabinet that *chooses its own colour* reads `placement.body.finish` first; a structural body
 * **follows the kitchen**, and `drawnFinishOf` deliberately ignores `placement.body.finish` for it,
 * because such a body has no control the customer could have used. So a document carrying only the
 * per-placement half paints the fronts and leaves every structural body on the material's declared
 * default — measured on this fixture: `material.veneer` defaults to `veneer.stejar`, so a "walnut
 * kitchen" written that way rendered four oak bodies, and it was oak that breached the mark
 * counter here. `settings.finish` is what makes the whole kitchen one colour; `body.finish` is what
 * makes the fronts follow it. **Delete either and the document stops saying what the case's name
 * claims.**
 */
async function storeAKitchenWearing(
  page: Page,
  stored: SeededDesign,
  wearing: { readonly materialTierId: string; readonly finish: Finish },
): Promise<StoredKitchenColour> {
  const result = await page.evaluate(
    async (target: {
      id: string;
      revision: string;
      materialTierId: string;
      finish: Finish;
    }) => {
      const loaded = await fetch(`/api/designs/${target.id}`);
      const { design } = (await loaded.json()) as {
        design: {
          settings?: Record<string, unknown>;
          placements: { body: Record<string, unknown> }[];
        };
      };
      const painted = {
        ...design,
        settings: {
          ...design.settings,
          materialTierId: target.materialTierId,
          finish: target.finish,
        },
        placements: design.placements.map((placement) => ({
          ...placement,
          body: { ...placement.body, finish: target.finish },
        })),
      };
      const saved = await fetch(`/api/designs/${target.id}`, {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-expected-revision": target.revision,
        },
        body: JSON.stringify(painted),
      });
      return {
        status: saved.status,
        placements: painted.placements.length,
        kitchenFinish: JSON.stringify(painted.settings.finish),
        finishes: [
          ...new Set(
            painted.placements.map((placement) =>
              JSON.stringify(placement.body.finish),
            ),
          ),
        ],
      };
    },
    { ...stored, ...wearing },
  );

  expect(result.status).toBe(200);
  return {
    placements: result.placements,
    kitchenFinish: result.kitchenFinish,
    finishes: result.finishes,
  };
}

/** What the repainted document says about colour, at both of the levels `drawnFinishOf` reads. */
interface StoredKitchenColour {
  readonly placements: number;
  readonly kitchenFinish: string;
  readonly finishes: string[];
}

/** The fixture property every colour-keyed count below rests on, asserted rather than argued
 *  (wave 6V work item 3): the whole kitchen wears one known finish, and it is not vacuous.
 *
 *  **Both levels, because a body that follows the kitchen reads only one of them.** Asserting the
 *  per-placement half alone is what let a "walnut kitchen" pass this guard with four oak bodies in
 *  it — see `storeAKitchenWearing`. */
function expectTheWholeKitchenWears(
  stored: StoredKitchenColour,
  finish: Finish,
): void {
  expect(stored.placements).toBeGreaterThan(0);
  expect(stored.kitchenFinish).toBe(JSON.stringify(finish));
  expect(stored.finishes).toEqual([JSON.stringify(finish)]);
}

async function openAndSettle(page: Page, design: SeededDesign): Promise<void> {
  await openSeededDesign(page, design);
  await expect(async () => {
    expect((await readSelection(page)).probe).toBe("on");
  }).toPass({ timeout: 15_000 });
  await page.waitForTimeout(SCENE_SETTLE_MS);
}

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
  }).toPass({ timeout: 5000 });
}

async function wholeCanvas(page: Page): Promise<CapturedPatch> {
  const box = await page.locator("canvas").boundingBox();
  if (!box) throw new Error("the scene canvas has no layout box");
  return capturePatch(page, {
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.round(box.width),
    height: Math.round(box.height),
  });
}

/**
 * **Work item 1's product claim, measured on the screen rather than in the constants.**
 *
 * The front and the outline's core are the same declared colour here, so the only thing in the sink
 * patch that can read near-black is the casing pass. The control capture — the same patch, the same
 * document, a different body selected — is what turns that from an argument into a measurement: it
 * reads 0, so the count with the body selected is the pass and nothing else.
 *
 * This is the assertion the differencing counter cannot make. `buildSelectionOutline` expands the
 * traced edges 3 mm past the body, so an outline drawn *only* in the highlight's colour still
 * crosses onto neighbours and background and still differences by five figures against the
 * unselected capture — 10 104 measured on this very fixture. A wave that kept only that count would
 * stay green with the casing pass deleted, which is the half of item 1 nothing else asserts.
 */
test("the near-black casing pass reaches the framebuffer on a front painted the highlight's own colour", async ({
  page,
  seededDesign,
}) => {
  const finish = freeColourFinish("#ff2d2d");
  expectTheWholeKitchenWears(
    await storeAKitchenWearing(page, seededDesign, {
      materialTierId: MDF,
      finish,
    }),
    finish,
  );
  await openAndSettle(page, seededDesign);

  await clickScene(page, SINK_CABINET_FULL_WIDTH);
  await selectInRail(page, "p0");
  const whileSelected = await capturePatch(page, SINK_PATCH);

  await clickScene(page, FAR_BASE_CABINET);
  await selectInRail(page, "p2");
  const whileAnotherSelected = await capturePatch(page, SINK_PATCH);

  expect(
    await countPixelsIn(page, whileAnotherSelected, CASING),
    "the unselected control: nothing on a #ff2d2d kitchen reads near-black",
  ).toBeLessThanOrEqual(MAX_ABSENT_CASING_PIXELS);
  expect(
    await countPixelsIn(page, whileSelected, CASING),
    "the casing pass, on a front wearing the core's own colour",
  ).toBeGreaterThanOrEqual(MIN_CASING_PIXELS);

  // And the two passes really are the pair `selection-outline.ts` claims: the front is one colour
  // and it cannot be both of them. Asserted on the constants the render was built from, beside the
  // pixels, rather than left to a package a viewport away.
  expect(SELECTION_OUTLINE_CASING_COLOR).not.toBe(SELECTION_HIGHLIGHT_COLOR);
  const casing = toRgb(SELECTION_OUTLINE_CASING_COLOR);
  const worn = [0xff, 0x2d, 0x2d] as const;
  const distanceFromTheFrontToTheCasing = Math.hypot(
    worn[0] - casing[0],
    worn[1] - casing[1],
    worn[2] - casing[2],
  );
  expect(distanceFromTheFrontToTheCasing).toBeGreaterThan(CASING_TOLERANCE);
});

/**
 * **Where each wood's red excess really stops, against the threshold that has to clear it.**
 *
 * ADR 0091 decision 4b pins the tinted woods at a red excess of 137 in the model, and wave 6V filed
 * that as an upper bound the renderer does not reach, on the strength of a walnut kitchen measuring
 * 0, 0 and 3 past a threshold of 50. The threshold has moved to 80 because that reading was of a
 * document that wrote no kitchen colour and therefore rendered oak; both woods are photographed here
 * on documents that say what their names claim, and each is bracketed rather than merely passed.
 */
for (const wood of UNMARKED_WOODS) {
  test(`an unmarked kitchen in ${wood.name} stays under the mark counter in every preset`, async ({
    page,
    seededDesign,
  }) => {
    expectTheWholeKitchenWears(
      await storeAKitchenWearing(page, seededDesign, {
        materialTierId: VENEER,
        finish: wood.finish,
      }),
      wood.finish,
    );
    await openAndSettle(page, seededDesign);

    // Nothing is selected, so no outline is on screen: the outline's own red clears the mark's
    // threshold by 130 and would be counted as a wash.
    expect((await readSelection(page)).selectionId).toBe("");

    const presetButtons = page.locator('[role="group"] button');
    const ceiling = {
      kind: "redTint",
      minExcess: wood.ceilingRedExcess,
    } as const;
    for (const [index, preset] of CAMERA_PRESETS.entries()) {
      if (index > 0) {
        await presetButtons.nth(index).click();
        await page.waitForTimeout(SCENE_SETTLE_MS);
      }
      const scene = await wholeCanvas(page);

      expect(
        await countPixelsIn(page, scene, MARK),
        `${preset.id}: the wood does not clear the mark's threshold`,
      ).toBeLessThanOrEqual(MAX_ABSENT_MARK_PIXELS);
      expect(
        await countPixelsIn(page, scene, ceiling),
        `${preset.id}: the wood is still rendered warm right up to its own edge`,
      ).toBeGreaterThanOrEqual(MIN_WOOD_CEILING_PIXELS);
    }
  });
}

/**
 * **The measurement that retired the threshold of 50, kept as a measurement.**
 *
 * Oak is what a customer gets by choosing the veneer tier and nothing else, and until this file was
 * fixed nothing had ever photographed it: the shipped mark gate asserts `expectNoPlacementWearsAFinish`,
 * so its bodies fall back to melamine's white at a red excess of about 0, and the adversarial case
 * beside it photographed the one wood that happened to sit just under the old line. On oak the
 * retired counter reports a mark over a fifth of the canvas on a document with no mark anywhere on
 * it — six figures against a ceiling of 40.
 *
 * Both counts are taken from **the same captures**, which is what makes this a statement about the
 * threshold rather than about two renders: the identical pixels are a wash at 50 and are silent at
 * 80.
 */
test("the retired threshold of 50 reports a mark on an unmarked oak kitchen, and 80 does not", async ({
  page,
  seededDesign,
}) => {
  const finish = materialById(VENEER).defaultFinish;
  expectTheWholeKitchenWears(
    await storeAKitchenWearing(page, seededDesign, {
      materialTierId: VENEER,
      finish,
    }),
    finish,
  );
  await openAndSettle(page, seededDesign);
  expect((await readSelection(page)).selectionId).toBe("");

  const presetButtons = page.locator('[role="group"] button');
  for (const [index, preset] of CAMERA_PRESETS.entries()) {
    if (index > 0) {
      await presetButtons.nth(index).click();
      await page.waitForTimeout(SCENE_SETTLE_MS);
    }
    const scene = await wholeCanvas(page);

    expect(
      await countPixelsIn(page, scene, RETIRED_MARK),
      `${preset.id}: what a threshold of 50 reports on an unmarked oak kitchen`,
    ).toBeGreaterThanOrEqual(MIN_OAK_RETIRED_MARK_PIXELS);
    expect(
      await countPixelsIn(page, scene, MARK),
      `${preset.id}: what the shipped threshold reports on the same pixels`,
    ).toBeLessThanOrEqual(MAX_ABSENT_MARK_PIXELS);
  }
});

/** The control for the cases above: the design the shipped mark gate photographs is not merely
 *  under the threshold, it is nowhere near either wood's edge — so that gate is not living on a
 *  margin the way the adversarial reading of 50 suggested. */
test("the design the mark gate photographs leaves both woods' bands empty", async ({
  page,
  seededDesign,
}) => {
  await openSeededDesign(page, seededDesign);
  await page.waitForTimeout(SCENE_SETTLE_MS);
  expect((await readSelection(page)).selectionId).toBe("");

  const scene = await wholeCanvas(page);
  expect(await countPixelsIn(page, scene, MARK)).toBeLessThanOrEqual(
    MAX_ABSENT_MARK_PIXELS,
  );
  for (const wood of UNMARKED_WOODS) {
    expect(
      await countPixelsIn(page, scene, {
        kind: "redTint",
        minExcess: wood.ceilingRedExcess,
      }),
      `the seeded design at ${wood.name}'s own edge`,
    ).toBeLessThanOrEqual(MAX_UNPAINTED_CEILING_PIXELS);
  }
});

/**
 * **The noise floor's one measured non-zero, pinned rather than left to be rediscovered.**
 *
 * 6V records the floor as slack over a measured zero, in every camera preset, over both patches and
 * the whole canvas, immediately, after 1 200 ms and under a hover. Re-measured independently, all of
 * those still read 0 at a floor of 0 — and one state does not: a camera preset switched away and
 * back leaves **85** pixels of the canvas different at a floor of 0. Every one of them moves by less
 * than 4, so the declared floor of 8 absorbs the lot, which is what this asserts. No spec
 * differences across a preset change today; this is the assertion that notices if the drift grows.
 */
test("a camera preset round-trip leaves the canvas unchanged at the declared noise floor", async ({
  page,
  seededDesign,
}) => {
  await openSeededDesign(page, seededDesign);
  await page.waitForTimeout(SCENE_SETTLE_MS);

  const before = await wholeCanvas(page);
  const presetButtons = page.locator('[role="group"] button');
  expect(await presetButtons.count()).toBe(CAMERA_PRESETS.length);

  await presetButtons.nth(1).click();
  await page.waitForTimeout(SCENE_SETTLE_MS);
  await presetButtons.nth(0).click();
  await page.waitForTimeout(SCENE_SETTLE_MS);
  await expect(presetButtons.nth(0)).toHaveAttribute("aria-pressed", "true");

  const after = await wholeCanvas(page);
  expect(
    await countChangedPixels(page, before, after, NOISE_FLOOR),
  ).toBeLessThanOrEqual(MAX_UNCHANGED_PIXELS);
});
