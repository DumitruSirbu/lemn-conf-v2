import { SELECTION_HIGHLIGHT_COLOR } from "@lemnaria/three-adapter";
import { expect, test, type Page } from "@playwright/test";

import {
  capturePatch,
  countChangedPixels,
  countPixelsIn,
  toRgb,
  type CapturedPatch,
  type PixelRect,
} from "./support/pixels";
import { readSelection } from "./support/panel";
import { deleteMintedDesigns } from "./support/minted-designs";

// TEMPORARY measurement harness for wave 6V. Deleted before the wave commits.

const SINK_CABINET_FULL_WIDTH = { x: 700, y: 560 };
const FAR_BASE_CABINET = { x: 700, y: 640 };
const FRIDGE = { x: 200, y: 500 };
const SINK_PATCH: PixelRect = { x: 420, y: 468, width: 180, height: 240 };
const VACATED_FRIDGE_PATCH: PixelRect = {
  x: 20,
  y: 585,
  width: 252,
  height: 268,
};

const SCENE_SETTLE_MS = 2500;
const RENDER_SETTLE_MS = 400;
const COMMAND_SETTLE_MS = 600;

const NOISE_FLOOR = 8;
const HIGHLIGHT = {
  kind: "near",
  color: toRgb(SELECTION_HIGHLIGHT_COLOR),
  tolerance: 60,
} as const;
const VOID_FILL = { kind: "blueTint", minExcess: 25 } as const;
const MARK = { kind: "redTint", minExcess: 50 } as const;

const mintedDesignIds: string[] = [];

test.afterAll(async () => {
  await deleteMintedDesigns(mintedDesignIds);
});

function report(label: string, value: unknown): void {
  console.log(`6V-MEASURE ${label} ${JSON.stringify(value)}`);
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
  if (minted.id) mintedDesignIds.push(minted.id);
  expect(minted.status).toBe(201);
  return { id: minted.id, revision: minted.revision };
}

