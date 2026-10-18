// The file is named `w-qa-…` on purpose: Playwright's partition assigns whole files in name order to the shard with the fewest
// tests so far, and `qa-m8d-…` lands on desktop shard 2, which is at its ceiling of 67 (backlog 266); this name lands on shard 3
// (61 + 2 = 63 of 67). If the desktop line is re-sharded, rename it `qa-m8d-preset-screens…`.
// M8D waves W1 and W2, adversarial QA at desktop width (the desktop project, 1440 x 900, then 1280 x 720 inside the
// same test so that the desktop shards gain two tests, not three): L-9 (D1E's four columns), L-4's desktop clause, C-3 and
// C-4 (D1G's 880 px pop-up, its 440 px image, the single action row, the 720 px window), and the DOM-order Tab ring
// (owner answer O-2). The library and the mint are faked by route interception: no database row is read or written.
// The phone half is `qa-m8d-preset-list.adversarial.e2e.spec.ts` and `qa-m8d-preview-popup.adversarial.e2e.spec.ts`.
import { expect, test, type Page } from "@playwright/test";

import {
  boxOf,
  expectPictureShownWhole,
  fakeLibraryOn,
  offersNamed,
  openPreviewOf,
  openTheList,
  type Box,
  type FakeOffer,
} from "./support/qa-m8d-presets";

const DESKTOP = { width: 1440, height: 900 };
const SHORT_WINDOW = { width: 1280, height: 720 };
const ONE_PIXEL = 1;
const FOUR_BY_THREE = 4 / 3;
const COLUMNS = 4;
const GRID_GAP_PX = 20;
const CARD_NAME_PX = 17;
const DIALOG_WIDTH_PX = 880;
const IMAGE_BOX_HEIGHT_PX = 440;
const SELECT_MIN_WIDTH_PX = 260;
const SELECT_MIN_HEIGHT_PX = 52;
const MAX_NAME = "W".repeat(80);

test.describe("Step 1's preset screens at desktop width (M8D W1, W2)", () => {
  test("L-9, L-4 and C-3 to C-4 in ro: four top-aligned columns with a 20 px gap, an 880 px pop-up with a 440 px image that gives up height before Select leaves a 720 px window", async ({
    page,
  }) => {
    expect(page.viewportSize()).toEqual(DESKTOP);
    const names = Array.from(
      { length: 8 },
      (_, position) => `Preset ${String(position + 1)}`,
    );
    const offers: FakeOffer[] = offersNamed(names).map((offer, position) =>
      position === 1 ? { ...offer, image: "wide" } : offer,
    );
    const library = await fakeLibraryOn(page, offers);
    await openTheList(page);

    await expectFourColumnGrid(page);
    await expectALongNameLeavesItsRowAlone(page);

    await openPreviewOf(page, 2);
    await expectDesktopPopup(page, DESKTOP);
    await expectTabOrderIsTheDocumentOrder(page);

    await page.setViewportSize(SHORT_WINDOW);
    await expectDesktopPopup(page, SHORT_WINDOW);
    await expectNothingCropped(page);
    expect(library.unexpectedWrites).toEqual([]);
  });

  test("C-3 in ru: the pop-up's one action row keeps Previous at the left edge, Select centred and Next at the right edge at 880 px", async ({
    page,
  }) => {
    const library = await fakeLibraryOn(
      page,
      offersNamed(["Unu", "Doi", "Trei"]),
    );
    await openTheList(page, "ru");
    await openPreviewOf(page, 2);

    await expectActionRowAcrossTheDialog(page);
    await expectDesktopPopup(page, DESKTOP);
    expect(library.unexpectedWrites).toEqual([]);
  });
});

// Helpers

/** L-9: four columns, a 20 px gap both ways, cards aligned to their row's top, a 17 px name. */
async function expectFourColumnGrid(page: Page): Promise<void> {
  const list = page.getByTestId("room-presets-list");
  const style = await list.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      columns: computed.gridTemplateColumns.split(" ").length,
      columnGap: computed.columnGap,
      rowGap: computed.rowGap,
      alignItems: computed.alignItems,
    };
  });
  const cards = await page.getByTestId("room-preset-card").all();
  const boxes = await Promise.all(cards.map((card) => boxOf(card)));

  expect(style).toEqual({
    columns: COLUMNS,
    columnGap: `${String(GRID_GAP_PX)}px`,
    rowGap: `${String(GRID_GAP_PX)}px`,
    alignItems: "start",
  });
  expect(boxes.slice(0, COLUMNS).map((box) => Math.round(box.y))).toEqual(
    Array(COLUMNS).fill(Math.round(boxes[0]?.y ?? 0)),
  );
  expect(
    new Set(boxes.slice(0, COLUMNS).map((box) => Math.round(box.x))).size,
  ).toBe(COLUMNS);
  expect(
    Math.round(
      (boxes[1]?.x ?? 0) - ((boxes[0]?.x ?? 0) + (boxes[0]?.width ?? 0)),
    ),
  ).toBe(GRID_GAP_PX);
  expect(
    Math.round(
      (boxes[COLUMNS]?.y ?? 0) - ((boxes[0]?.y ?? 0) + (boxes[0]?.height ?? 0)),
    ),
  ).toBeGreaterThanOrEqual(GRID_GAP_PX);
  expect(
    await cards[0]
      ?.locator("h3")
      .evaluate((name) => getComputedStyle(name).fontSize),
  ).toBe(`${String(CARD_NAME_PX)}px`);
}

