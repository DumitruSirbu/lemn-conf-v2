import { expect, type Page } from "@playwright/test";

import { openSeededDesign, test } from "./support/seeded-design";

/**
 * **Adversarial QA for the one thing `price-breakdown.tsx` decides: what is open.**
 *
 * The shipped specs assert the happy path of the focus story — focus moves in, Escape closes, focus
 * returns to the opener — with focus never having left the sheet in between. This file leaves it.
 *
 * **The Escape handler is `onKeyDown` on the surface `<div>`**, so it only ever hears a key pressed
 * while focus is inside the dialog. Two ordinary routes put focus outside one:
 *
 * - At this viewport frame 2D draws **no scrim**, deliberately (`price-breakdown.module.css` says
 *   why: a transparent scrim swallows every tap meant for the scene behind it). The whole page
 *   behind the sheet stays live while it is open, and a tap on it blurs the dialog.
 * - There is **no focus trap**, so Tab walks out. Measured on this build: four presses from the open
 *   sheet reach the scene's camera-preset buttons — `.body`, the close button, Next's dev portal,
 *   then the presets.
 *
 * **Tab leaving is not the defect and must not be "fixed" into a trap** — frame 2D draws no scrim,
 * so the sheet is non-modal by design. Measured on this build at 390 x 844: the sheet occupies
 * y 302-764 and every stop the ring leaks to (the three camera presets at y 69) is fully visible
 * above it and genuinely usable. Trapping focus would strand a keyboard customer inside a surface
 * a pointer customer can leave. The defect was only ever Escape not firing from where focus went.
 *
 * **Nor is dismiss-on-focus-leave the answer**, which is why both cases below assert the sheet is
 * still open *after* focus has left and *before* Escape is pressed. Without that pin, a
 * blur-dismissal introduced later would satisfy both tests without Escape being involved at all.
 */

const SCENE_SETTLE_MS = 2000;

/** How far Tab is allowed to walk before the search for a stop outside the dialog gives up. Larger
 *  than the measured distance, so a re-ordered tab ring changes nothing about what is asserted. */
const MAX_TAB_STOPS = 10;

test.beforeEach(async ({ page, seededDesign }) => {
  await openSeededDesign(page, seededDesign);
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

test("closes on Escape after a tap behind the sheet has taken focus out of it", async ({
  page,
}) => {
  // BUILD: the sheet open, then focus back on the document — what a tap on the unscrimmed page
  // behind the sheet does. Not a keyboard-only corner: at this viewport every control behind the
  // sheet is still reachable while the sheet stands.
  await page.getByTestId("price-breakdown-trigger").tap();
  await expect(page.getByTestId("price-breakdown-surface")).toBeVisible();
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  expect(await isFocusInsideSurface(page)).toBe(false);

  // **The sheet is still open at this point, and that is an assertion rather than a step.**
  // Dismiss-on-focus-leave is the lighter alternative to the listener below, and it would close the
  // sheet right here — making everything after it pass without Escape ever being pressed. Pinning
  // the sheet open is what stops that arriving later underneath a green check.
  await expect(page.getByTestId("price-breakdown-surface")).toBeVisible();

  // OPERATE
  await page.keyboard.press("Escape");

  // CHECK: closed, and the opener has focus — exactly as when Escape is pressed with focus still
  // inside. A dismissal that depends on where focus happens to be is not one a customer can rely on.
  await expect(page.getByTestId("price-breakdown-surface")).toHaveCount(0);
  expect(await focusedTestId(page)).toBe("price-breakdown-trigger");
});

test("closes on Escape after Tab has walked out of the sheet", async ({
  page,
}) => {
  // The same gap by the keyboard route, and the reason it is a gap rather than a stylistic point:
  // a `role="dialog"` with no trap hands focus to the page behind it on the fourth Tab, and the
  // customer who got there by keyboard is the one with no other way out.
  await page.getByTestId("price-breakdown-trigger").tap();
  await expect(page.getByTestId("price-breakdown-surface")).toBeVisible();

  for (let step = 0; step < MAX_TAB_STOPS; step += 1) {
    if (!(await isFocusInsideSurface(page))) break;
    await page.keyboard.press("Tab");
  }
  expect(await isFocusInsideSurface(page)).toBe(false);
  // Open after focus left it, for the reason given above: a leak is not a dismissal.
  await expect(page.getByTestId("price-breakdown-surface")).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(page.getByTestId("price-breakdown-surface")).toHaveCount(0);
});
