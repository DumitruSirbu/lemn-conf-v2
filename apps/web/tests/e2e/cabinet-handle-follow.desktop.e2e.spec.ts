// A cabinet follows the kitchen's handle again at 1440 x 900 by pointer, with the editor in the side rail.
// The phone line is `cabinet-handle-follow.e2e.spec.ts`; the sequence is the same.
import { expect } from "@playwright/test";

import { followTheKitchenHandleAgain } from "./support/cabinet-handle-follow";
import { SINK_CABINET_FULL_WIDTH } from "./support/desktop-scene-points";
import { openSeededDesign, test } from "./support/seeded-design";

const SCENE_SETTLE_MS = 2000;
const COMMAND_SETTLE_MS = 400;
const RENDER_SETTLE_MS = 600;

test.beforeEach(async ({ page, seededDesign }) => {
  await openSeededDesign(page, seededDesign);
  await page.waitForTimeout(SCENE_SETTLE_MS);
});

test("gives the kitchen's handle and the original bill back when a cabinet follows the kitchen again", async ({
  page,
  seededDesign,
}) => {
  await followTheKitchenHandleAgain(page, seededDesign, {
    press: async (control) => {
      await control.click();
      await page.waitForTimeout(COMMAND_SETTLE_MS);
    },
    pickTheCabinet: async () => {
      if ((await page.getByTestId("editor-panel").count()) === 0) {
        await page.mouse.click(
          SINK_CABINET_FULL_WIDTH.x,
          SINK_CABINET_FULL_WIDTH.y,
        );
        await page.waitForTimeout(RENDER_SETTLE_MS);
      }
      await expect(page.getByTestId("editor-panel")).toHaveCount(1);
    },
    putThePanelAway: async () => {
      await page.getByTestId("panel-close").click();
      await expect(page.getByTestId("editor-panel")).toHaveCount(0);
    },
    closeTheBreakdown: async () => {
      await page.keyboard.press("Escape");
    },
  });
});