/** L-4, desktop clause: an 80-character unbroken name grows its own card and changes no other card's height. */
async function expectALongNameLeavesItsRowAlone(page: Page): Promise<void> {
  const cards = page.getByTestId("room-preset-card");
  const before = await Promise.all(
    [0, 1, 2, 3].map(
      async (position) => (await boxOf(cards.nth(position))).height,
    ),
  );

  await cards
    .nth(0)
    .locator("h3")
    .evaluate((name, longName) => {
      name.textContent = longName;
    }, MAX_NAME);
  const after = await Promise.all(
    [0, 1, 2, 3].map(
      async (position) => (await boxOf(cards.nth(position))).height,
    ),
  );

  expect(after[0]).toBeGreaterThan(before[0] ?? 0);
  expect(after.slice(1)).toEqual(before.slice(1));
  expect(await hasSidewaysOverflow(page)).toBe(false);
}

/** C-4 (D1G): 880 px wide when the window allows, centred both ways, a 4:3 image box, one action row, no scrolling. */
async function expectDesktopPopup(
  page: Page,
  viewport: { readonly width: number; readonly height: number },
): Promise<void> {
  const dialog = await boxOf(page.getByTestId("preset-carousel-dialog"));
  const slide = await boxOf(page.getByTestId("preset-carousel-slide"));
  const select = await boxOf(page.getByTestId("preset-carousel-select"));
  const image = await boxOf(
    page.getByTestId("preset-carousel-slide").locator("img:visible").first(),
  );

  expect(Math.abs(dialog.width - DIALOG_WIDTH_PX)).toBeLessThanOrEqual(
    ONE_PIXEL,
  );
  expect(
    Math.abs(dialog.x + dialog.width / 2 - viewport.width / 2),
  ).toBeLessThanOrEqual(ONE_PIXEL);
  expect(
    Math.abs(dialog.y + dialog.height / 2 - viewport.height / 2),
  ).toBeLessThanOrEqual(ONE_PIXEL);
  expect(
    Math.abs(slide.x + slide.width / 2 - (dialog.x + dialog.width / 2)),
  ).toBeLessThanOrEqual(ONE_PIXEL);
  expect(
    Math.abs(image.height - image.width / FOUR_BY_THREE),
  ).toBeLessThanOrEqual(ONE_PIXEL);
  expect(select.y).toBeGreaterThanOrEqual(0);
  expect(select.y + select.height).toBeLessThanOrEqual(viewport.height);
  expect(
    await page
      .getByTestId("preset-carousel-dialog")
      .evaluate((element) => element.scrollHeight <= element.clientHeight),
  ).toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  // The image box is the bordered frame the stylesheet gives 440 px; the picture inside it is two borders smaller.
  if (viewport.height === DESKTOP.height) {
    expect(Math.abs(slide.height - IMAGE_BOX_HEIGHT_PX)).toBeLessThanOrEqual(
      ONE_PIXEL,
    );
  } else {
    expect(slide.height).toBeLessThan(IMAGE_BOX_HEIGHT_PX);
  }
  await expectActionRowAcrossTheDialog(page);
}

/** C-3, at 900 px and wider: Previous at the left edge, Select centred (>= 260 x 52), Next at the right edge. */
async function expectActionRowAcrossTheDialog(page: Page): Promise<void> {
  const previous = await boxOf(page.getByTestId("preset-carousel-previous"));
  const select = await boxOf(page.getByTestId("preset-carousel-select"));
  const next = await boxOf(page.getByTestId("preset-carousel-next"));
  const row = await boxOf(
    page.getByTestId("preset-carousel-select").locator(".."),
  );

  expect(Math.abs(previous.x - row.x)).toBeLessThanOrEqual(ONE_PIXEL);
  expect(
    Math.abs(next.x + next.width - (row.x + row.width)),
  ).toBeLessThanOrEqual(ONE_PIXEL);
  expect(
    Math.abs(select.x + select.width / 2 - (row.x + row.width / 2)),
  ).toBeLessThanOrEqual(ONE_PIXEL);
  expect(select.width).toBeGreaterThanOrEqual(SELECT_MIN_WIDTH_PX);
  expect(select.height).toBeGreaterThanOrEqual(SELECT_MIN_HEIGHT_PX);
  expect(
    Math.abs(previous.y - select.y - (select.height - previous.height) / 2),
  ).toBeLessThanOrEqual(ONE_PIXEL + 1);
  expect(Math.abs(previous.y - next.y)).toBeLessThanOrEqual(ONE_PIXEL);
  expect(previous.x + previous.width).toBeLessThan(select.x);
  expect(select.x + select.width).toBeLessThan(next.x);
}

/** Owner answer O-2 (a): Tab goes x, Previous, Next, Select on every screen, whatever the grid draws. */
async function expectTabOrderIsTheDocumentOrder(page: Page): Promise<void> {
  await page.keyboard.press("Tab");
  const visited: (string | null)[] = [];
  for (let press = 0; press < 4; press += 1) {
    visited.push(
      await page.evaluate(
        () => document.activeElement?.getAttribute("data-testid") ?? null,
      ),
    );
    await page.keyboard.press("Tab");
  }

  expect(visited).toEqual([
    "preset-carousel-close",
    "preset-carousel-previous",
    "preset-carousel-next",
    "preset-carousel-select",
  ]);
}

/** C-4 at 1280 x 720: the shrunken image is still the whole picture. */
async function expectNothingCropped(page: Page): Promise<void> {
  const frame = page
    .getByTestId("preset-carousel-slide")
    .locator("img:visible")
    .first();
  await frame.scrollIntoViewIfNeeded();
  const box: Box = await boxOf(frame);

  expect(
    await frame.evaluate((element) => getComputedStyle(element).objectFit),
  ).toBe("contain");
  expect(Math.abs(box.height - box.width / FOUR_BY_THREE)).toBeLessThanOrEqual(
    ONE_PIXEL,
  );
  await expectPictureShownWhole(page, box, "wide");
}

async function hasSidewaysOverflow(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
}
