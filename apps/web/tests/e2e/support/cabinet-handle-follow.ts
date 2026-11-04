// The cabinet's way back to the kitchen's handle, driven the same way on the phone and on the desktop: only how a
// control is pressed and how a cabinet is picked differ, so those two arrive as arguments and the sequence is written
// once. The kitchen's handle is the shipped steel bar; the cabinet is the sink cabinet `p0`.
import { expect, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

import { readSelection } from "./panel";
import type { SeededDesign } from "./seeded-design";

const ro = JSON.parse(
  readFileSync(
    new URL("../../../src/messages/ro.json", import.meta.url),
    "utf8",
  ),
) as {
  readonly panel: {
    readonly handleFollowsKitchen: string;
    readonly handleLabels: Readonly<Record<string, string>>;
  };
};

const SAVE_BUDGET_MS = 15_000;
const CABINET_ID = "p0";

export interface HowToDrive {
  readonly press: (control: Locator) => Promise<void>;
  /** Picks `p0` from the scene, with whatever the surface needs to make the panel show. */
  readonly pickTheCabinet: () => Promise<void>;
  /** Puts the panel away so the price is reachable; the desktop rail needs none. */
  readonly putThePanelAway: () => Promise<void>;
  readonly closeTheBreakdown: () => Promise<void>;
}

/** Every amount the breakdown prints, in order: a handle that moved a bill moves one of them. */
async function breakdownAmounts(
  page: Page,
  how: HowToDrive,
): Promise<readonly string[]> {
  await how.press(page.getByTestId("price-breakdown-trigger"));
  const surface = page.getByTestId("price-breakdown-surface");
  await expect(surface).toBeVisible();
  const amounts = await surface
    .getByTestId("breakdown-row-amount")
    .allInnerTexts();
  await how.closeTheBreakdown();
  await expect(surface).toHaveCount(0);
  return amounts;
}

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
        design: {
          placements: { id: string; body: { handle?: string } }[];
        };
      };
      return body.design.placements.find(
        (placement) => placement.id === placementId,
      )?.body.handle;
    },
    { id: design.id, placementId: CABINET_ID },
  );
}

function followRow(page: Page): Locator {
  return page.getByTestId("handle-follow-kitchen");
}

async function expectFollowing(page: Page): Promise<void> {
  await expect(followRow(page)).toHaveAttribute("aria-pressed", "true");
  await expect(followRow(page)).toContainText(ro.panel.handleFollowsKitchen);
  await expect(followRow(page)).toContainText(
    ro.panel.handleLabels.steel ?? "",
  );
  for (const handle of ["steel", "black", "push"]) {
    await expect(page.getByTestId(`handle-${handle}`)).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  }
}

export async function followTheKitchenHandleAgain(
  page: Page,
  design: SeededDesign,
  how: HowToDrive,
): Promise<void> {
  const untouchedBill = await breakdownAmounts(page, how);

  await how.pickTheCabinet();
  expect((await readSelection(page)).selectionId).toBe(CABINET_ID);
  await expectFollowing(page);

  await how.press(page.getByTestId("handle-push"));
  await expect(page.getByTestId("handle-push")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(followRow(page)).toHaveAttribute("aria-pressed", "false");
  await expect
    .poll(() => ownHandleInDatabase(page, design), { timeout: SAVE_BUDGET_MS })
    .toBe("push");
  await how.putThePanelAway();
  const ownPushBill = await breakdownAmounts(page, how);
  expect(ownPushBill).not.toEqual(untouchedBill);

  await how.pickTheCabinet();
  await how.press(followRow(page));
  await expectFollowing(page);
  await expect
    .poll(() => ownHandleInDatabase(page, design), { timeout: SAVE_BUDGET_MS })
    .toBeUndefined();
  await how.putThePanelAway();

  expect(await breakdownAmounts(page, how)).toEqual(untouchedBill);
  expect((await readSelection(page)).rejection).toBe("");
}
