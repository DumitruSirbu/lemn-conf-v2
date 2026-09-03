import { expect, test, type Page } from "@playwright/test";

/**
 * **The desktop half of the same question, which the shipped desktop spec does not ask.**
 *
 * `price-breakdown.desktop.e2e.spec.ts` presses Escape immediately after opening, with focus still
 * inside the popover — so it passes under a listener bound to the dialog and under one bound to the
 * document alike, and cannot tell the two apart. This asks it from outside, which is the only place
 * the answer differs.
 *
 * **Frame D2D is the shell where the non-modal reading does not hold, and that is recorded here
 * rather than asserted.** At 1440 x 900 the stylesheet draws a scrim: visible, covering the
 * viewport, dismissing on click. The page behind is dimmed and pointer-blocked, so this shell *is*
 * modal in effect — yet the tab ring still leaves the popover onto the three camera-preset buttons,
 * which a pointer cannot reach and a keyboard can activate. Nothing below asserts that, because the
 * owner's decision is that the surface is non-modal and §10.1 forbids branching the shell in React;
 * it is named so the next reader meets it here rather than rediscovering it.
 */

const SCENE_SETTLE_MS = 2000;

/** Larger than the measured distance out of the popover, so a re-ordered tab ring changes nothing
 *  about what is asserted. */
const MAX_TAB_STOPS = 10;

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

async function isFocusInsideSurface(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const surface = document.querySelector(
      '[data-testid="price-breakdown-surface"]',
    );
    const focused = document.activeElement;
    return surface !== null && focused !== null && surface.contains(focused);
  });
}

test("closes on Escape after focus has left the popover, and not before", async ({
  page,
}) => {
  await page.getByTestId("price-breakdown-trigger").click();
  await expect(page.getByTestId("price-breakdown-surface")).toBeVisible();

  for (let step = 0; step < MAX_TAB_STOPS; step += 1) {
    if (!(await isFocusInsideSurface(page))) break;
    await page.keyboard.press("Tab");
  }
  expect(await isFocusInsideSurface(page)).toBe(false);

  // Still open with focus outside it — the same pin the mobile spec carries, so a dismissal on
  // focus leave cannot be introduced later and satisfy this test without Escape being pressed.
  await expect(page.getByTestId("price-breakdown-surface")).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(page.getByTestId("price-breakdown-surface")).toHaveCount(0);
  expect(await focusedTestId(page)).toBe("price-breakdown-trigger");
});
