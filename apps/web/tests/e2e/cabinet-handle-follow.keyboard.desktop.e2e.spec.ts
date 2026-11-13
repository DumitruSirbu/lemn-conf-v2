// The handle control's "Ca restul bucătăriei" row by keyboard alone at 1440 x 900, and across a reload: Tab reaches
// it from the chips, Enter and Space press it, focus stays on the row, the stored document loses the handle, and the
// cabinet that was opened again from storage still follows the kitchen.
import { expect, type Page } from "@playwright/test";

import { SINK_CABINET_FULL_WIDTH } from "./support/desktop-scene-points";
import {
  openSeededDesign,
  test,
  type SeededDesign,
} from "./support/seeded-design";

const SCENE_SETTLE_MS = 2000;
const RENDER_SETTLE_MS = 600;
const SAVE_BUDGET_MS = 15_000;
const CABINET_ID = "p0";

async function ownHandleInDatabase(
  page: Page,
  design: SeededDesign,
): Promise<string | undefined> {
  return page.evaluate(
    async ({ id, placementId }) => {
      const response = await fetch(`/api/designs/${id}`, {
        credentials: "same-origin",
      });
      const body = (await response.json()) as {
        design: { placements: { id: string; body: { handle?: string } }[] };
      };
      return body.design.placements.find(
        (placement) => placement.id === placementId,
      )?.body.handle;
    },
    { id: design.id, placementId: CABINET_ID },
  );
}

async function pickTheCabinet(page: Page): Promise<void> {
  if ((await page.getByTestId("editor-panel").count()) === 0) {
    await page.mouse.click(
      SINK_CABINET_FULL_WIDTH.x,
      SINK_CABINET_FULL_WIDTH.y,
    );
    await page.waitForTimeout(RENDER_SETTLE_MS);
  }
  await expect(page.getByTestId("editor-panel")).toHaveCount(1);
}

test.beforeEach(async ({ page, seededDesign }) => {
  await openSeededDesign(page, seededDesign);
  await page.waitForTimeout(SCENE_SETTLE_MS);
  await pickTheCabinet(page);
});

test("Tab reaches the row from the chips and Enter and Space each give the cabinet back to the kitchen", async ({
  page,
  seededDesign,
}) => {
  const row = page.getByTestId("handle-follow-kitchen");
  const lastChip = page.getByTestId("handle-push");

  for (const key of ["Enter", "Space"] as const) {
    await lastChip.click();
    await expect(row).toHaveAttribute("aria-pressed", "false");
    await expect
      .poll(() => ownHandleInDatabase(page, seededDesign), {
        timeout: SAVE_BUDGET_MS,
      })
      .toBe("push");

    await lastChip.focus();
    await page.keyboard.press("Tab");
    await expect(row).toBeFocused();
    await page.keyboard.press(key);

    await expect(row).toHaveAttribute("aria-pressed", "true");
    await expect(row).toBeFocused();
    await expect
      .poll(() => ownHandleInDatabase(page, seededDesign), {
        timeout: SAVE_BUDGET_MS,
      })
      .toBeUndefined();
  }
});

test("a cabinet given back to the kitchen is still the kitchen's after a reload from storage", async ({
  page,
  seededDesign,
}) => {
  await page.getByTestId("handle-black").click();
  await expect
    .poll(() => ownHandleInDatabase(page, seededDesign), {
      timeout: SAVE_BUDGET_MS,
    })
    .toBe("black");
  await page.getByTestId("handle-follow-kitchen").click();
  await expect
    .poll(() => ownHandleInDatabase(page, seededDesign), {
      timeout: SAVE_BUDGET_MS,
    })
    .toBeUndefined();

  await openSeededDesign(page, seededDesign);
  await page.waitForTimeout(SCENE_SETTLE_MS);
  await pickTheCabinet(page);

  const row = page.getByTestId("handle-follow-kitchen");
  await expect(row).toHaveAttribute("aria-pressed", "true");
  for (const handle of ["steel", "black", "push"]) {
    await expect(page.getByTestId(`handle-${handle}`)).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  }
});
