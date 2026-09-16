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
import { expect, test, type Page } from "@playwright/test";

import {
  FAR_BASE_CABINET,
  FRIDGE,
  SINK_CABINET_FULL_WIDTH,
  SINK_PATCH,
} from "./support/desktop-scene-points";
import { deleteMintedDesigns } from "./support/minted-designs";
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

/**
 * **Wave 6V's own evidence: the fixtures that break the counters this milestone retired.**
 *
 * ADR 0091 decision 6 asks for a counter that survives an open palette, and its acceptance criterion
 * says what a demonstration is: *"a wave that only shows the new counter working on the seeded
 * design has not demonstrated anything — the seeded design never broke the old one."* So every case
 * here stores a kitchen painted a colour the shipped fixture never wears, measures what the retired
 * instrument reports on it, and measures the replacement on **the very same captures**.
 *
 * The three retired instruments and the colour that breaks each, measured at 1440 x 900 in the
 * overview preset on 2026-09-07 through `editor-rail.desktop.e2e.spec.ts`'s sink patch, in a state
 * where the counted thing is **not on screen**:
 *
 * | instrument              | breaking finish             | reports | should report |
 * | ----------------------- | --------------------------- | ------- | ------------- |
 * | `near` (the highlight)  | MDF free colour `#ff2d2d`   |  16 061 |             0 |
 * | `redTint` (the mark)    | MDF free colour `#ff2d2d`   |  16 416 |             0 |
 * | `blueTint` (void fill)  | MDF free colour `#2d5fff`   |  16 599 |             0 |
 *
 * The differencing counter reads **0** in every one of those states and 10 104 – 10 722 when the
 * selection really moves, on every palette measured. That gap is the whole of wave 6V.
 *
 * **The wood case is here, and what this file used to say about it was wrong.**
 * `qa-6m-mark-composite.adversarial.test.ts` measures every declared wood past a 50-unit red excess —
 * 137 for *Nuc* at the sweep's bright end — and this file recorded 0, 0 and 3 counted pixels on the
 * running app and filed the model's number as a bound tone mapping does not reach. **It is reached.**
 * Measured 2026-09-09, an unmarked oak kitchen puts 194 041 / 193 783 / 278 066 pixels past 50, and
 * the threshold a counter that may meet a wood has to clear is now 80 (`support/pixels.ts`).
 *
 * **The reading was low because the fixture below writes no kitchen colour.** `storeAKitchenWearing`
 * sets `placement.body.finish` only, and since ADR 0099 Amendment B a structural body follows the
 * *kitchen's* colour and `drawnFinishOf` ignores its own `body.finish` — so the documents this file
 * stores are fronts in the named finish over structural bodies in `material.veneer`'s declared
 * default. Every case here still measures what its name says at the threshold it now uses; the
 * adversarial file beside it writes both halves and photographs each wood on its own document.
 *
 * Every design minted here is deleted afterwards (ADR 0006).
 */

/** The three taps and the patch are `editor-rail.desktop.e2e.spec.ts`'s, and are its to move: this
 *  file is a second reading of the same instrument through the same rectangle, so a patch of its
 *  own would measure a different thing and prove nothing about that file's counts.
 *
 *  **Copied across on 2026-09-08**, when the top-bar ruling took the canvas to y 121, 1440 × 779 and
 *  every tap in that file was re-measured against the running app. Each was re-confirmed here on a
 *  narrowed walnut document as well as the seeded one — five clicks each, right body 5/5 — because
 *  this file drives `/d/{id}` rather than the seeded route. The patch is unchanged: `p0`'s own
 *  region measures page x 432–592, y 479–706 and this box still contains it. */

/** `p2`'s own region on the **narrowed-room** document, re-measured 2026-09-08 as the bounding box
 *  of the pixels that move when the selection travels between `p0` and `p2` with the rail open,
 *  taken right of the sink patch so only `p2`'s own outline is in it — page x 626–769, y 562–760,
 *  which this box contains with ~11 px to spare on every side.
 *
 *  **The canvas starts at page y 121 here, the same as on the fitting document.** It used to start
 *  at 114.19 because ADR 0065's flagged total grew the price row *downward*; under the 76 px top bar
 *  that row is a second grid column beside the header, so the flagged total now grows it
 *  **sideways** — measured, the header column shrinks from 1126.7 px to 791.84 and the price row
 *  widens from 313.28 to 648.16, while the row's height stays 76. So the two documents no longer
 *  differ in canvas origin at all, and this patch is no longer a constant of one of them: it is
 *  simply `p2`'s region, which both documents project identically. */
const MARKED_BODY_PATCH: PixelRect = {
  x: 615,
  y: 547,
  width: 168,
  height: 224,
};

const SCENE_SETTLE_MS = 2500;
const RENDER_SETTLE_MS = 400;

/** The same floors `editor-rail.desktop.e2e.spec.ts` measured and records, so the two files cannot
 *  drift into disagreeing about what the instrument reads. */
const NOISE_FLOOR = 8;
const MIN_CHANGED_PIXELS = 3000;
const MAX_UNCHANGED_PIXELS = 10;

