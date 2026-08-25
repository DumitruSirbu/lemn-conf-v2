import { expect, test } from "@playwright/test";

/**
 * M2's mobile picking gate (`docs/milestones/M2-void-engine.md`, "Surfaces"): tapping a body and
 * tapping an empty slot must both select the intended target at 390 x 844 via real touch, and a
 * selected body must be visually distinguishable from a selected void without opening any panel.
 *
 * Coordinates below are pixel positions inside the canvas at the app's default "overview" camera
 * preset, found by tapping the running scene and reading `[data-testid="selection-debug"]` — the
 * one DOM hook this dispatch adds (`configure-screen.tsx`) so a WebGL selection is queryable from
 * outside the canvas. Sensitive to any change in `CAMERA_PRESETS.overview` or the seeded design.
 */

const SINK_CABINET_TAP = { x: 215, y: 500 };
const WALL_CABINET_TAP = { x: 195, y: 165 };
const BACKGROUND_TAP = { x: 195, y: 150 };
const HIGHLIGHT_REGION = { x: 110, y: 380, width: 160, height: 280 };

async function readSelection(page: import("@playwright/test").Page) {
  return page
    .locator('[data-testid="selection-debug"]')
    .evaluate((element) => ({
      kind: (element as HTMLElement).dataset.selectionKind ?? "",
      id: (element as HTMLElement).dataset.selectionId ?? "",
    }));
}

test.beforeEach(async ({ page }) => {
  await page.goto("/configurator/configure");
  await page.waitForSelector("canvas", { state: "attached" });
  // The scene mounts, seats the camera, and settles its easing before picking is meaningful.
  await page.waitForTimeout(2000);
});

test("tapping a cabinet body selects it and starts with nothing selected", async ({
  page,
}) => {
  expect(await readSelection(page)).toEqual({ kind: "", id: "" });

  await page.tap("canvas", { position: SINK_CABINET_TAP });

  await expect(async () => {
    expect(await readSelection(page)).toEqual({ kind: "placement", id: "p0" });
  }).toPass({ timeout: 2000 });
});

test("tapping a second body moves the selection to it", async ({ page }) => {
  await page.tap("canvas", { position: SINK_CABINET_TAP });
  await expect(async () => {
    const selection = await readSelection(page);
    expect(selection.kind).toBe("placement");
  }).toPass({ timeout: 2000 });
  const first = await readSelection(page);

  await page.tap("canvas", { position: WALL_CABINET_TAP });

  await expect(async () => {
    const second = await readSelection(page);
    expect(second.kind).toBe("placement");
    expect(second.id).not.toBe(first.id);
  }).toPass({ timeout: 2000 });
});

test("tapping empty background deselects", async ({ page }) => {
  await page.tap("canvas", { position: SINK_CABINET_TAP });
  await expect(async () => {
    expect((await readSelection(page)).kind).toBe("placement");
  }).toPass({ timeout: 2000 });

  await page.tap("canvas", { position: BACKGROUND_TAP });

  await expect(async () => {
    expect(await readSelection(page)).toEqual({ kind: "", id: "" });
  }).toPass({ timeout: 2000 });
});

test("a selected body renders a visible highlight distinct from no selection", async ({
  page,
}) => {
  const before = await page.screenshot({ clip: HIGHLIGHT_REGION });

  await page.tap("canvas", { position: SINK_CABINET_TAP });
  await expect(async () => {
    expect((await readSelection(page)).kind).toBe("placement");
  }).toPass({ timeout: 2000 });
  // Let the BoxHelper's frame render before capturing.
  await page.waitForTimeout(200);

  const after = await page.screenshot({ clip: HIGHLIGHT_REGION });

  expect(Buffer.compare(before, after)).not.toBe(0);
});

test.skip(
  "tapping an empty void slot selects it — UNVERIFIABLE with the current seeded design",
  () => {
    // `KITCHEN_L_DESIGN` is fully occupied by construction: `recomputeVoids()` returns `[]` for it
    // (asserted in `apps/web/src/store/configurator-store.test.ts`), so there is no void anywhere
    // in the running app for a real tap to land on. Verifying "tap an empty slot selects it" and
    // "a selected void is visually distinguishable from a selected body" needs either a design
    // fixture with an intentional gap or waiting for M3, which is the first milestone that removes
    // or clears a placement. Left as a skipped, named gap rather than faked.
  },
);
