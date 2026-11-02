// Wave Q2's whole-kitchen handle row at 1440 x 900 by pointer (the desktop project; M10 Q2-a). The phone line is
// `kitchen-handle-row.e2e.spec.ts`; this one shows the row in the centred modal and fits the same contract. The handle
// the document carries is read from the route the editor loads from, since `selection-debug.tsx` does not expose it.
import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

import {
  openSeededDesign,
  test as seededTest,
  type SeededDesign,
} from "./support/seeded-design";

const ro = JSON.parse(
  readFileSync(new URL("../../src/messages/ro.json", import.meta.url), "utf8"),
) as {
  readonly globalSettings: { readonly kitchenHandleHeading: string };
  readonly panel: { readonly handleLabels: Readonly<Record<string, string>> };
};

const SHOT_DIRECTORY =
  "/private/tmp/claude-501/-Users-dimas-Documents-Personal-Projects-lemnaria-configurator-gbt/" +
  "617e1b99-28e5-4394-a5ac-0de5ce73ed5d/scratchpad/q2-shots";

const SCENE_SETTLE_MS = 2000;
const SAVE_BUDGET_MS = 15_000;

/** A page error or a console error is a failure of the test that caused it. */
const test = seededTest.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") {
          errors.push(`console: ${message.text()}`);
        }
      });
      page.on("pageerror", (error) => {
        errors.push(`pageerror: ${error.message}`);
      });
      await use(errors);
      expect(errors, "console errors and page errors").toEqual([]);
    },
    { auto: true },
  ],
});

test.beforeEach(async ({ page, seededDesign }) => {
  await openSeededDesign(page, seededDesign);
  await page.waitForTimeout(SCENE_SETTLE_MS);
});

async function handleInDatabase(
  page: Page,
  design: SeededDesign,
): Promise<string | undefined> {
  return page.evaluate(async (id) => {
    const response = await fetch(`/api/designs/${id}`, {
      credentials: "same-origin",
    });
    const body = (await response.json()) as {
      design: { settings?: { handle?: string } };
    };
    return body.design.settings?.handle;
  }, design.id);
}

async function figureOf(page: Page): Promise<number> {
  const text = await page.getByTestId("global-settings-figure").innerText();
  return Number(text.replace(/\D/g, ""));
}

async function centreHandleRow(page: Page): Promise<void> {
  await page.getByTestId("global-settings-handle-group").evaluate((group) => {
    group.scrollIntoView({ block: "center" });
  });
}

test("shows the handle row in the centred modal, fitting the viewport, and applies push-to-open by pointer", async ({
  page,
  seededDesign,
}) => {
  await page.getByTestId("global-settings-trigger").click();
  const surface = page.getByTestId("global-settings-surface");
  await expect(surface).toBeVisible();

  await expect(
    page.getByTestId("global-settings-handle-group").getByRole("heading"),
  ).toHaveText(ro.globalSettings.kitchenHandleHeading);
  const options = page.getByTestId("global-settings-handle-option");
  await expect(options).toHaveCount(3);
  await expect(options.nth(0)).toContainText(ro.panel.handleLabels.steel ?? "");
  await expect(options.nth(1)).toContainText(ro.panel.handleLabels.black ?? "");
  await expect(options.nth(2)).toContainText(ro.panel.handleLabels.push ?? "");
  await expect(options.nth(0)).toHaveAttribute("data-selected", "true");

  const fit = await page.evaluate(() => {
    const modal = document
      .querySelector('[data-testid="global-settings-surface"]')
      ?.getBoundingClientRect();
    return {
      pageOverflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      modal: modal
        ? {
            top: modal.top,
            bottom: modal.bottom,
            left: modal.left,
            right: modal.right,
          }
        : undefined,
      viewport: [window.innerWidth, window.innerHeight],
    };
  });
  expect(fit.pageOverflow).toBeLessThanOrEqual(0);
  expect(fit.modal?.top).toBeGreaterThanOrEqual(0);
  expect(fit.modal?.bottom).toBeLessThanOrEqual(fit.viewport[1] ?? 0);
  expect(fit.modal?.left).toBeGreaterThanOrEqual(0);
  expect(fit.modal?.right).toBeLessThanOrEqual(fit.viewport[0] ?? 0);
  await expect(page.getByTestId("global-settings-apply")).toBeInViewport();

  await centreHandleRow(page);
  await page.screenshot({ path: `${SHOT_DIRECTORY}/desktop-1-handle-row.png` });

  const figureOnBars = await figureOf(page);
  await options.nth(2).click();
  await expect(options.nth(2)).toHaveAttribute("data-selected", "true");
  await page.getByTestId("global-settings-apply").click();
  await expect(surface).toHaveCount(0);

  await expect
    .poll(() => handleInDatabase(page, seededDesign), {
      timeout: SAVE_BUDGET_MS,
    })
    .toBe("push");
  await page.getByTestId("global-settings-trigger").click();
  await expect(options.nth(2)).toHaveAttribute("data-selected", "true");
  expect(await figureOf(page)).toBeGreaterThan(figureOnBars);
  await centreHandleRow(page);
  await page.screenshot({
    path: `${SHOT_DIRECTORY}/desktop-2-push-applied-reopened.png`,
  });
});
