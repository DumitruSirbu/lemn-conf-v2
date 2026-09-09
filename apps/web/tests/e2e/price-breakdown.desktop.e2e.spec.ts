import { expect, test, type Page } from "@playwright/test";

import { ro } from "../../src/content/ro";

/**
 * **Frame D2D's popover at 1440 × 900.** The same component and the same model as the mobile sheet;
 * what differs is the box, and the box is a stylesheet branch (§10.1's one permitted fork).
 *
 * The criterion is "a popover **anchored to the price**", which is a claim about where it is — so
 * this measures it against the price bar's own box rather than merely asserting it is visible.
 */

const SCENE_SETTLE_MS = 2000;

/** Frame D2D's popover width. Read from the shipped stylesheet would be better; it is written here
 *  because what is asserted is *not the number* but that the surface is far narrower than the
 *  screen — a sheet would span it. */
const POPOVER_MAX_SHARE_OF_VIEWPORT = 0.5;

test.beforeEach(async ({ page }) => {
  await page.goto("/configurator/configure");
  await page.waitForSelector("canvas", { state: "attached" });
  await page.waitForTimeout(SCENE_SETTLE_MS);
});

async function focusedTestId(page: Page): Promise<string | null> {
  return page.evaluate(
    () => document.activeElement?.getAttribute("data-testid") ?? null,
  );
}

test("hangs a popover from the price rather than covering the screen", async ({
  page,
}) => {
  await page.getByTestId("price-breakdown-trigger").click();

  const popover = await page
    .getByTestId("price-breakdown-surface")
    .boundingBox();
  const bar = await page.getByTestId("price-bar").boundingBox();
  const viewport = page.viewportSize();
  if (!popover || !bar || !viewport)
    throw new Error("the popover is not laid out");

  // Below the bar it belongs to, and inside the same right-hand end of the screen.
  expect(popover.y).toBeGreaterThanOrEqual(bar.y + bar.height);
  expect(popover.x + popover.width).toBeLessThanOrEqual(viewport.width);
  expect(popover.x).toBeGreaterThan(viewport.width / 2);
  expect(popover.width).toBeLessThan(
    viewport.width * POPOVER_MAX_SHARE_OF_VIEWPORT,
  );
});

test("renders the same model as the sheet does", async ({ page }) => {
  await page.getByTestId("price-breakdown-trigger").click();

  await expect(page.getByTestId("price-breakdown-disclaimer")).toHaveText(
    ro.priceBreakdown.disclaimer,
  );
  await expect(page.getByTestId("price-breakdown-whole-kitchen")).toContainText(
    ro.priceBreakdown.included,
  );
});

test("moves focus in, closes on Escape, and gives focus back", async ({
  page,
}) => {
  const trigger = page.getByTestId("price-breakdown-trigger");

  await trigger.click();
  expect(await focusedTestId(page)).toBe("price-breakdown-surface");

  await page.keyboard.press("Escape");

  await expect(page.getByTestId("price-breakdown-surface")).toHaveCount(0);
  expect(await focusedTestId(page)).toBe("price-breakdown-trigger");
});

/**
 * **M6-AUD-013's ruling, from the pointer's side** (owner, 2026-09-09).
 *
 * This replaced a case that clicked the desktop scrim and expected the popover to close. There is
 * no scrim: it dimmed the viewport and swallowed clicks while Tab walked out of the dialog onto the
 * very controls it covered, so the surface was modal for a pointer and not for a keyboard. The owner
 * chose to remove the dim rather than make the dialog modal, because frame 2D deliberately keeps the
 * mobile scene live behind its sheet and §10.1 forbids branching behaviour per shell.
 *
 * **Click-outside-to-close went with it, deliberately** — Escape and the close button are the two
 * ways out, and both are covered above. What is asserted here is the thing the change was *for*: a
 * pointer can reach the page behind the open popover, exactly as the keyboard already could.
 */
test("leaves the page behind it reachable to the pointer, as it already was to Tab", async ({
  page,
}) => {
  await page.getByTestId("price-breakdown-trigger").click();
  await expect(page.getByTestId("price-breakdown-surface")).toBeVisible();

  // Nothing covers the viewport any more. Asked of the document rather than of a locator, so a
  // fixed overlay reintroduced under any class name fails here.
  const whatIsAtThatPoint = await page.evaluate(() => {
    const element = document.elementFromPoint(40, 400);
    return element?.closest("[data-testid]")?.getAttribute("data-testid") ?? "";
  });
  expect(whatIsAtThatPoint).not.toBe("price-breakdown-scrim");

  // And the popover is still open: the point of the change is reachability, not dismissal.
  await expect(page.getByTestId("price-breakdown-surface")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("price-breakdown-surface")).toHaveCount(0);
  expect(await focusedTestId(page)).toBe("price-breakdown-trigger");
});
