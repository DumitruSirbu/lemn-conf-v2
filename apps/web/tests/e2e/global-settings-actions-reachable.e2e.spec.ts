import { expect, type Page } from "@playwright/test";

import {
  openSeededDesign,
  test,
  type SeededDesign,
} from "./support/seeded-design";

/**
 * **The settings sheet's two actions, measured against the screen they are drawn on** — the owner's
 * report of 2026-09-06 ("there is no save button", corrected the same day to "a refuse and an accept
 * button") and M6-AUD-016's short-viewport measurement, as one file.
 *
 * The architect's adjudication settled what the owner saw: the pair renders **unconditionally** in
 * the choosing step's footer, so the question was never whether they exist but whether they were on
 * screen. Two mechanisms can hide a pinned footer, and this file measures both:
 *
 *   1. **A short viewport.** The desktop shell's own case is measured by the `.desktop` sibling; the
 *      mobile sheet uses `max-height: 77dvh` with a pinned footer and should not clip, so the short
 *      heights below are the assertion that it does not.
 *   2. **iOS Safari's moving bottom edge.** The sheet is `position: fixed; bottom: 0` measured in
 *      `dvh`, and both the fixed anchor and `dvh` move as Safari's bottom toolbar collapses and
 *      expands with scroll. The screenshots in the owner's report are iOS Safari. Chromium cannot
 *      reproduce that toolbar, so what is asserted here is the part a stylesheet owns: the sheet
 *      accounts for `env(safe-area-inset-bottom)`.
 *
 * **Before any scroll and after scrolling the body to its end**, because the body scrolls internally
 * and a footer that is pinned in one scroll state and not the other is exactly the intermittent
 * report this file exists to close.
 */

const SCENE_SETTLE_MS = 2000;

/** The shipped viewport, and two short ones a real phone reaches with browser chrome expanded.
 *  360 x 560 is the smallest screen this product is expected on. */
const SHORT_VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 390, height: 620 },
  { width: 360, height: 560 },
] as const;

/** Sub-pixel layout rounding: a box whose bottom edge lands at 844.0001 has not left the screen. */
const SUB_PIXEL_SLACK = 0.5;

const ACTIONS = ["global-settings-cancel", "global-settings-apply"] as const;

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

async function openConfigurator(
  page: Page,
  seededDesign: SeededDesign,
): Promise<void> {
  await openSeededDesign(page, seededDesign);
  await page.waitForTimeout(SCENE_SETTLE_MS);
}

async function openSheet(page: Page): Promise<void> {
  await page.getByTestId("global-settings-trigger").tap();
  await expect(page.getByTestId("global-settings-surface")).toBeVisible();
}

async function boxOf(page: Page, testId: string): Promise<Box> {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) throw new Error(`${testId} is not laid out on the page`);
  return box;
}

/**
 * **The visual viewport, not the layout one.** `window.visualViewport` is what a customer can see
 * once browser chrome and any pinch-zoom are accounted for; `documentElement.clientHeight` is the
 * layout box, and on the browser this report came from the two differ by exactly the toolbar that
 * moves. The fallback is for engines that publish no visual viewport.
 */
async function visualViewportOf(page: Page): Promise<{
  readonly width: number;
  readonly height: number;
}> {
  return page.evaluate(() => ({
    width: window.visualViewport?.width ?? document.documentElement.clientWidth,
    height:
      window.visualViewport?.height ?? document.documentElement.clientHeight,
  }));
}

function expectInsideViewport(
  box: Box,
  viewport: { readonly width: number; readonly height: number },
  what: string,
): void {
  expect(box.y, `${what} top`).toBeGreaterThanOrEqual(-SUB_PIXEL_SLACK);
  expect(box.x, `${what} left`).toBeGreaterThanOrEqual(-SUB_PIXEL_SLACK);
  expect(box.x + box.width, `${what} right`).toBeLessThanOrEqual(
    viewport.width + SUB_PIXEL_SLACK,
  );
  expect(box.y + box.height, `${what} bottom`).toBeLessThanOrEqual(
    viewport.height + SUB_PIXEL_SLACK,
  );
}

