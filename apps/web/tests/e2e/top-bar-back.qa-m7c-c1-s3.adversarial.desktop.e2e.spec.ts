// M7C wave C1 slice S3 adversarial QA (docs/WORKFLOW.md step 3), at the desktop viewport: criteria 3,
// 3a, 3b and 3c of `docs/milestones/M7C-m7-feedback-fixes.md`, *C1*. The phone half is
// `qa-m7c-c1-s3-back.adversarial.e2e.spec.ts`; `support/qa-m7c-c1-s3-back.ts` holds what the two share.
//
// **The file name sorts it beside the top-bar specs on purpose.** Playwright shards whole files in name
// order, and under a `qa-…` name these nine tests pushed desktop shard 2/3 to 80 against its budget of
// 70 (`pnpm gate:e2e-shard-budget`, measured 2026-10-01); here the shards hold 68 / 70 / 61.
//
// **Must not run concurrently with any other persistence live run**: each test mints one row and the
// `seededDesign` fixture deletes it (ADR 0006).
import { expect, type Page } from "@playwright/test";

import {
  ACTIONS_GAP_PX,
  APPROVED_COPY,
  MATERIAL_CONFIRMATION,
  actionsCentreOffset,
  reachTheMaterialConfirmation,
  CONFIRM,
  DIALOG,
  SCRIM,
  STAY,
  captureEvidence,
  focusedTestId,
  liveBandsBehindTheDialog,
  openTheQuestion,
  readDialogFit,
  recordRequests,
  type Box,
} from "./support/qa-m7c-c1-s3-back";
import { openSeededDesign, test, type Locale } from "./support/seeded-design";

const LOCALES: readonly Locale[] = ["ro", "ru"];
const BACK = "top-bar-back";
/** Criterion 3's range, and the two ends of the dispatch's list between them. */
const SWEPT_WIDTHS = [900, 1024, 1280, 1440, 1920];
const SWEPT_HEIGHT = 900;
const PHONE = { width: 390, height: 844 };
const SUB_PIXEL_SLACK = 0.5;
/** How long the settings cell must hold one width before the row counts as settled — the rung is
 *  decided from a `ResizeObserver` (`top-bar-pill-containment.desktop.e2e.spec.ts`, `atWidth`). */
const ROW_QUIET_MS = 200;
/** Everything the desktop band draws, by test id; the wordmark has none and is read structurally. */
const BAND_CONTROLS = [
  BACK,
  "top-bar-step",
  "top-bar-title",
  "global-settings-trigger",
  "price-bar",
  "review-cta",
  "top-bar-locale",
];
/** ADR 0104 decision 8's protected controls, plus the one this slice adds. */
const NEVER_CLIPPED = [
  BACK,
  "top-bar-step",
  "price-bar-total",
  "review-cta",
  "top-bar-locale",
];

test("at 1440 px one back control is drawn, with the phone's destination; it asks without navigating, and Stay, Escape and the backdrop each return focus to it", async ({
  page,
  seededDesign,
}) => {
  await openSeededDesign(page, seededDesign);
  const designUrl = page.url();
  const requests = recordRequests(page);

  await expect(page.getByTestId(BACK)).toBeVisible();
  await expect(page.getByTestId("bottom-bar-back")).toBeHidden();
  const desktopHref = await page.getByTestId(BACK).getAttribute("href");
  expect(desktopHref).toMatch(/^\/ro\/configurator\/room\?shape=/);

  const dismissals = [
    () => page.getByTestId(STAY).click(),
    () => page.keyboard.press("Escape"),
    () => page.getByTestId(SCRIM).click({ position: { x: 6, y: 6 } }),
  ];
  for (const dismiss of dismissals) {
    await openTheQuestion(page, BACK);
    expect(page.url()).toBe(designUrl);
    expect(await liveBandsBehindTheDialog(page)).toEqual([]);

    await dismiss();

    await expect(page.getByTestId(DIALOG)).toHaveCount(0);
    await expect(page.getByTestId(BACK)).toBeFocused();
    expect(page.url()).toBe(designUrl);
    await expect(page.locator("main > [inert]")).toHaveCount(0);
  }
  expect(
    requests.filter((request) => request.method !== "GET"),
    JSON.stringify(requests),
  ).toEqual([]);

  await page.setViewportSize(PHONE);
  await expect(page.getByTestId("bottom-bar-back")).toBeVisible();
  expect(await page.getByTestId("bottom-bar-back").getAttribute("href")).toBe(
    desktopHref,
  );
});