/** Repaints every placement of the stored seeded design in one finish, on one material. */
async function storeAKitchenWearing(
  page: Page,
  stored: StoredDesign,
  materialTierId: string,
  finish: unknown,
): Promise<number> {
  const result = await page.evaluate(
    async (target: {
      id: string;
      revision: string;
      materialTierId: string;
      finish: unknown;
    }) => {
      const loaded = await fetch(`/api/designs/${target.id}`);
      const { design } = (await loaded.json()) as {
        design: {
          materialTierId?: string;
          placements: { id: string; body: Record<string, unknown> }[];
        };
      };
      const painted = {
        ...design,
        materialTierId: target.materialTierId,
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
      return { status: saved.status, body: await saved.text() };
    },
    { ...stored, materialTierId, finish },
  );
  report("store-status", result);
  return result.status;
}

async function openAndSettle(page: Page, designId: string): Promise<void> {
  await page.goto(`/d/${designId}`);
  await page.waitForSelector("canvas", { state: "attached" });
  await expect(async () => {
    expect((await readSelection(page)).probe).toBe("on");
  }).toPass({ timeout: 20_000 });
  await page.waitForTimeout(SCENE_SETTLE_MS);
}

async function bothCounters(
  page: Page,
  label: string,
  unselected: CapturedPatch,
  selected: CapturedPatch,
): Promise<void> {
  report(label, {
    changed: await countChangedPixels(page, unselected, selected, NOISE_FLOOR),
    nearOnUnselected: await countPixelsIn(page, unselected, HIGHLIGHT),
    nearOnSelected: await countPixelsIn(page, selected, HIGHLIGHT),
    blueOnUnselected: await countPixelsIn(page, unselected, VOID_FILL),
    redOnUnselected: await countPixelsIn(page, unselected, MARK),
  });
}

test("the seeded four-row table, and the sink patch across the delete", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.goto("/configurator/configure");
  await page.waitForSelector("canvas", { state: "attached" });
  await page.waitForTimeout(SCENE_SETTLE_MS);

  await clickScene(page, SINK_CABINET_FULL_WIDTH);
  await selectInRail(page, "p0");
  const sinkWhileSelected = await capturePatch(page, SINK_PATCH);
  const fridgeWhileSinkSelected = await capturePatch(page, VACATED_FRIDGE_PATCH);

  await clickScene(page, FAR_BASE_CABINET);
  await selectInRail(page, "p2");
  const sinkWhileOtherSelected = await capturePatch(page, SINK_PATCH);
  const fridgeWhileOtherSelected = await capturePatch(
    page,
    VACATED_FRIDGE_PATCH,
  );

  await bothCounters(
    page,
    "seeded-sink-patch",
    sinkWhileOtherSelected,
    sinkWhileSelected,
  );
  await bothCounters(
    page,
    "seeded-fridge-patch-no-void",
    fridgeWhileOtherSelected,
    fridgeWhileSinkSelected,
  );

  // Now delete the fridge with p2 still selected afterwards, and re-measure the sink patch: the
  // slot gains a fill and the cabinet's own region must not.
  await clickScene(page, FRIDGE);
  await selectInRail(page, "p7");
  await page.getByTestId("panel-remove").click();
  await page.waitForTimeout(COMMAND_SETTLE_MS);
  const { designId } = await readSelection(page);
  if (designId && !mintedDesignIds.includes(designId))
    mintedDesignIds.push(designId);
  const vacatedSelected = await capturePatch(page, VACATED_FRIDGE_PATCH);

  await clickScene(page, FAR_BASE_CABINET);
  await selectInRail(page, "p2");
  const vacatedUnselected = await capturePatch(page, VACATED_FRIDGE_PATCH);
  const sinkAfterDelete = await capturePatch(page, SINK_PATCH);

  report("void-highlight", {
    changed: await countChangedPixels(
      page,
      vacatedUnselected,
      vacatedSelected,
      NOISE_FLOOR,
    ),
    nearOnSelected: await countPixelsIn(page, vacatedSelected, HIGHLIGHT),
    nearOnUnselected: await countPixelsIn(page, vacatedUnselected, HIGHLIGHT),
  });
  report("void-fill-vs-occupied", {
    changed: await countChangedPixels(
      page,
      fridgeWhileOtherSelected,
      vacatedUnselected,
      NOISE_FLOOR,
    ),
    blueOnVacated: await countPixelsIn(page, vacatedUnselected, VOID_FILL),
    blueOnOccupied: await countPixelsIn(page, fridgeWhileOtherSelected, VOID_FILL),
  });
  report("sink-patch-across-the-delete", {
    changed: await countChangedPixels(
      page,
      sinkWhileOtherSelected,
      sinkAfterDelete,
      NOISE_FLOOR,
    ),
    blueOnSink: await countPixelsIn(page, sinkAfterDelete, VOID_FILL),
  });
});

for (const [label, materialTierId, finish] of [
  ["red", "material.painted-mdf", { kind: "free-colour", value: "#ff2d2d" }],
  ["nearRed", "material.painted-mdf", { kind: "free-colour", value: "#cc2222" }],
  ["blue", "material.painted-mdf", { kind: "free-colour", value: "#2d5fff" }],
  ["walnut", "material.veneer", { kind: "palette-entry", entryId: "veneer.nuc" }],
] as const) {
  test(`a kitchen wearing ${label}`, async ({ page }) => {
    test.setTimeout(240_000);
    const stored = await mintDesign(page);
    const status = await storeAKitchenWearing(
      page,
      stored,
      materialTierId,
      finish,
    );
    expect(status).toBe(200);
    await openAndSettle(page, stored.id);

    const canvas = await page.locator("canvas").boundingBox();
    report(`${label}-canvas-box`, canvas);

    await clickScene(page, SINK_CABINET_FULL_WIDTH);
    const first = await readSelection(page);
    report(`${label}-first-selection`, first.selectionId);
    await selectInRail(page, "p0");
    const sinkSelected = await capturePatch(page, SINK_PATCH);

    await clickScene(page, FAR_BASE_CABINET);
    const second = await readSelection(page);
    report(`${label}-second-selection`, second.selectionId);
    const sinkUnselected = await capturePatch(page, SINK_PATCH);

    await bothCounters(page, `${label}-sink-patch`, sinkUnselected, sinkSelected);
  });
}
