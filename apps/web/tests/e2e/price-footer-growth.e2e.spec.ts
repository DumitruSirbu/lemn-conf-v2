import { expect, test, type Page } from "@playwright/test";

import { ro } from "../../src/content/ro";
import { readSelection } from "./support/panel";
import { tapCanvas } from "./support/canvas-taps";
import { deleteMintedDesigns } from "./support/minted-designs";

/**
 * **What happens to §9's sheet when its footer grows a row**, at 390 × 844.
 *
 * The flagged-total warning (ADR 0065 decision 7b) is a full-width row inside the sheet's footer,
 * above the buttons — and the sheet is fixed at 78 dvh, so the footer growing takes its height out
 * of the scrolling body. That is a layout change to a surface **nobody can look at**: the flagged
 * state is unreachable in a browser until wave 6K's depth control, so neither the warning nor the
 * sheet's behaviour around it can be produced by driving the app.
 *
 * So it is produced the way the visual verification produced it on the price bar: the **real**
 * element is injected at runtime — the shipped class from the shipped stylesheet, the owner's
 * ruled sentence from `ro.ts` — and what must not break is measured. Nothing here asserts that the
 * warning renders; `price-bar-states.adversarial.test.ts` does that. This asserts that the sheet
 * survives it.
 *
 * **What injection cannot tell us**, stated so this file is not read as more than it is: it proves
 * the layout absorbs an element of that size and content at that width. It does not prove the
 * application ever puts one there. That is the model's job, and it is asserted at the model.
 */

const SINK_CABINET_TAP = { x: 215, y: 500 };
const SCENE_SETTLE_MS = 2000;
const SETTLE_MS = 400;
/** A tolerance for sub-pixel layout, not for a real difference. */
const PIXEL_SLACK = 1;

const mintedDesignIds: string[] = [];

test.afterAll(async () => {
  await deleteMintedDesigns(mintedDesignIds);
});

test.beforeEach(async ({ page }) => {
  await page.goto("/configurator/configure");
  await page.waitForSelector("canvas", { state: "attached" });
  await page.waitForTimeout(SCENE_SETTLE_MS);
  await tapCanvas(page, SINK_CABINET_TAP);
  await expect(page.getByTestId("editor-panel")).toHaveCount(1);
  await page.waitForTimeout(SETTLE_MS);

  const { designId } = await readSelection(page);
  if (designId && !mintedDesignIds.includes(designId))
    mintedDesignIds.push(designId);
});

interface SheetMetrics {
  readonly sheetHeight: number;
  readonly footerHeight: number;
  readonly bodyScrollHeight: number;
  readonly bodyClientHeight: number;
  readonly documentOverflow: number;
  /** The done button's box, and whether a tap at its centre would actually reach it. */
  readonly doneBottom: number;
  readonly doneReachable: boolean;
  readonly warning?: {
    readonly height: number;
    readonly lineHeight: number;
    readonly clipped: boolean;
    readonly ellipsised: boolean;
    readonly insideFooter: boolean;
  };
}

async function measure(page: Page): Promise<SheetMetrics> {
  return page.evaluate(() => {
    const sheet = document.querySelector('[data-testid="editor-panel"]');
    const footer = sheet?.querySelector("footer");
    const body = sheet?.querySelector('[data-testid="replace-rows"]')
      ?.parentElement?.parentElement;
    const done = document.querySelector('[data-testid="panel-done"]');
    if (!sheet || !footer || !body || !done)
      throw new Error("the sheet is not laid out as this spec expects");

    const doneBox = done.getBoundingClientRect();
    const hit = document.elementFromPoint(
      doneBox.x + doneBox.width / 2,
      doneBox.y + doneBox.height / 2,
    );
    const injected = document.querySelector(
      '[data-testid="panel-price-overflow"]',
    );

    return {
      sheetHeight: sheet.getBoundingClientRect().height,
      footerHeight: footer.getBoundingClientRect().height,
      bodyScrollHeight: body.scrollHeight,
      bodyClientHeight: body.clientHeight,
      documentOverflow:
        document.documentElement.scrollHeight - window.innerHeight,
      doneBottom: doneBox.bottom,
      doneReachable: hit === done || done.contains(hit),
      ...(injected
        ? {
            warning: {
              height: injected.getBoundingClientRect().height,
              lineHeight: Number.parseFloat(
                getComputedStyle(injected).lineHeight,
              ),
              clipped: injected.scrollHeight > injected.clientHeight + 1,
              ellipsised:
                getComputedStyle(injected).textOverflow === "ellipsis",
              insideFooter:
                injected.getBoundingClientRect().bottom <=
                footer.getBoundingClientRect().bottom + 1,
            },
          }
        : {}),
    };
  });
}