test("confirmed at 1440 px: Step 1 opens at 1D on the link's own href with every field filled, nothing is written, the design stays at its link and /ro resumes it", async ({
  page,
  seededDesign,
}) => {
  await openSeededDesign(page, seededDesign);
  const designUrl = page.url();
  const href = await page.getByTestId(BACK).getAttribute("href");
  await openTheQuestion(page, BACK);
  const requests = recordRequests(page);

  await page.getByTestId(CONFIRM).click();

  await expect(page.locator("main[data-room-substate]")).toHaveAttribute(
    "data-room-substate",
    "1D",
  );
  const landed = new URL(page.url());
  expect(landed.pathname + landed.search).toBe(href);
  for (const field of ["wallA", "wallB", "height"]) {
    await expect(page.getByTestId(`room-length-${field}`)).not.toHaveValue("");
  }
  const detail = JSON.stringify(requests);
  expect(
    requests.filter((request) => request.method !== "GET"),
    detail,
  ).toEqual([]);
  expect(
    requests.filter((request) => request.pathname.startsWith("/api/")),
    detail,
  ).toEqual([]);

  await page.goto("/ro");
  await expect(page).toHaveURL(designUrl);
  await expect(page.getByTestId("top-bar-title")).toBeVisible();
});

test("by keyboard: Tab reaches the link, Enter asks, focus enters the dialog and cannot leave it in either direction, Escape returns it to the link, and Enter on Confirm leaves", async ({
  page,
  seededDesign,
}) => {
  await openSeededDesign(page, seededDesign);
  const designUrl = page.url();

  await page.keyboard.press("Tab");
  expect(await focusedTestId(page)).toBe(BACK);
  await page.keyboard.press("Enter");
  await expect(page.getByTestId(DIALOG)).toBeFocused();
  expect(page.url()).toBe(designUrl);
  expect(await liveBandsBehindTheDialog(page)).toEqual([]);

  await page.keyboard.press("Shift+Tab");
  expect(await focusedTestId(page)).toBe(CONFIRM);
  const visited: (string | null)[] = [];
  for (let pressed = 0; pressed < 5; pressed += 1) {
    await page.keyboard.press("Tab");
    visited.push(await focusedTestId(page));
  }
  expect(visited).toEqual([STAY, CONFIRM, STAY, CONFIRM, STAY]);

  await page.keyboard.press("Escape");
  await expect(page.getByTestId(DIALOG)).toHaveCount(0);
  await expect(page.getByTestId(BACK)).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(page.getByTestId(DIALOG)).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  expect(await focusedTestId(page)).toBe(CONFIRM);
  await page.keyboard.press("Enter");
  await expect(page.locator("main[data-room-substate]")).toHaveAttribute(
    "data-room-substate",
    "1D",
  );
});

test("a Control/Meta click opens Step 1 in a new tab and asks nothing in this one", async ({
  page,
  seededDesign,
  context,
  baseURL,
}) => {
  await openSeededDesign(page, seededDesign);
  const designUrl = page.url();
  const href = await page.getByTestId(BACK).getAttribute("href");

  const [opened] = await Promise.all([
    context.waitForEvent("page"),
    page.getByTestId(BACK).click({ modifiers: ["ControlOrMeta"] }),
  ]);

  await expect(opened).toHaveURL(`${String(baseURL)}${String(href)}`);
  await expect(page.getByTestId(DIALOG)).toHaveCount(0);
  expect(page.url()).toBe(designUrl);
  await opened.close();
});

