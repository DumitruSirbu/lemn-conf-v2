import { expect, test, type Page } from "@playwright/test";

import { deleteMintedDesigns } from "./support/minted-designs";
import {
  mintSeededDesign,
  openDesignAndAwaitAccessProbe,
} from "./support/seeded-design";

/**
 * **M6-AUD-001, in a browser.** A shared link opened without the write-token cookie must not offer
 * the whole-kitchen settings at all.
 *
 * The audit reproduced the defect exactly this way: mint a design, clear the cookies, open
 * `/d/{id}`, confirm the probe answers `canWrite: false`, then observe that the trigger was still
 * live, choose the last hardware tier, press *Aplică*, watch `data-hardware-tier` change in the
 * local store, and watch `data-save-status` land on `unauthorized`. Server data was never at risk —
 * the write was refused — but the customer had been shown a change that was already lost.
 *
 * `read-only-panel.e2e.spec.ts` is this file's sibling and made the same two-browser argument for
 * §9's panel. The two surfaces read the same two store fields through the same
 * `store/editability.ts`, which is the point: they can no longer disagree.
 *
 * **`canWrite: "checking"` is asserted on the way in rather than in a test of its own.** `/d/{id}`
 * hydrates in that state and stays there until the client's own probe answers, so the window is real
 * and reachable — it is what a slow or blocked API leaves a customer in indefinitely.
 *
 * The design minted here is deleted afterwards — ADR 0006.
 */

const SCENE_SETTLE_MS = 2000;

const mintedDesignIds: string[] = [];

test.afterAll(async () => {
  await deleteMintedDesigns(mintedDesignIds);
});

// Re-pointed onto `mintSeededDesign` (wave 7E4 D3): the route was only an origin for `fetch`, and
// the read-only state this file tests comes from `context.clearCookies()` on `/d/{id}`, unaffected.
async function mintDesign(page: Page): Promise<string> {
  const { id } = await mintSeededDesign(page);
  // `mintSeededDesign` itself throws by name on an empty id (wave 7E4 Q3), so there is nothing left
  // here to check.
  mintedDesignIds.push(id);
  return id;
}

async function storedSettings(page: Page): Promise<{
  readonly materialTierId: string;
  readonly hardwareTierId: string;
  readonly cabinetDepth: string;
  readonly updatedAt: string;
  readonly saveStatus: string;
}> {
  return page.getByTestId("selection-debug").evaluate((element) => ({
    materialTierId: element.getAttribute("data-material-tier") ?? "",
    hardwareTierId: element.getAttribute("data-hardware-tier") ?? "",
    cabinetDepth: element.getAttribute("data-cabinet-depth") ?? "",
    updatedAt: element.getAttribute("data-updated-at") ?? "",
    saveStatus: element.getAttribute("data-save-status") ?? "",
  }));
}

/** Opens the shared link, waiting for the write-access probe on the way — every assertion below is
 *  about the answer, so racing it would test the wrong state. Built on the shared
 *  navigation-and-probe helper (review round 1, R1.3), which every `/d/{id}` caller in this suite
 *  now shares. */
async function openSharedLink(page: Page, designId: string): Promise<void> {
  await openDesignAndAwaitAccessProbe(page, `/d/${designId}`, designId);
  await page.waitForTimeout(SCENE_SETTLE_MS);
}

test("offers nothing on a shared link this browser cannot write", async ({
  page,
  context,
}) => {
  const designId = await mintDesign(page);

  // The control, and what makes the assertions below earned by the missing credential rather than
  // by `/d/{id}` being locked for everyone: the browser that minted it can still edit.
  await openSharedLink(page, designId);
  await expect(page.getByTestId("global-settings-trigger")).toBeEnabled();

  // Same browser, same viewport, no credential — a link opened by someone who never held one.
  await context.clearCookies();
  await openSharedLink(page, designId);

  const trigger = page.getByTestId("global-settings-trigger");
  await expect(trigger).toBeDisabled();
  // §13.1: greyed and unclickable **with the reason**.
  await expect(trigger).toHaveAttribute("data-disabled-reason", /.+/);

  // The sheet cannot even be reached, which is the whole of "never offer what cannot be satisfied".
  await trigger.tap({ force: true });
  await expect(page.getByTestId("global-settings-surface")).toHaveCount(0);

  // Nothing was attempted to discover any of that: no write left the browser, so the store never
  // reached `unauthorized` — which is the state the old surface arrived at *after* showing the
  // customer a change.
  expect((await storedSettings(page)).saveStatus).toBe("idle");
});

test("changes no setting, no price and no scene while the access probe is still in flight", async ({
  page,
  context,
}) => {
  const designId = await mintDesign(page);
  await context.clearCookies();

  // Deliberately **not** awaited: the assertion is about the window before the probe answers, which
  // is the state `/d/{id}` hydrates in and the one the panel deliberately fails closed in.
  await page.goto(`/d/${designId}`);
  await page.waitForSelector("canvas", { state: "attached" });

  const trigger = page.getByTestId("global-settings-trigger");
  await expect(trigger).toBeDisabled();

  const before = await storedSettings(page);
  await trigger.tap({ force: true });
  await expect(page.getByTestId("global-settings-surface")).toHaveCount(0);

  const after = await storedSettings(page);
  expect(after.materialTierId).toBe(before.materialTierId);
  expect(after.hardwareTierId).toBe(before.hardwareTierId);
  expect(after.cabinetDepth).toBe(before.cabinetDepth);
  expect(after.updatedAt).toBe(before.updatedAt);
  expect(after.saveStatus).toBe("idle");
});