/**
 * Scrolls the sheet's own scrolling box to its end and reports how far it moved.
 *
 * The box is found by structure rather than by class — the class is a CSS-module hash no spec can
 * name — as the ancestor of the tier groups that actually overflows. Returning the distance means a
 * test that scrolled nothing fails rather than passing quietly, which is the difference between
 * measuring both scroll states and measuring the first one twice.
 */
async function scrollSheetBodyToEnd(page: Page): Promise<number> {
  return page.evaluate(() => {
    const group = document.querySelector(
      '[data-testid="global-settings-group"]',
    );
    const body = group?.parentElement;
    if (!body) throw new Error("the sheet has no scrolling body");
    const before = body.scrollTop;
    body.scrollTop = body.scrollHeight;
    return body.scrollTop - before;
  });
}

for (const viewport of SHORT_VIEWPORTS) {
  const label = `${String(viewport.width)} x ${String(viewport.height)}`;

  test(`keeps both settings actions inside the visual viewport at ${label}`, async ({
    page,
    seededDesign,
  }) => {
    await page.setViewportSize(viewport);
    await openConfigurator(page, seededDesign);
    await openSheet(page);

    const visual = await visualViewportOf(page);
    for (const action of ACTIONS)
      expectInsideViewport(
        await boxOf(page, action),
        visual,
        `${action} before scrolling`,
      );

    const scrolled = await scrollSheetBodyToEnd(page);
    // The internal scroll is the mechanism that preserved the surface's height while clipping the
    // footer on the other shell. If nothing scrolled here the second half of this test is the first
    // half again, and the sheet has to be made taller than the screen for it to mean anything.
    expect(scrolled, "the sheet's body did not scroll").toBeGreaterThan(0);

    for (const action of ACTIONS)
      expectInsideViewport(
        await boxOf(page, action),
        visual,
        `${action} after scrolling the body to its end`,
      );
  });

  test(`keeps both settings actions pointer-clickable at ${label}`, async ({
    page,
    seededDesign,
  }) => {
    // Inside the viewport is not the same claim as reachable: a scrim, an overlapping band or a
    // stacking-context mistake can put something else under the pointer at the button's own centre.
    await page.setViewportSize(viewport);
    await openConfigurator(page, seededDesign);
    await openSheet(page);

    for (const action of ACTIONS) {
      const box = await boxOf(page, action);
      const atCentre = await page.evaluate(
        ({ x, y }) =>
          document
            .elementFromPoint(x, y)
            ?.closest("[data-testid]")
            ?.getAttribute("data-testid") ?? null,
        { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      );

      expect(atCentre, `${action} at ${label}`).toBe(action);
    }
  });
}

test("declares the home indicator's inset on the sheet itself", async ({
  page,
  seededDesign,
}) => {
  await openConfigurator(page, seededDesign);
  await openSheet(page);

  const declared = await page.evaluate(() => {
    const surface = document.querySelector(
      '[data-testid="global-settings-surface"]',
    );
    if (!surface) throw new Error("the sheet is not on the page");
    const computed = window.getComputedStyle(surface);
    // **The computed value alone cannot carry this assertion, and saying so is the point.** On a
    // device with no home indicator `env(safe-area-inset-bottom)` resolves to its `0px` fallback,
    // which is indistinguishable from the declaration being absent — so the rule text is read from
    // the CSSOM as well. The computed value is still asserted, because a declaration the parser
    // dropped would leave `padding-bottom` unset rather than resolved.
    const rules = [...document.styleSheets].flatMap((sheet) => {
      try {
        return [...sheet.cssRules];
      } catch {
        return [];
      }
    });
    const surfaceClasses = [...surface.classList];
    const declaring = rules.filter(
      (rule): rule is CSSStyleRule =>
        rule instanceof CSSStyleRule &&
        surfaceClasses.some((name) => rule.selectorText.includes(name)) &&
        rule.style.getPropertyValue("padding-bottom").includes("env("),
    );
    return {
      paddingBottom: computed.paddingBottom,
      envDeclarations: declaring.map((rule) =>
        rule.style.getPropertyValue("padding-bottom"),
      ),
    };
  });

  expect(declared.envDeclarations.length).toBeGreaterThan(0);
  for (const declaration of declared.envDeclarations)
    expect(declaration).toContain("safe-area-inset-bottom");
  expect(declared.paddingBottom).toMatch(/^\d+(\.\d+)?px$/);
});