test("a middle click neither asks nor navigates this tab", async ({
  page,
  seededDesign,
}) => {
  // Headless Chromium opens no tab for a synthesised middle click (measured: no `page` event in
  // 30 s), so what the browser does with it elsewhere is not asserted here.
  await openSeededDesign(page, seededDesign);
  const designUrl = page.url();

  await page.getByTestId(BACK).click({ button: "middle" });

  await expect(page.getByTestId(DIALOG)).toHaveCount(0);
  expect(page.url()).toBe(designUrl);
});

test("the settings sheet's material-change confirmation is not centred: its actions start at the footer's own padding, under its heading, and Escape steps back to the choices", async ({
  page,
  seededDesign,
}) => {
  await openSeededDesign(page, seededDesign);
  await reachTheMaterialConfirmation(page);

  const fit = await readDialogFit(page, MATERIAL_CONFIRMATION);
  const detail = JSON.stringify(fit);
  console.log(`DIALOG_FIT material ro ${detail}`);

  expect(fit.footer.justifyContent, detail).toBe("space-between");
  expect(fit.stay.left, detail).toBe(fit.footer.left + fit.footer.paddingLeft);
  expect(fit.confirm.left - fit.stay.right, detail).toBe(ACTIONS_GAP_PX);
  expect(fit.title.bottom, detail).toBeLessThanOrEqual(fit.body.top);
  expect(fit.title.text, detail).not.toBe("");
  expect(fit.body.text, detail).not.toBe("");
  const surface = page.getByTestId(MATERIAL_CONFIRMATION.dialogTestId);
  await expect(surface).toHaveAccessibleName(fit.title.text);

  await page.keyboard.press("Escape");
  await expect(surface).toHaveAttribute("data-step", "choosing");
});

for (const locale of LOCALES) {
  test(`in ${locale} the dialog holds exactly the approved heading, sentence and two centred buttons, inside 1440 x 900 with nothing cut`, async ({
    page,
    seededDesign,
  }) => {
    await openSeededDesign(page, seededDesign, { locale });
    await openTheQuestion(page, BACK);

    const fit = await readDialogFit(page);
    const detail = JSON.stringify(fit);
    const approved = APPROVED_COPY[locale];

    const parts = [fit.title, fit.body, fit.stay, fit.confirm];
    console.log(`DIALOG_FIT back ${locale} ${detail}`);

    expect(parts.map((part) => part.text)).toEqual([
      approved.title,
      approved.body,
      approved.stay,
      approved.confirm,
    ]);
    await expect(page.getByTestId(DIALOG).locator("button")).toHaveCount(2);
    const named = page.getByRole("dialog", {
      name: approved.title,
      exact: true,
    });
    await expect(named).toBeVisible();
    await expect(named).toHaveAccessibleDescription(approved.body);
    expect(fit.title.bottom, detail).toBeLessThanOrEqual(fit.body.top);
    expect(fit.title.fontSizePx, detail).toBeGreaterThan(fit.body.fontSizePx);
    expect(fit.title.fontWeight, detail).toBeGreaterThan(fit.body.fontWeight);
    expect(actionsCentreOffset(fit), detail).toBeLessThanOrEqual(1);
    expect(fit.confirm.left - fit.stay.right, detail).toBe(ACTIONS_GAP_PX);
    for (const box of [fit.dialog, ...parts]) {
      expect(box.left, detail).toBeGreaterThanOrEqual(0);
      expect(box.right, detail).toBeLessThanOrEqual(fit.viewport.width);
      expect(box.top, detail).toBeGreaterThanOrEqual(0);
      expect(box.bottom, detail).toBeLessThanOrEqual(fit.viewport.height);
    }
    for (const part of parts) {
      expect(part.overflowX, detail).toBeLessThanOrEqual(1);
      expect(part.overflowY, detail).toBeLessThanOrEqual(1);
    }
    await captureEvidence(page, `dialog-final-${locale}-1440.png`);
  });

  test(`in ${locale}, at 900, 1024, 1280, 1440 and 1920 px the back control is drawn in the band, nothing in the band overlaps or leaves the viewport, and no protected control is cut`, async ({
    page,
    seededDesign,
  }) => {
    await openSeededDesign(page, seededDesign, { locale });

    for (const width of SWEPT_WIDTHS) {
      await settleAtWidth(page, width);
      const band = await readBand(page);
      const detail = `${locale} at ${String(width)} px: ${JSON.stringify(band)}`;
      console.log(`TOP_BAR_BAND ${detail}`);
      await captureEvidence(page, `band-${locale}-${String(width)}.png`);

      const back = band.drawn.find((control) => control.name === BACK);
      expect(back, detail).toBeDefined();
      for (const control of band.drawn) {
        expect(control.left, detail).toBeGreaterThanOrEqual(-SUB_PIXEL_SLACK);
        expect(control.right, detail).toBeLessThanOrEqual(
          width + SUB_PIXEL_SLACK,
        );
      }
      expect(overlapsIn(band.drawn), detail).toEqual([]);
      expect(band.clipped, detail).toEqual([]);
    }
  });
}