/** What a retired counter has to report before this file calls it broken. Set at 5 000: above the
 *  3 603 the `near` counter reads on the seeded design when the sink cabinet really **is**
 *  selected, so each witness below is a false positive larger than the true positive the retired
 *  floor of 800 was calibrated against — not merely a count above a threshold. */
const MIN_WITNESS_PIXELS = 5000;

const HIGHLIGHT = {
  kind: "near",
  color: toRgb(SELECTION_HIGHLIGHT_COLOR),
  tolerance: 60,
} as const;
const VOID_FILL = { kind: "blueTint", minExcess: 25 } as const;
/** Read from `support/pixels.ts` rather than restated: it moved from 50 to 80 on 2026-09-09, when an
 *  unmarked oak kitchen was measured six figures past the old one. Every document photographed in
 *  this file wears a finish, including two woods, so this is the threshold it has to clear. */
const MARK = {
  kind: "redTint",
  minExcess: MARK_MIN_RED_EXCESS_OVER_ANY_FINISH,
} as const;

/** `overflow-mark.e2e.spec.ts`'s own slack for an absence, reused so the two files agree on what
 *  counts as "no mark on screen". The slack is shared; the threshold is not — see `MARK` above. */
const MAX_ABSENT_MARK_PIXELS = 40;
const MIN_MARK_PIXELS = 2000;

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

/** The three states of the sink patch every case below measures, captured with the rail open in all
 *  three so the canvas size, the camera and the design are identical between them. */
interface SinkPatchStates {
  readonly whileSelected: CapturedPatch;
  readonly whileAnotherSelected: CapturedPatch;
  readonly whileAThirdSelected: CapturedPatch;
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

/**
 * Repaints the stored seeded kitchen in one finish on one material, and — where a width is given —
 * declares wall A narrower than the run standing on it, exactly as `overflow-mark.e2e.spec.ts` does.
 *
 * Built from the document the API just returned rather than from a literal, so it cannot drift from
 * the fixture, and it returns the ids that then wear a finish so the assertions read the same answer
 * the document does. **`materialTierId` lives in `settings`**, which `DesignSettingsSchema` owns;
 * `CurrentDesignSchema` is strict, so a sibling key at the top level is a 400 and not a save.
 */
async function storeAKitchenWearing(
  page: Page,
  stored: StoredDesign,
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
    { ...stored, ...wearing },
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

async function changedPixels(
  page: Page,
  before: CapturedPatch,
  after: CapturedPatch,
): Promise<number> {
  return countChangedPixels(page, before, after, NOISE_FLOOR);
}

/**
 * Selects the sink cabinet, then two other bodies, capturing the sink patch in each state.
 *
 * The first tap is a full-width point and the two after it are rail-open ones — the same world
 * point is not the same pixel once the rail has taken its 420 px — which is why the order is fixed
 * rather than incidental.
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

/**
 * The half of every case below that is about the **replacement**, and it is the same three claims
 * each time: the patch moves when this body's selection changes, does not move between two states
 * that both leave it unselected, and reads the same rectangle in both directions.
 */
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
 * **Wave 6V work item 1's sweep, read through the item-2 counter.**
 *
 * The outline has to stay visible against a front painted its own colour, and the criterion names
 * three fronts: the highlight's exact hex, a near neighbour, and one wood. `selection-outline.ts`'s
 * remedy is a near-black casing pass under the red core, and `selection-outline.test.ts` proves at
 * the model level that no six-digit hex can equal both — 242.49 apart, nothing nearer than 121.4 to
 * both, against the retired ball's 60. This is the same claim measured on the running app, which is
 * the only place tone mapping, the real materials and the real line widths are involved.
 *
 * Measured 2026-09-07 through the sink patch: 10 104 changed pixels on `#ff2d2d`, 10 104 on
 * `#cc2222`, 10 720 on `veneer.nuc` — against 10 722 on the unpainted seeded kitchen. The outline
 * loses nothing worth measuring even when the front underneath it is its own colour.
 */
for (const [label, materialTierId, finish] of [
  ["the highlight's own hex", MDF, freeColourFinish("#ff2d2d")],
  ["a near neighbour of it", MDF, freeColourFinish("#cc2222")],
  ["a wood", VENEER, paletteFinish("veneer.nuc")],
] as const) {
  test(`the outline is still counted over a front wearing ${label}`, async ({
    page,
  }) => {
    const stored = await mintDesign(page);
    await storeAKitchenWearing(page, stored, { materialTierId, finish });
    await expectEveryPlacementWears(page, stored.id, finish);
    await openAndSettle(page, stored.id);

    await expectTheDifferencingCounterIsUnmoved(
      page,
      await captureSinkPatchStates(page),
    );
  });
}

test("a front painted the highlight's own colour breaks the colour counter and not the differencing one", async ({
  page,
}) => {
  const finish = freeColourFinish("#ff2d2d");
  const stored = await mintDesign(page);
  await storeAKitchenWearing(page, stored, {
    materialTierId: MDF,
    finish,
  });
  await expectEveryPlacementWears(page, stored.id, finish);
  await openAndSettle(page, stored.id);

  const states = await captureSinkPatchStates(page);

  // **The witness.** Two states, neither of which has the sink cabinet selected, and the retired
  // counter reports a full patch of highlight in both — a false positive four times larger than the
  // 3 603 it reports on the seeded design when the body genuinely is selected.
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

  // **The replacement, on the very same captures.** The customer's colour is in both frames.
  await expectTheDifferencingCounterIsUnmoved(page, states);
});

test("a blue front breaks the void's fill counter and not the differencing one", async ({
  page,
}) => {
  const finish = freeColourFinish("#2d5fff");
  const stored = await mintDesign(page);
  await storeAKitchenWearing(page, stored, {
    materialTierId: MDF,
    finish,
  });
  // The premise `editor-rail.desktop.e2e.spec.ts` asserts before it counts blue, reached from the
  // other side: here every placement wears a finish, so that file's guard would refuse to measure.
  await expectEveryPlacementWears(page, stored.id, finish);
  await openAndSettle(page, stored.id);

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
}) => {
  const finish = paletteFinish("veneer.nuc");
  const stored = await mintDesign(page);
  await storeAKitchenWearing(page, stored, {
    materialTierId: VENEER,
    finish,
  });
  await expectEveryPlacementWears(page, stored.id, finish);
  await openAndSettle(page, stored.id);

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

    // The fronts are walnut and the structural bodies are oak (see the fixture note at the head of
    // this file), so this reading covers the higher of the two woods as well as the named one. Both
    // stay under 80; oak reaches 76, which is why the threshold is 80 and not the old 50.
    expect(
      await countPixelsIn(page, scene, MARK),
      `${preset.id}: veneer.nuc red excess`,
    ).toBeLessThanOrEqual(MAX_ABSENT_MARK_PIXELS);
  }
});

