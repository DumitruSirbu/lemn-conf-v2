import {
  NARROWED_ROOM_OVERFLOWING_DESIGN,
  freeColourFinish,
  paletteFinish,
  type Finish,
} from "@lemnaria/configurator-domain";
import {
  CAMERA_PRESETS,
  OVERFLOW_MARK_COLOR,
  SELECTION_HIGHLIGHT_COLOR,
} from "@lemnaria/three-adapter";
import { expect, type Page } from "@playwright/test";

import {
  FAR_BASE_CABINET,
  FRIDGE,
  NARROWED_ROOM,
  SINK_CABINET_FULL_WIDTH,
  SINK_PATCH,
} from "./support/desktop-scene-points";
import {
  MARK_MIN_RED_EXCESS_OVER_ANY_FINISH,
  capturePatch,
  countChangedPixels,
  countPixelsIn,
  toRgb,
  type CapturedPatch,
  type PixelRect,
} from "./support/pixels";
import { readSelection } from "./support/panel";
import {
  openSeededDesign,
  test,
  type SeededDesign,
} from "./support/seeded-design";

/**
 * Each case stores a kitchen painted a colour the seeded design never wears, measures what a retired counter
 * (`near`, `redTint`, `blueTint`) reports with the counted thing not on screen, and measures the differencing
 * counter on the same captures: the seeded design alone never broke the old counters.
 *
 * The fixture writes only `placement.body.finish`; a structural body follows the kitchen's colour (ADR 0099
 * Amendment B), so fronts wear the named finish over structural bodies in `material.veneer`'s default. Oak reaches a
 * red excess of 76, hence the mark threshold of 80 (`support/pixels.ts`). Every design minted here is deleted
 * afterwards (ADR 0006).
 */

/** `p2`'s region on the narrowed-room document, projected identically by both documents; the taps and the sink patch
 *  are `editor-rail.desktop.e2e.spec.ts`'s, so a patch of its own would measure a different thing. */
const MARKED_BODY_PATCH: PixelRect = NARROWED_ROOM.markedBodyPatch;

const SCENE_SETTLE_MS = 2500;
const RENDER_SETTLE_MS = 400;

/** The same floors `editor-rail.desktop.e2e.spec.ts` measured, so the two files cannot disagree on the instrument. */
const NOISE_FLOOR = 8;
const MIN_CHANGED_PIXELS = 3000;
const MAX_UNCHANGED_PIXELS = 10;

/** What a retired counter must report before it is called broken: above the 3 603 `near` reads on the seeded design
 *  when the sink cabinet really is selected, so each witness is a false positive larger than a true one. */
const MIN_WITNESS_PIXELS = 5000;

const HIGHLIGHT = {
  kind: "near",
  color: toRgb(SELECTION_HIGHLIGHT_COLOR),
  tolerance: 60,
} as const;
const VOID_FILL = { kind: "blueTint", minExcess: 25 } as const;
/** Read from `support/pixels.ts`: every document photographed here wears a finish, including two woods. */
const MARK = {
  kind: "redTint",
  minExcess: MARK_MIN_RED_EXCESS_OVER_ANY_FINISH,
} as const;

/** `overflow-mark.e2e.spec.ts`'s own slack for an absence; the slack is shared, the threshold is not (see `MARK`). */
const MAX_ABSENT_MARK_PIXELS = 40;
const MIN_MARK_PIXELS = 2000;

const MDF = "material.painted-mdf";
const VENEER = "material.veneer";

/** The three states of the sink patch, captured with the rail open in all three so canvas size, camera and design
 *  are identical between them. */
interface SinkPatchStates {
  readonly whileSelected: CapturedPatch;
  readonly whileAnotherSelected: CapturedPatch;
  readonly whileAThirdSelected: CapturedPatch;
}

/**
 * Repaints the stored seeded kitchen in one finish on one material and, given a width, narrows wall A under the run
 * standing on it. Returns the ids past the wall's end. `materialTierId` lives in `settings`: `CurrentDesignSchema`
 * is strict, so a sibling key at the top level is a 400, not a save.
 */
