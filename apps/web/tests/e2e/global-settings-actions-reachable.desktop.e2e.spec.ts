import { expect, test, type Page } from "@playwright/test";

/**
 * **M6-AUD-016, measured on the shell it was found on.**
 *
 * Both M6 popovers switch to their desktop shell at `min-width: 900px` **regardless of height**, and
 * both then took a fixed `max-height` — 660 px for the settings sheet, 640 for the price breakdown —
 * with no relation to the viewport at all. The audit's witness, at 900 x 500:
 *
 * ```json
 * { "viewportHeight": 500, "breakdownCloseBottom": 619, "settingsApplyBottom": 639 }
 * ```
 *
 * Both actions below the screen. Their bodies scroll internally, which is what preserved the
 * surface's height while the footer was clipped away — so nothing looked wrong from inside the box.
 * The settings *Aplică* is a primary action with **no scrim-click equivalent**, so a pointer
 * customer could not commit a choice at all.
 *
 * **The shipped desktop project runs at 1440 x 900 and nothing tested a short height**, which is why
 * this file exists rather than an assertion added to an existing spec. Both cases the audit asked
 * for are here: 900 x 500, and a short viewport at the wide end.
 */

const SCENE_SETTLE_MS = 2000;

/** The audit's own case, and a short one at the wide end — the two the report asks for. The width is
 *  what selects the shell; the height is what the clamp is about, so both are varied independently
 *  of it. */
const SHORT_DESKTOP_VIEWPORTS = [
  { width: 900, height: 500 },
  { width: 1440, height: 520 },
] as const;

const SUB_PIXEL_SLACK = 0.5;

/** Every action a customer must be able to reach on each surface, and the control that opens it. */
const SURFACES = [
  {
    name: "the whole-kitchen settings sheet",
    trigger: "global-settings-trigger",
    surface: "global-settings-surface",
    actions: ["global-settings-cancel", "global-settings-apply"],
  },
  {
    name: "the price breakdown",
    trigger: "price-breakdown-trigger",
    surface: "price-breakdown-surface",
    actions: ["price-breakdown-close"],
  },
] as const;

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

async function openConfigurator(page: Page): Promise<void> {
  await page.goto("/configurator/configure");
  await page.waitForSelector("canvas", { state: "attached" });
  await page.waitForTimeout(SCENE_SETTLE_MS);
}

async function boxOf(page: Page, testId: string): Promise<Box> {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) throw new Error(`${testId} is not laid out on the page`);
  return box;
}

async function viewportOf(page: Page): Promise<{
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

/** What a pointer would actually hit at a box's centre, named by the nearest test id. */
async function testIdUnderPointer(
  page: Page,
  box: Box,
): Promise<string | null> {
  return page.evaluate(
    ({ x, y }) =>
      document
        .elementFromPoint(x, y)
        ?.closest("[data-testid]")
        ?.getAttribute("data-testid") ?? null,
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
}

for (const viewport of SHORT_DESKTOP_VIEWPORTS) {
  const size = `${String(viewport.width)} x ${String(viewport.height)}`;

  for (const surface of SURFACES) {
    test(`keeps every action of ${surface.name} inside the viewport at ${size}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await openConfigurator(page);
      await page.getByTestId(surface.trigger).click();
      await expect(page.getByTestId(surface.surface)).toBeVisible();

      // The popover's own box first: a surface that already reaches past the screen has clipped its
      // footer whatever the footer measures, and naming that separately is what tells a later reader
      // which of the two failed.
      const measured = await viewportOf(page);
      expectInsideViewport(
        await boxOf(page, surface.surface),
        measured,
        `${surface.name} at ${size}`,
      );

      for (const action of surface.actions)
        expectInsideViewport(
          await boxOf(page, action),
          measured,
          `${action} at ${size}`,
        );
    });

    test(`keeps every action of ${surface.name} pointer-clickable at ${size}`, async ({
      page,
    }) => {
      // A keyboard may focus an off-screen action; that does not make it operable. The audit's whole
      // severity argument for the settings sheet is that a pointer customer cannot commit, so what
      // is asserted is the pointer.
      await page.setViewportSize(viewport);
      await openConfigurator(page);
      await page.getByTestId(surface.trigger).click();
      await expect(page.getByTestId(surface.surface)).toBeVisible();

      for (const action of surface.actions) {
        const box = await boxOf(page, action);
        expect(
          await testIdUnderPointer(page, box),
          `${action} at ${size}`,
        ).toBe(action);
      }
    });
  }
}

test("still draws the settings sheet at its designed height where the screen has room", async ({
  page,
}) => {
  // The clamp is a `min()`, so this is what says it is a clamp and not a shrink: at the shipped
  // desktop viewport the surface keeps the height frame D2E draws, and only a short screen changes
  // anything.
  await page.setViewportSize({ width: 1440, height: 900 });
  await openConfigurator(page);
  await page.getByTestId("global-settings-trigger").click();
  await expect(page.getByTestId("global-settings-surface")).toBeVisible();

  const surface = await boxOf(page, "global-settings-surface");
  const measured = await viewportOf(page);

  expectInsideViewport(surface, measured, "the settings sheet at 1440 x 900");
  // Well clear of the short-viewport answer, which at 900 px tall would be about 756 px — so a
  // clamp that had started binding at every height would fail here.
  expect(surface.height).toBeGreaterThan(400);
});