interface NamedBox extends Box {
  readonly name: string;
}

interface Band {
  readonly drawn: readonly NamedBox[];
  readonly clipped: readonly { readonly name: string; readonly by: number }[];
}

async function settleAtWidth(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: SWEPT_HEIGHT });
  await page.waitForFunction(
    (expected) => document.documentElement.clientWidth === expected,
    width,
  );
  await page.waitForFunction((quietMs) => {
    const cell = document.querySelector(
      '[data-testid="global-settings"]',
    )?.parentElement;
    if (!cell) return false;
    const settled = window as unknown as {
      lastTrackWidth?: number;
      settledSince?: number;
    };
    const cellWidth = cell.getBoundingClientRect().width;
    const now = performance.now();
    if (settled.lastTrackWidth !== cellWidth) {
      settled.lastTrackWidth = cellWidth;
      settled.settledSince = now;
      return false;
    }
    return now - (settled.settledSince ?? now) > quietMs;
  }, ROW_QUIET_MS);
}

/** Every control the band draws (a zero box is one the shell hides) and every protected one whose
 *  content overruns its own box. */
async function readBand(page: Page): Promise<Band> {
  return page.evaluate(
    ({ controls, neverClipped }): Band => {
      const named = controls.map((name) => ({
        name,
        element: document.querySelector(`[data-testid="${name}"]`),
      }));
      named.push({
        name: "wordmark",
        element: document.querySelector("main > header > span:nth-child(2)"),
      });
      const drawn = named.flatMap(({ name, element }) => {
        const rect = element?.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) return [];
        return [
          {
            name,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
          },
        ];
      });
      const clipped = neverClipped.flatMap((name) => {
        const element = document.querySelector(`[data-testid="${name}"]`);
        if (!element) throw new Error(`no ${name} on the page`);
        const by = element.scrollWidth - element.clientWidth;
        return by > 1 ? [{ name, by }] : [];
      });
      return { drawn, clipped };
    },
    { controls: BAND_CONTROLS, neverClipped: NEVER_CLIPPED },
  );
}

function overlapsIn(boxes: readonly NamedBox[]): readonly string[] {
  const overlaps: string[] = [];
  for (const [index, first] of boxes.entries()) {
    for (const second of boxes.slice(index + 1)) {
      const isApartSideways =
        first.right <= second.left + SUB_PIXEL_SLACK ||
        second.right <= first.left + SUB_PIXEL_SLACK;
      const isApartVertically =
        first.bottom <= second.top + SUB_PIXEL_SLACK ||
        second.bottom <= first.top + SUB_PIXEL_SLACK;
      if (!isApartSideways && !isApartVertically) {
        overlaps.push(`${first.name} over ${second.name}`);
      }
    }
  }
  return overlaps;
}
