import { expect, test, type Page } from "@playwright/test";

import { ro } from "../support/romanian-content.e2e";

/**
 * **Frame D2D's popover at 1440 × 900.** The same component and the same model as the mobile sheet;
 * what differs is the box, and the box is a stylesheet branch (§10.1's one permitted fork).
 *
 * The criterion is "a popover **anchored to the price**", which is a claim about where it is — so
 * this measures it against the price's own boxes, the bar and the cell that holds it, rather than
 * merely asserting it is visible.
 */

const SCENE_SETTLE_MS = 2000;

/** Frame D2D's popover width. Read from the shipped stylesheet would be better; it is written here
 *  because what is asserted is *not the number* but that the surface is far narrower than the
 *  screen — a sheet would span it. */
const POPOVER_MAX_SHARE_OF_VIEWPORT = 0.5;

/** How far inside its cell's right edge the popover may sit. `price-breakdown.module.css` sets
 *  `right: 24px`; the ceiling is written wider than that on purpose — what is asserted is *aligned
 *  to the cell's right edge*, not a restatement of the stylesheet's number. */
const POPOVER_INSET_FROM_CELL_CEILING_PX = 32;

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

/**
 * **The box the popover actually hangs from, read off the page rather than named.** For an
 * absolutely positioned element `offsetParent` *is* its containing block — the box its `right: 24px`
 * and `top: 100%` are resolved against — so this cannot drift from the stylesheet the way a
 * hand-picked ancestor could. On desktop that is the price cell: `price-breakdown.module.css` makes
 * `.anchor` `position: static` there and `configure.module.css` makes `.priceRow` relative, both
 * deliberately.
 *
 * Whether that cell is the price's own is returned alongside its box, because the criterion is a
 * popover **anchored to the price**: a cell that did not hold the figure would satisfy every
 * measurement below while anchoring the surface to something else entirely.
 */
async function containingBlockOfPopover(page: Page): Promise<{
  readonly x: number;
  readonly width: number;
  readonly holdsThePriceFigure: boolean;
}> {
  return page.getByTestId("price-breakdown-surface").evaluate((surface) => {
    // `offsetParent` is an `HTMLElement` member; a locator hands over `SVGElement | HTMLElement`.
    const cell = surface instanceof HTMLElement ? surface.offsetParent : null;
    if (!(cell instanceof HTMLElement))
      throw new Error("the popover has no positioned ancestor to hang from");
    const rect = cell.getBoundingClientRect();
    return {
      x: rect.x,
      width: rect.width,
      holdsThePriceFigure:
        cell.querySelector('[data-testid="price-bar"]') !== null,
    };
  });
}

test("hangs a popover from the price rather than covering the screen", async ({
  page,
}) => {
  await page.getByTestId("price-breakdown-trigger").click();

  const popover = await page
    .getByTestId("price-breakdown-surface")
    .boundingBox();
  const bar = await page.getByTestId("price-bar").boundingBox();
  const cell = await containingBlockOfPopover(page);
  const viewport = page.viewportSize();
  if (!popover || !bar || !viewport)
    throw new Error("the popover is not laid out");

  // Below the bar it belongs to, and inside the screen.
  expect(popover.y).toBeGreaterThanOrEqual(bar.y + bar.height);
  expect(popover.x + popover.width).toBeLessThanOrEqual(viewport.width);

  // **Right-aligned inside the price's own cell**, which is what "anchored to the price" means once
  // the price stopped being a full-width row under the stage. ADR 0104 made the desktop top bar
  // `"nav settings price actions locale"`, so the price is a cell in a 76 px band and its right edge
  // is no longer the screen's. The old proxy for this — `x > viewport.width / 2` — only ever held
  // because the two edges coincided, and it now reads a correctly anchored popover as a defect.
  //
  // Measured at 1440 × 900: the cell spans 890.73–1100.83 and the popover 556.83–1076.83, so it
  // overhangs its cell to the *left* — 520 px will not fit in a 210 px cell — and is pinned 24 px
  // inside on the right. The right edge is therefore the only one that carries the claim.
  expect(cell.holdsThePriceFigure).toBe(true);
  const insetFromCellRightPx =
    cell.x + cell.width - (popover.x + popover.width);
  expect(insetFromCellRightPx).toBeGreaterThanOrEqual(0);
  expect(insetFromCellRightPx).toBeLessThanOrEqual(
    POPOVER_INSET_FROM_CELL_CEILING_PX,
  );

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
