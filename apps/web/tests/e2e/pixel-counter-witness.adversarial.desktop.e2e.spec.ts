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

const SCENE_SETTLE_MS = 2500;
const RENDER_SETTLE_MS = 400;

/** `editor-rail.desktop.e2e.spec.ts`'s measured floor and its slack over a measured zero. */
const NOISE_FLOOR = 8;
const MAX_UNCHANGED_PIXELS = 10;

/** The casing counted by nearness to its own constant, at a third of the selection counter's ball: `pal.antracit`
 *  (`#2b2d30`) is 50.9 away, so a 60-unit ball would be breached by a decor the product ships. */
const CASING_TOLERANCE = 40;
const CASING = {
  kind: "near",
  color: toRgb(SELECTION_OUTLINE_CASING_COLOR),
  tolerance: CASING_TOLERANCE,
} as const;

/** Measured at 1440 x 900: 616 near-black pixels in the sink patch with the sink cabinet selected on a `#ff2d2d`
 *  kitchen, 0 with another body selected. The floor is half the measurement. The rim is at its 1 px resolution floor
 *  since the highlight was halved (ADR 0107 decision 5), so a thinner outline moves the core and not the casing's
 *  addend (`selection-outline.ts`). */
const MIN_CASING_PIXELS = 300;

/**
 * What may read near-black in this patch with nothing selected: `bowl_edge_back`, a deliberately black `M.shadowGap`
 * strip (about 14 pixels on one 1 px diagonal) inside `p0`'s highlight, which moving the box cannot exclude.
 * `M.glassDark` (the hob top, distance 13.2 from the casing) sits just outside the patch's right edge: a camera change
 * bringing it in adds far more than 14. 50 and not 15 because the count is anti-aliasing-sensitive; `MIN_CASING_PIXELS`
 * is 300 against that control, about 21x apart, so deleting the casing pass still fails by a wide margin.
 */
const MAX_ABSENT_CASING_PIXELS = 50;

/** `overflow-mark.e2e.spec.ts`'s slack for an absence, shared so the two files agree on what "no mark on screen"
 *  means. The threshold is not shared: see `support/pixels.ts`. */
const MAX_ABSENT_MARK_PIXELS = 40;

/** The retired threshold, kept so the reason 80 exists stays falsifiable: an unmarked oak kitchen (the veneer tier's
 *  declared default) puts six figures of pixels past it in each camera preset, nearly all ordinary door fronts. */
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
 * The two woods and where each one's red excess stops, so "under the threshold" is a separation. Each
 * `ceilingRedExcess` is a dense edge measured on the running app (oak max 76, 51 841 pixels at 72; walnut max 51,
 * 27 879 at 45). Counting at the edge and at the threshold brackets the wood: a tone-mapping change that pushes it up
 * fails the first, one that stops rendering it warm fails the second. One "under 80" would pass on a grey kitchen.
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

/** Under half of the smaller pile above, so a camera or tone-mapping nudge has room to move the population without
 *  hiding a regression. */
const MIN_WOOD_CEILING_PIXELS = 10_000;
/** The unpainted seeded design reads 16 at the lower of the two edges. */
const MAX_UNPAINTED_CEILING_PIXELS = 100;

/**
 * Repaints the stored seeded kitchen in one finish on one material, from the document the API returned, and returns
 * what the saved document then wears. It writes the colour at both levels (ADR 0099 Amendment B): a structural body
 * follows `settings.finish` and `drawnFinishOf` ignores `placement.body.finish` for it, so one level alone leaves the
 * structural bodies on the material's declared default (oak for veneer).
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

/** The fixture property every colour-keyed count below rests on: the whole kitchen wears one known finish, at both
 *  levels, since a body that follows the kitchen reads only one of them (see `storeAKitchenWearing`). */
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
 * The front and the outline's core are the same colour here, so only the casing pass can read near-black in the sink
 * patch; the control capture (another body selected) reads 0. The differencing counter cannot assert this: an outline
 * drawn only in the highlight's colour still crosses onto neighbours and background and differences by five figures.
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

  // The front is one colour and cannot be both passes; asserted on the constants the render was built from.
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
 * Where each wood's red excess stops, against the threshold that has to clear it (ADR 0091 models 137, which the
 * renderer does not reach). Both woods are photographed on documents that say what their names claim, each bracketed.
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

    // Nothing is selected: the outline's own red clears the mark's threshold by 130 and would be counted as a wash.
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
 * Oak is what the veneer tier gives by default and had never been photographed: the retired 50 counter reports a mark
 * over a fifth of the canvas on a document with none. Both counts come from the same captures, so this is a statement
 * about the threshold: a wash at 50, silent at 80.
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

/** The control for the cases above: the design the shipped mark gate photographs is nowhere near either wood's edge,
 *  so that gate lives on no margin. */
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
 * The noise floor's one measured non-zero: a preset switched away and back leaves 85 pixels different at a floor of
 * 0, each by less than 4, so the declared floor of 8 absorbs them. This notices if the drift grows.
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
