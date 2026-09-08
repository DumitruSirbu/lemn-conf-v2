import { freeColourFinish, paletteFinish } from "@lemnaria/configurator-domain";
import type { Finish } from "@lemnaria/configurator-domain";
import {
  CAMERA_PRESETS,
  SELECTION_HIGHLIGHT_COLOR,
  SELECTION_OUTLINE_CASING_COLOR,
} from "@lemnaria/three-adapter";
import { expect, test, type Page } from "@playwright/test";

import { deleteMintedDesigns } from "./support/minted-designs";
import { readSelection } from "./support/panel";
import {
  capturePatch,
  countChangedPixels,
  countPixelsIn,
  toRgb,
  type CapturedPatch,
  type PixelRect,
} from "./support/pixels";

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
 * - **How much of the mark counter's margin a walnut kitchen actually spends.** 6V records that
 *   `veneer.nuc` measures 0, 0 and 3 pixels past `MARK_MIN_RED_EXCESS`, and files that as the
 *   model's 137 being an upper bound the renderer does not reach. It is nearer than that reads: the
 *   wood puts tens of thousands of pixels within five units of the threshold, where the fixture the
 *   shipped mark gate runs on puts a handful. Recorded as an assertion so the day tone mapping,
 *   the lighting or a decor moves that population across 50, the tree says so.
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
const SINK_CABINET_FULL_WIDTH = { x: 700, y: 610 };
const FAR_BASE_CABINET = { x: 680, y: 650 };
const SINK_PATCH: PixelRect = { x: 420, y: 468, width: 180, height: 240 };

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

/** Measured 2026-09-07 at 1440 x 900: 1 923 near-black pixels in the sink patch with the sink
 *  cabinet selected on a kitchen painted `#ff2d2d`, and **0** with a different body selected. The
 *  floor is half the measurement; the ceiling is the same slack every other absence here uses. */
const MIN_CASING_PIXELS = 900;
const MAX_ABSENT_CASING_PIXELS = 10;

const MARK_MIN_RED_EXCESS = 50;
/** `overflow-mark.e2e.spec.ts`'s own slack, so this file judges the wood by the shipped threshold. */
const MAX_ABSENT_MARK_PIXELS = 40;

/**
 * Five units inside the mark's threshold, which is where the walnut kitchen's red excess piles up.
 *
 * Measured over the whole canvas on 2026-09-07: **52 808 / 28 681 / 22 295** pixels in the overview,
 * wall A and wall B presets against **16** on the unpainted seeded design in the overview. The
 * brightest single pixel reaches 49, 47 and 50 — the wood misses the counter by one unit, not by the
 * margin `0, 0 and 3` suggests.
 */
const NEAR_MARK_RED_EXCESS = 45;
const MIN_WALNUT_NEAR_MARK_PIXELS = 10_000;
const MAX_UNPAINTED_NEAR_MARK_PIXELS = 100;

const MARK = { kind: "redTint", minExcess: MARK_MIN_RED_EXCESS } as const;
const NEAR_MARK = {
  kind: "redTint",
  minExcess: NEAR_MARK_RED_EXCESS,
} as const;

const MDF = "material.painted-mdf";
const VENEER = "material.veneer";

const mintedDesignIds: string[] = [];

test.afterAll(async () => {
  await deleteMintedDesigns(mintedDesignIds);
});

interface StoredDesign {
  readonly id: string;
  readonly revision: string;
}

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

/** Repaints the stored seeded kitchen in one finish on one material, built from the document the
 *  API returned rather than from a literal, and returns the finishes the saved document then wears
 *  so the fixture property is read off the document instead of assumed. */
async function storeAKitchenWearing(
  page: Page,
  stored: StoredDesign,
  wearing: { readonly materialTierId: string; readonly finish: Finish },
): Promise<{ readonly placements: number; readonly finishes: string[] }> {
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
        settings: { ...design.settings, materialTierId: target.materialTierId },
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
  return { placements: result.placements, finishes: result.finishes };
}

/** The fixture property every colour-keyed count below rests on, asserted rather than argued
 *  (wave 6V work item 3): the whole kitchen wears one known finish, and it is not vacuous. */
function expectTheWholeKitchenWears(
  stored: { readonly placements: number; readonly finishes: string[] },
  finish: Finish,
): void {
  expect(stored.placements).toBeGreaterThan(0);
  expect(stored.finishes).toEqual([JSON.stringify(finish)]);
}

async function openAndSettle(page: Page, designId: string): Promise<void> {
  await page.goto(`/d/${designId}`);
  await page.waitForSelector("canvas", { state: "attached" });
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
}) => {
  const finish = freeColourFinish("#ff2d2d");
  const stored = await mintDesign(page);
  expectTheWholeKitchenWears(
    await storeAKitchenWearing(page, stored, {
      materialTierId: MDF,
      finish,
    }),
    finish,
  );
  await openAndSettle(page, stored.id);

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
 * **What the walnut margin really is.**
 *
 * ADR 0091 decision 4b pins `veneer.nuc` at a red excess of 137 in the model, and wave 6V records
 * that the render reaches 0, 0 and 3 counted pixels past 50 — filing the wood as a case that does
 * not exist on screen. Both halves are reproduced independently; what neither records is how close
 * it comes. Five units below the threshold the wood puts a fifth of the canvas past the counter,
 * against sixteen pixels on the design the shipped mark gate actually photographs.
 *
 * So the gate is sound where it runs and the criterion 6V could not discharge really is
 * unsatisfiable *today* — but it is unsatisfiable by one unit of red excess, and that is the fact
 * worth being able to fail on.
 */
test("a walnut kitchen misses the mark counter by one unit rather than by the model's margin", async ({
  page,
}) => {
  const finish = paletteFinish("veneer.nuc");
  const stored = await mintDesign(page);
  expectTheWholeKitchenWears(
    await storeAKitchenWearing(page, stored, {
      materialTierId: VENEER,
      finish,
    }),
    finish,
  );
  await openAndSettle(page, stored.id);

  // Nothing is selected, so no outline is on screen: the outline's own red clears the mark's
  // threshold by 210 and would be counted as a wash.
  expect((await readSelection(page)).selectionId).toBe("");

  const presetButtons = page.locator('[role="group"] button');
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
      await countPixelsIn(page, scene, NEAR_MARK),
      `${preset.id}: how much of the margin the wood spends`,
    ).toBeGreaterThanOrEqual(MIN_WALNUT_NEAR_MARK_PIXELS);
  }
});

/** The control for the test above, and the reason the shipped mark gate is not living on that same
 *  one unit: the design it photographs leaves the whole five-unit band essentially empty. */
test("the design the mark gate photographs leaves that band empty", async ({
  page,
}) => {
  await page.goto("/configurator/configure");
  await page.waitForSelector("canvas", { state: "attached" });
  await page.waitForTimeout(SCENE_SETTLE_MS);
  expect((await readSelection(page)).selectionId).toBe("");

  const scene = await wholeCanvas(page);
  expect(await countPixelsIn(page, scene, MARK)).toBeLessThanOrEqual(
    MAX_ABSENT_MARK_PIXELS,
  );
  expect(await countPixelsIn(page, scene, NEAR_MARK)).toBeLessThanOrEqual(
    MAX_UNPAINTED_NEAR_MARK_PIXELS,
  );
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
}) => {
  await page.goto("/configurator/configure");
  await page.waitForSelector("canvas", { state: "attached" });
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
