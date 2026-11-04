// A cabinet follows the kitchen's handle again at 390 x 844 by real touch, the priority surface. The cabinet is
// given a handle of its own, the "Ca restul bucătăriei" row is pressed, and the kitchen's handle, the stored document
// and the bill all return.
import { expect } from "@playwright/test";

import { followTheKitchenHandleAgain } from "./support/cabinet-handle-follow";
import { SINK_CABINET_TAP, tapCanvas } from "./support/canvas-taps";
import { dismissPanel } from "./support/panel";
import { openSeededDesign, test } from "./support/seeded-design";

const SCENE_SETTLE_MS = 2000;
const COMMAND_SETTLE_MS = 400;

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
      await control.tap();
      await page.waitForTimeout(COMMAND_SETTLE_MS);
    },
    pickTheCabinet: async () => {
      await tapCanvas(page, SINK_CABINET_TAP);
      await expect(page.getByTestId("editor-panel")).toHaveCount(1);
    },
    putThePanelAway: () => dismissPanel(page),
    closeTheBreakdown: async () => {
      await page.getByTestId("price-breakdown-close").tap();
    },
  });
});