/** Injects the shipped element: the hashed class read off the shipped stylesheet, and the owner's
 *  ruled sentence. Nothing here invents markup — a hand-written `<span>` with hand-written padding
 *  would measure a layout the application does not have. */
async function injectTheWarning(page: Page, sentence: string): Promise<void> {
  await page.evaluate((text) => {
    function findClass(name: string): string | null {
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        try {
          rules = sheet.cssRules;
        } catch {
          continue;
        }
        for (const rule of Array.from(rules)) {
          const selector = (rule as CSSStyleRule).selectorText;
          const match = selector
            ? new RegExp(`\\.([\\w-]*${name}[\\w-]*)`).exec(selector)
            : null;
          if (match?.[1]) return match[1];
        }
      }
      return null;
    }

    const region = document.querySelector(
      '[data-testid="panel-price-flag-region"]',
    );
    const className = findClass("footerPriceWarning");
    if (!region || !className)
      throw new Error("the footer has no live region or no warning class");

    const warning = document.createElement("span");
    warning.className = className;
    warning.dataset.testid = "panel-price-overflow";
    warning.textContent = text;
    region.appendChild(warning);
  }, sentence);
  await page.waitForTimeout(SETTLE_MS);
}

test("the sheet absorbs a footer that grows by the flagged-total warning", async ({
  page,
}) => {
  const before = await measure(page);
  expect(before.warning).toBeUndefined();

  await injectTheWarning(page, ro.price.overflowingTotalWarning);
  const after = await measure(page);

  // The injection did something, or everything below would pass vacuously.
  expect(after.warning).toBeDefined();
  expect(after.footerHeight).toBeGreaterThan(before.footerHeight);

  // The sheet does not grow with its footer: 78 dvh is 78 dvh, and the room comes out of the body.
  expect(Math.abs(after.sheetHeight - before.sheetHeight)).toBeLessThanOrEqual(
    PIXEL_SLACK,
  );
  expect(after.bodyClientHeight).toBeLessThan(before.bodyClientHeight);

  // And the body is still a scrolling region rather than a clipped one.
  expect(after.bodyScrollHeight).toBeGreaterThan(after.bodyClientHeight);

  // Nothing pushed the page itself out of shape.
  expect(after.documentOverflow).toBeLessThanOrEqual(PIXEL_SLACK);
});

test("the footer's actions stay whole and hittable underneath it", async ({
  page,
}) => {
  await injectTheWarning(page, ro.price.overflowingTotalWarning);
  const after = await measure(page);

  // Fully on screen — the failure mode of a growing footer is a button pushed under the fold.
  expect(after.doneBottom).toBeLessThanOrEqual(
    page.viewportSize()?.height ?? 0,
  );
  // And actually reachable: nothing is lying over it.
  expect(after.doneReachable).toBe(true);

  const done = page.getByTestId("panel-done");
  await expect(done).toBeVisible();
  await expect(done).toBeInViewport();
});

test("the warning wraps at 390 px rather than being cut off", async ({
  page,
}) => {
  await injectTheWarning(page, ro.price.overflowingTotalWarning);
  const { warning } = await measure(page);
  if (!warning) throw new Error("the warning was not injected");

  // Wrapped: the owner's sentence does not fit one line at this width, and it is not being asked to.
  expect(warning.height).toBeGreaterThan(warning.lineHeight * 1.5);
  // Whole: nothing is scrolled out of its own box, and no ellipsis is hiding the rest of a sentence
  // the customer needs all of.
  expect(warning.clipped).toBe(false);
  expect(warning.ellipsised).toBe(false);
  expect(warning.insideFooter).toBe(true);
});