async function storeAKitchenWearing(
  page: Page,
  seededDesign: SeededDesign,
  wearing: {
    readonly materialTierId: string;
    readonly finish: Finish;
    readonly roomWidthMm?: number;
  },
): Promise<readonly string[]> {
  const result = await page.evaluate(
    async (target: {
      id: string;
      revision: string;
      materialTierId: string;
      finish: Finish;
      roomWidthMm?: number;
    }) => {
      const loaded = await fetch(`/api/designs/${target.id}`);
      const { design } = (await loaded.json()) as {
        design: {
          room: { widthMm: number; depthMm: number };
          settings?: Record<string, unknown>;
          placements: {
            id: string;
            wall: string;
            alongMm: number;
            body: Record<string, unknown> & { widthMm: number };
          }[];
        };
      };
      const painted = {
        ...design,
        room: {
          ...design.room,
          widthMm: target.roomWidthMm ?? design.room.widthMm,
        },
        settings: { ...design.settings, materialTierId: target.materialTierId },
        placements: design.placements.map((placement) => ({
          ...placement,
          body: { ...placement.body, finish: target.finish },
        })),
      };
      const overflowing = painted.placements
        .filter(
          (placement) =>
            placement.alongMm + placement.body.widthMm / 2 >
            (placement.wall === "A"
              ? painted.room.widthMm
              : painted.room.depthMm),
        )
        .map((placement) => placement.id);

      const saved = await fetch(`/api/designs/${target.id}`, {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-expected-revision": target.revision,
        },
        body: JSON.stringify(painted),
      });
      return { status: saved.status, overflowing };
    },
    { ...seededDesign, ...wearing },
  );

  expect(result.status).toBe(200);
  return result.overflowing;
}

/** The counterpart of `editor-rail.desktop.e2e.spec.ts`'s fixture assertion, negated: this is the
 *  state that file's blue counter is not allowed to be measured in, reached deliberately. */