test("on a marked walnut kitchen the mark and the selection are each attributed to the right body", async ({
  page,
}) => {
  const finish = paletteFinish("veneer.nuc");
  const stored = await mintDesign(page);
  const overflowing = await storeAKitchenWearing(page, stored, {
    materialTierId: VENEER,
    finish,
    roomWidthMm: NARROWED_ROOM_OVERFLOWING_DESIGN.room.widthMm,
  });
  // The case is only the case if the two bodies differ in the way it claims: `p2` is past the end of
  // its wall, `p0` is not. Read off the document rather than restated.
  expect(overflowing).toContain("p2");
  expect(overflowing).not.toContain("p0");
  await openAndSettle(page, stored.id);

  await clickScene(page, SINK_CABINET_FULL_WIDTH);
  await selectInRail(page, "p0");
  const sinkWithTheSinkSelected = await capturePatch(page, SINK_PATCH);
  const markedWithTheSinkSelected = await capturePatch(page, MARKED_BODY_PATCH);
  const markedAgain = await capturePatch(page, MARKED_BODY_PATCH);

  await clickScene(page, FAR_BASE_CABINET);
  await selectInRail(page, "p2");
  const sinkWithTheMarkedBodySelected = await capturePatch(page, SINK_PATCH);
  const markedWithTheMarkedBodySelected = await capturePatch(
    page,
    MARKED_BODY_PATCH,
  );

  // The noise floor on this document, in this state: a wash on screen changes nothing about it.
  expect(
    await changedPixels(page, markedWithTheSinkSelected, markedAgain),
  ).toBe(0);

  // **The selection is attributed by difference**: each body's region moves when that body's
  // selection changes, and both readings are of the same swap, so neither can be the other's.
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

  // **The mark is attributed by colour, and stays where it is put**: the marked body carries it in
  // both frames — a mark is not a selection state — and the unmarked body carries none while the
  // marked one is selected. Measured 19 599 and 22 344 against 0.
  expect(
    await countPixelsIn(page, markedWithTheSinkSelected, MARK),
  ).toBeGreaterThanOrEqual(MIN_MARK_PIXELS);
  expect(
    await countPixelsIn(page, markedWithTheMarkedBodySelected, MARK),
  ).toBeGreaterThanOrEqual(MIN_MARK_PIXELS);
  expect(
    await countPixelsIn(page, sinkWithTheMarkedBodySelected, MARK),
  ).toBeLessThanOrEqual(MAX_ABSENT_MARK_PIXELS);

  // **And the reading `redTint` cannot make.** With the sink cabinet selected, its own region
  // reports 6 454 mark pixels on a body the document says is not marked: the selection outline's
  // red core clears the mark's red excess by itself (`SELECTION_HIGHLIGHT_COLOR` is 210 over both
  // other channels against a threshold of 50). The mark gate is sound only because it counts with
  // nothing selected, which `overflow-mark.e2e.spec.ts` now asserts instead of assuming.
  expect(
    await countPixelsIn(page, sinkWithTheSinkSelected, MARK),
  ).toBeGreaterThanOrEqual(MIN_MARK_PIXELS);
  expect(OVERFLOW_MARK_COLOR).not.toBe(SELECTION_HIGHLIGHT_COLOR);
});
