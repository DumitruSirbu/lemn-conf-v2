import { expect, test, type Page } from "@playwright/test";

import { readSelection } from "./support/panel";
import { SINK_CABINET_TAP, tapCanvas } from "./support/canvas-taps";
import { deleteMintedDesigns } from "./support/minted-designs";
import { mintSeededDesign } from "./support/seeded-design";

/**
 * Wave 4C's read-only path, end to end for the first time (M4 hand-offs 2 and 3, ADR 0019
 * decision 1). Until now it was covered by unit tests only: `describePanel` was asked what it
 * returns for `canWrite: false`, and nothing had ever opened a shared link in a browser that does
 * not hold the write-token cookie and looked at what renders.
 *
 * Two things about `/d/{id}` shape this file, and both are deliberate app behaviour rather than
 * test scaffolding:
 *
 * 1. It issues a **second** `GET /api/designs/{id}` from the client. The page renders from a
 *    server-side `load`, and the write-token cookie is scoped `Path=/api/designs/{id}`, so that
 *    request could not have carried it — `useWriteAccessProbe` asks the one route it does reach.
 * 2. The page therefore hydrates `canWrite: "checking"` and offers **no edit at all** until the
 *    probe answers — wave S7, finding WEB-002, which inverted the earlier optimism. So every
 *    assertion below, on the writable side as well as the read-only one, waits for the probe rather
 *    than racing it: the response is awaited explicitly, and every assertion is a retrying one on
 *    top of that.
 *
 * The design minted here is deleted afterwards — ADR 0006, the same obligation every writing spec
 * in this suite carries.
 */

const SCENE_SETTLE_MS = 2000;
const PROBE_TIMEOUT_MS = 15_000;

const mintedDesignIds: string[] = [];

test.afterAll(async () => {
  await deleteMintedDesigns(mintedDesignIds);
});

// Re-pointed onto `mintSeededDesign` (wave 7E4 D3): the route was only an origin for `fetch`, and
// the read-only state this file tests comes from `context.clearCookies()` on `/d/{id}`, unaffected.
async function mintDesign(page: Page): Promise<string> {
  const { id } = await mintSeededDesign(page);
  // Registered before it is asserted on, so a failing assertion still cleans up.
  if (id) mintedDesignIds.push(id);
  expect(id).not.toBe("");
  return id;
}

/** Opens the shared link and selects a body, waiting for the write-access probe on the way. Returns
 *  once §9's panel is on screen for a body the design's author could delete. */
async function openAndSelect(page: Page, designId: string): Promise<void> {
  const probe = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === `/api/designs/${designId}`,
    { timeout: PROBE_TIMEOUT_MS },
  );
  await page.goto(`/d/${designId}`);
  await page.waitForSelector("canvas", { state: "attached" });
  await probe;
  await page.waitForTimeout(SCENE_SETTLE_MS);

  await tapCanvas(page, SINK_CABINET_TAP);
  await expect(page.getByTestId("editor-panel")).toHaveCount(1);
  await expect(async () => {
    expect((await readSelection(page)).selectionId).toBe("p0");
  }).toPass({ timeout: 5000 });
}

async function disabledFlagsOf(page: Page, selector: string) {
  return page
    .locator(selector)
    .evaluateAll((elements) =>
      elements.map((element) => (element as HTMLButtonElement).disabled),
    );
}

test("a shared link opened without the write-token cookie renders a read-only panel", async ({
  page,
  context,
}) => {
  const designId = await mintDesign(page);

  // The control, and the reason the assertions below are earned by the missing credential rather
  // than by `/d/{id}` being read-only for everyone: the browser that minted it can still edit.
  await openAndSelect(page, designId);
  await expect(page.getByTestId("panel-notice")).toHaveAttribute(
    "data-empty",
    "true",
  );
  await expect(page.getByTestId("panel-remove")).toBeEnabled();
  await expect(page.getByTestId("finish-pal.antracit")).toBeEnabled();

  // Same browser, same viewport, no credential — a link opened by someone who never held one.
  await context.clearCookies();
  await openAndSelect(page, designId);

  await expect(page.getByTestId("panel-notice")).toHaveAttribute(
    "data-notice",
    "read-only",
  );
  // It is a statement of fact, not a failure: an expired or cleared cookie is ordinary operation.
  await expect(page.getByTestId("panel-notice")).toHaveAttribute(
    "data-tone",
    "info",
  );

  // §13.1: everything that would write is greyed and unclickable — never offered and then refused.
  await expect(page.getByTestId("panel-remove")).toBeDisabled();
  const rows = await disabledFlagsOf(page, '[data-testid^="offer-"]');
  const finishes = await disabledFlagsOf(page, '[data-testid^="finish-"]');
  const handles = await disabledFlagsOf(page, '[data-testid^="handle-"]');
  expect(rows.length).toBeGreaterThan(0);
  expect(finishes.length).toBeGreaterThan(0);
  expect(handles.length).toBeGreaterThan(0);
  expect(rows.every(Boolean)).toBe(true);
  expect(finishes.every(Boolean)).toBe(true);
  expect(handles.every(Boolean)).toBe(true);

  // The reason travels with the greyed control (§13.1), on the rows and on the delete.
  await expect(page.getByTestId("panel-remove-reason")).toBeVisible();
  await expect(page.getByTestId("section-replace")).toContainText(
    "Doar vizualizare",
  );

  // Nothing was attempted to discover any of that: the panel disabled from the selection's own
  // numbers and the load's answer, so no write ever left the browser.
  expect((await readSelection(page)).saveStatus).toBe("idle");
});