async function expectEveryPlacementWears(
  page: Page,
  designId: string,
  finish: Finish,
): Promise<void> {
  const worn = await page.evaluate(async (id: string) => {
    const loaded = await fetch(`/api/designs/${id}`);
    const { design } = (await loaded.json()) as {
      design: { placements: { body: { finish?: unknown } }[] };
    };
    return {
      placements: design.placements.length,
      finishes: [
        ...new Set(
          design.placements.map((placement) =>
            JSON.stringify(placement.body.finish),
          ),
        ),
      ],
    };
  }, designId);

  expect(worn.placements).toBeGreaterThan(0);
  expect(worn.finishes).toEqual([JSON.stringify(finish)]);
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

async function changedPixels(
  page: Page,
  before: CapturedPatch,
  after: CapturedPatch,
): Promise<number> {
  return countChangedPixels(page, before, after, NOISE_FLOOR);
}

/**
 * Selects the sink cabinet, then two other bodies, capturing the sink patch in each state. The first tap is
 * full-width and the two after it are rail-open: the same world point is not the same pixel once the rail has taken
 * its 420 px, so the order is fixed.
 */
async function captureSinkPatchStates(page: Page): Promise<SinkPatchStates> {
  await clickScene(page, SINK_CABINET_FULL_WIDTH);
  await selectInRail(page, "p0");
  const whileSelected = await capturePatch(page, SINK_PATCH);

  await clickScene(page, FAR_BASE_CABINET);
  await selectInRail(page, "p2");
  const whileAnotherSelected = await capturePatch(page, SINK_PATCH);

  await clickScene(page, FRIDGE);
  await selectInRail(page, "p7");
  const whileAThirdSelected = await capturePatch(page, SINK_PATCH);

  return { whileSelected, whileAnotherSelected, whileAThirdSelected };
}

/** Moves when this body's selection changes, and does not move between two states that both leave it unselected. */
async function expectTheDifferencingCounterIsUnmoved(
  page: Page,
  states: SinkPatchStates,
): Promise<void> {
  expect(
    await changedPixels(
      page,
      states.whileAnotherSelected,
      states.whileSelected,
    ),
  ).toBeGreaterThanOrEqual(MIN_CHANGED_PIXELS);
  expect(
    await changedPixels(
      page,
      states.whileAnotherSelected,
      states.whileAThirdSelected,
    ),
  ).toBeLessThanOrEqual(MAX_UNCHANGED_PIXELS);
}

/**
 * The outline stays visible against a front painted its own colour: the highlight's exact hex, a near neighbour and
 * one wood. `selection-outline.ts` adds a near-black casing under the red core; this measures it on the running app,
 * where tone mapping, the real materials and the real line widths are involved.
 */
for (const [label, materialTierId, finish] of [
  ["the highlight's own hex", MDF, freeColourFinish("#ff2d2d")],
  ["a near neighbour of it", MDF, freeColourFinish("#cc2222")],
  ["a wood", VENEER, paletteFinish("veneer.nuc")],
] as const) {
  test(`the outline is still counted over a front wearing ${label}`, async ({
    page,
    seededDesign,
  }) => {
    await storeAKitchenWearing(page, seededDesign, { materialTierId, finish });
    await expectEveryPlacementWears(page, seededDesign.id, finish);
    await openAndSettle(page, seededDesign);

    await expectTheDifferencingCounterIsUnmoved(
      page,
      await captureSinkPatchStates(page),
    );
  });
}

test("a front painted the highlight's own colour breaks the colour counter and not the differencing one", async ({
  page,
  seededDesign,
}) => {
  const finish = freeColourFinish("#ff2d2d");
  await storeAKitchenWearing(page, seededDesign, {
    materialTierId: MDF,
    finish,
  });
  await expectEveryPlacementWears(page, seededDesign.id, finish);
  await openAndSettle(page, seededDesign);

  const states = await captureSinkPatchStates(page);

  // The witness: neither state has the sink cabinet selected, yet the retired counter reports a full patch of
  // highlight in both.
  expect(
    await countPixelsIn(page, states.whileAnotherSelected, HIGHLIGHT),
  ).toBeGreaterThanOrEqual(MIN_WITNESS_PIXELS);
  expect(
    await countPixelsIn(page, states.whileAThirdSelected, HIGHLIGHT),
  ).toBeGreaterThanOrEqual(MIN_WITNESS_PIXELS);

  // The same front breaks the mark's counter too, on a document with no mark anywhere on it.
  expect(
    await countPixelsIn(page, states.whileAnotherSelected, MARK),
  ).toBeGreaterThanOrEqual(MIN_WITNESS_PIXELS);

  await expectTheDifferencingCounterIsUnmoved(page, states);
});

test("a blue front breaks the void's fill counter and not the differencing one", async ({
  page,
  seededDesign,
}) => {
  const finish = freeColourFinish("#2d5fff");
  await storeAKitchenWearing(page, seededDesign, {
    materialTierId: MDF,
    finish,
  });
  // The premise `editor-rail.desktop.e2e.spec.ts` asserts before it counts blue, reached from the other side.
  await expectEveryPlacementWears(page, seededDesign.id, finish);
  await openAndSettle(page, seededDesign);

  const states = await captureSinkPatchStates(page);

  // The sink patch is a cabinet's region on a fully occupied kitchen — `KITCHEN_L_DESIGN` has no
  // opening in it and nothing here deletes a body — so every blue pixel the counter finds is a void
  // that is not there.
  expect((await readSelection(page)).selectionKind).toBe("placement");
  expect(
    await countPixelsIn(page, states.whileAnotherSelected, VOID_FILL),
  ).toBeGreaterThanOrEqual(MIN_WITNESS_PIXELS);

  await expectTheDifferencingCounterIsUnmoved(page, states);
});

test("a wood kitchen does not reach the mark's red excess on the real render, in any preset", async ({
  page,
  seededDesign,
}) => {
  const finish = paletteFinish("veneer.nuc");
  await storeAKitchenWearing(page, seededDesign, {
    materialTierId: VENEER,
    finish,
  });
  await expectEveryPlacementWears(page, seededDesign.id, finish);
  await openAndSettle(page, seededDesign);

  // Nothing is selected, so no outline is on screen and the whole canvas is the kitchen — which is
  // the state `overflow-mark.e2e.spec.ts` counts its control in.
  const presetButtons = page.locator('[role="group"] button');
  for (const [index, preset] of CAMERA_PRESETS.entries()) {
    if (index > 0) {
      await presetButtons.nth(index).click();
      await page.waitForTimeout(SCENE_SETTLE_MS);
    }
    await expect(presetButtons.nth(index)).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const canvas = await page.locator("canvas").boundingBox();
    if (!canvas) throw new Error("the scene canvas has no layout box");
    const scene = await capturePatch(page, {
      x: Math.round(canvas.x),
      y: Math.round(canvas.y),
      width: Math.round(canvas.width),
      height: Math.round(canvas.height),
    });

    // The fronts are walnut and the structural bodies oak, so this covers the higher of the two woods too; oak
    // reaches 76, hence the threshold of 80.
    expect(
      await countPixelsIn(page, scene, MARK),
      `${preset.id}: veneer.nuc red excess`,
    ).toBeLessThanOrEqual(MAX_ABSENT_MARK_PIXELS);
  }
});

test("on a marked walnut kitchen the mark and the selection are each attributed to the right body", async ({
  page,
  seededDesign,
}) => {
  const finish = paletteFinish("veneer.nuc");
  const overflowing = await storeAKitchenWearing(page, seededDesign, {
    materialTierId: VENEER,
    finish,
    roomWidthMm: NARROWED_ROOM_OVERFLOWING_DESIGN.room.widthMm,
  });
  // `p2` is past the end of its wall, `p0` is not; read off the document rather than restated.
  expect(overflowing).toContain("p2");
  expect(overflowing).not.toContain("p0");
  await openAndSettle(page, seededDesign);

  await clickScene(page, NARROWED_ROOM.sinkCabinetFullWidth);
  await selectInRail(page, "p0");
  const sinkWithTheSinkSelected = await capturePatch(
    page,
    NARROWED_ROOM.sinkPatch,
  );
  const markedWithTheSinkSelected = await capturePatch(page, MARKED_BODY_PATCH);
  const markedAgain = await capturePatch(page, MARKED_BODY_PATCH);

  await clickScene(page, NARROWED_ROOM.farBaseCabinet);
  await selectInRail(page, "p2");
  const sinkWithTheMarkedBodySelected = await capturePatch(
    page,
    NARROWED_ROOM.sinkPatch,
  );
  const markedWithTheMarkedBodySelected = await capturePatch(
    page,
    MARKED_BODY_PATCH,
  );

  // The noise floor on this document, in this state: a wash on screen changes nothing about it.
  expect(
    await changedPixels(page, markedWithTheSinkSelected, markedAgain),
  ).toBe(0);

  // The selection is attributed by difference: each body's region moves when that body's selection changes.
  expect(
    await changedPixels(
      page,
      sinkWithTheMarkedBodySelected,
      sinkWithTheSinkSelected,
    ),
  ).toBeGreaterThanOrEqual(MIN_CHANGED_PIXELS);
  expect(
    await changedPixels(
      page,
      markedWithTheSinkSelected,
      markedWithTheMarkedBodySelected,
    ),
  ).toBeGreaterThanOrEqual(MIN_CHANGED_PIXELS);

  // The mark is attributed by colour: the marked body carries it in both frames, the unmarked body none while the
  // marked one is selected.
  expect(
    await countPixelsIn(page, markedWithTheSinkSelected, MARK),
  ).toBeGreaterThanOrEqual(MIN_MARK_PIXELS);
  expect(
    await countPixelsIn(page, markedWithTheMarkedBodySelected, MARK),
  ).toBeGreaterThanOrEqual(MIN_MARK_PIXELS);
  expect(
    await countPixelsIn(page, sinkWithTheMarkedBodySelected, MARK),
  ).toBeLessThanOrEqual(MAX_ABSENT_MARK_PIXELS);

  // The reading `redTint` cannot make: with the sink cabinet selected its region reports mark pixels on an unmarked
  // body, because the outline's red core clears the red excess alone (`SELECTION_HIGHLIGHT_COLOR` is 210 over both
  // other channels). The mark gate is sound only because it counts with nothing selected.
  expect(
    await countPixelsIn(page, sinkWithTheSinkSelected, MARK),
  ).toBeGreaterThanOrEqual(MIN_MARK_PIXELS);
  expect(OVERFLOW_MARK_COLOR).not.toBe(SELECTION_HIGHLIGHT_COLOR);
});
