// The accessory screens at every width a phone or a window can have (320 to 1920 px), in Romanian and Russian, and across
// the 1099 / 1100 edge where the table begins. The sweep sets the viewport on a pointer browser: it is the layout under test,
// not touch. Runs under `next dev` and `next start` alike, since it reads the fake price book's accessories and writes
// nothing.
//
// WHERE THE TABLE BEGINS, AND HOW IT WAS MEASURED. With the table forced on from 900 px, the Russian list held every title
// whole and every word of every rule unbroken from a layout width of 1060 px, Romanian from 1000 px (page width sweep in
// steps of 20 px, `overflowingBoxes`, `wordsBrokenIn`, and each title's text against its box). A classic scrollbar takes up
// to 20 px of the layout without moving the width the media query reads, so the table begins at 1100: a window of that width
// with a scrollbar still has a layout of 1080, which the last test holds.
//
// The draft is ONE draft in the e2e server's memory, so the file takes the lock the dashboard's specs share.
import {
  countStaffFixturesForTests,
  removeStaffFixturesForTests,
} from "@lemnaria/persistence";
import { expect, type Page } from "@playwright/test";

import {
  BUILT_IN_ACCESSORIES,
  columnTitlesOf,
  createPageOf,
  DRYING_RACK,
  editPageOf,
  earningCellOf,
  menuButtonOf,
  menuOf,
  openAccessory,
  openAccessoryList,
  openNewAccessory,
  priceCellOf,
  priceField,
  rowOf,
  warmAccessoryRoutes,
} from "./support/accessory-page";
import { boxOf, overflowingBoxes } from "./support/hardware-page";
import { clippedTitles, overlappingTitles } from "./support/item-list-geometry";
import {
  discardDraft,
  expectNoSidewaysScroll,
  priceRateLimitKeysOf,
  test,
} from "./support/price-dashboard-session";
import { holdPriceDraft, releasePriceDraft } from "./support/price-draft-lock";
import { stickingOut, wordsBrokenIn, wordsOf } from "./support/publish-page";
import {
  NOTHING_LEFT,
  plantSignedInAdministrator,
  signIn,
  type SignedInAdministrator,
} from "./support/staff-world";

const LOCALES = ["ro", "ru"] as const;
const HEIGHT = 900;
const LIST = "accessory-list";
const NARROW_WIDTHS = [
  320, 360, 375, 390, 414, 600, 768, 899, 900, 1024, 1099,
] as const;
const EDGE_WIDTHS = [1098, 1099, 1100, 1101] as const;
const TABLE_WIDTHS = [1100, 1180, 1200, 1280, 1440, 1600, 1920] as const;
const TABLE_FROM_PX = 1100;
/** What a classic vertical scrollbar leaves of a window: the media query still reads the window, the layout is narrower. */
const SCROLLBAR_PX = 20;
const FILES_TAKE_TURNS_MS = 600_000;
const SUBPIXEL_PX = 1;

let signedIn: SignedInAdministrator;
let rateLimitKeys: readonly string[] = [];

test.beforeAll(async ({ browser }) => {
  test.setTimeout(FILES_TAKE_TURNS_MS);
  await holdPriceDraft();
  signedIn = await plantSignedInAdministrator();
  rateLimitKeys = priceRateLimitKeysOf(signedIn);
  await warmAccessoryRoutes(browser, signedIn.administrator);
});

test.afterAll(async () => {
  releasePriceDraft();
  const scope = { rateLimitKeys };
  await removeStaffFixturesForTests(signedIn.marker, scope);
  const left = await countStaffFixturesForTests(signedIn.marker, scope);
  expect(left, "rows left behind").toEqual(NOTHING_LEFT);
});

test.beforeEach(async ({ context }) => {
  await signIn(context, signedIn.administrator);
  await discardDraft(context);
});

test.afterEach(async ({ context }) => {
  await discardDraft(context);
});

/** Whether every word of the list reads on one line; a hyphenated name may wrap at its hyphen. */
async function wordsBrokenInTheList(page: Page): Promise<string[]> {
  const broken = await wordsBrokenIn(page.getByTestId(LIST));
  return broken.filter((word) => !word.includes("-"));
}

/** Everything that must hold of the list at the width it is drawn at. */
async function expectListFits(page: Page, title: string): Promise<void> {
  await expectNoSidewaysScroll(page, title);
  expect.soft(await stickingOut(page), `${title}: sticking out`).toEqual([]);
  expect
    .soft(
      await overflowingBoxes(page, LIST),
      `${title}: text wider than its box`,
    )
    .toEqual([]);
  expect
    .soft(await wordsBrokenInTheList(page), `${title}: broken words`)
    .toEqual([]);
}

async function expectTableHolds(page: Page, title: string): Promise<void> {
  await expect
    .soft(columnTitlesOf(page), `${title}: the table's titles`)
    .toBeVisible();
  expect
    .soft(await clippedTitles(page, LIST), `${title}: titles cut off`)
    .toEqual([]);
  expect
    .soft(
      await overlappingTitles(page, LIST),
      `${title}: titles run into each other`,
    )
    .toEqual([]);
  for (const accessoryId of BUILT_IN_ACCESSORIES) {
    const row = rowOf(page, accessoryId);
    const rule = await boxOf(earningCellOf(row));
    const price = await boxOf(priceCellOf(row));
    expect
      .soft(price.x, `${title}: ${accessoryId} price beside its rule`)
      .toBeGreaterThanOrEqual(rule.x + rule.width - SUBPIXEL_PX);
  }
}

test.describe("the list at every phone and narrow width, up to the table", () => {
  for (const locale of LOCALES) {
    test(`${locale}: nothing scrolls sideways or sticks out, no card is cut and no word is broken, from ${String(NARROW_WIDTHS[0])} to ${String(TABLE_FROM_PX - 1)} px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: NARROW_WIDTHS[0], height: HEIGHT });
      await openAccessoryList(page, locale);
      for (const width of NARROW_WIDTHS) {
        await page.setViewportSize({ width, height: HEIGHT });
        const title = `${locale} at ${String(width)}`;
        await expectListFits(page, title);
        await expect
          .soft(columnTitlesOf(page), `${title}: a card has no titles`)
          .toBeHidden();
        for (const accessoryId of BUILT_IN_ACCESSORIES) {
          const row = await boxOf(rowOf(page, accessoryId));
          expect
            .soft(
              row.x + row.width,
              `${title}: ${accessoryId} inside the screen`,
            )
            .toBeLessThanOrEqual(width);
        }
      }
    });
  }

  test("the cards' menu stays inside the screen at every width, and opening it moves no card", async ({
    page,
  }) => {
    await openAccessoryList(page, "ru");
    for (const width of [320, 390, 899, 1099] as const) {
      await page.setViewportSize({ width, height: HEIGHT });
      const first = rowOf(page, BUILT_IN_ACCESSORIES[0]);
      await menuButtonOf(first).scrollIntoViewIfNeeded();
      await menuButtonOf(first).click();
      const menu = await boxOf(menuOf(first));
      expect
        .soft(menu.x, `${String(width)}: left edge`)
        .toBeGreaterThanOrEqual(0);
      expect
        .soft(menu.x + menu.width, `${String(width)}: right edge`)
        .toBeLessThanOrEqual(width);
      await expectNoSidewaysScroll(page, `menu open at ${String(width)}`);
      await menuButtonOf(first).click();
    }
  });
});

test.describe("an accessory's page and the new-accessory form at every width", () => {
  for (const locale of LOCALES) {
    test(`${locale}: the price field and the form's fields are inside the screen, nothing scrolls sideways`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: HEIGHT });
      await openAccessory(page, DRYING_RACK, locale);
      for (const width of [
        320, 390, 899, 1100, 1199, 1200, 1440, 1920,
      ] as const) {
        await page.setViewportSize({ width, height: HEIGHT });
        const title = `${locale} page at ${String(width)}`;
        await expectNoSidewaysScroll(page, title);
        expect.soft(await stickingOut(page), title).toEqual([]);
        const field = await boxOf(priceField(page, wordsOf(locale)));
        expect
          .soft(field.x + field.width, `${title}: the price field`)
          .toBeLessThanOrEqual(width);
        expect.soft(await boxOf(editPageOf(page))).toBeTruthy();
      }
      await openNewAccessory(page, locale);
      for (const width of [320, 390, 899, 1200, 1920] as const) {
        await page.setViewportSize({ width, height: HEIGHT });
        const title = `${locale} form at ${String(width)}`;
        await expectNoSidewaysScroll(page, title);
        expect.soft(await stickingOut(page), title).toEqual([]);
        const form = await boxOf(createPageOf(page));
        expect.soft(form.x + form.width, title).toBeLessThanOrEqual(width);
      }
    });
  }
});

test.describe("either side of the table's first width", () => {
  for (const locale of LOCALES) {
    test(`${locale}: ${String(EDGE_WIDTHS[0])} to ${String(EDGE_WIDTHS[3])} px scroll nowhere, and the table's titles begin exactly at ${String(TABLE_FROM_PX)}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: EDGE_WIDTHS[0], height: HEIGHT });
      await openAccessoryList(page, locale);
      for (const width of EDGE_WIDTHS) {
        await page.setViewportSize({ width, height: HEIGHT });
        const title = `${locale} at ${String(width)}`;
        await expectListFits(page, title);
        if (width >= TABLE_FROM_PX) {
          await expectTableHolds(page, title);
        } else {
          await expect
            .soft(columnTitlesOf(page), `${title}: the card has no titles`)
            .toBeHidden();
        }
      }
    });
  }
});

test.describe("the table at every width it is drawn at", () => {
  for (const locale of LOCALES) {
    test(`${locale}: from ${String(TABLE_WIDTHS[0])} to ${String(TABLE_WIDTHS.at(-1))} px every title is whole, no title runs into the next, no word is broken and nothing scrolls sideways`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: TABLE_WIDTHS[0], height: HEIGHT });
      await openAccessoryList(page, locale);
      for (const width of TABLE_WIDTHS) {
        await page.setViewportSize({ width, height: HEIGHT });
        const title = `${locale} at ${String(width)}`;
        await expectListFits(page, title);
        await expectTableHolds(page, title);
      }
    });
  }
});

test.describe("the table in a window whose classic scrollbar takes layout width", () => {
  for (const locale of LOCALES) {
    for (const viewport of [TABLE_FROM_PX, 1440] as const) {
      test(`${locale}: at a viewport of ${String(viewport)} px but a layout of ${String(viewport - SCROLLBAR_PX)} px, the table holds every word and title in its own box`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: viewport, height: HEIGHT });
        await openAccessoryList(page, locale);
        // A scrollbar narrows the page, not the viewport the media query reads; the headless browser draws none.
        await page.addStyleTag({
          content: `html { width: ${String(viewport - SCROLLBAR_PX)}px; }`,
        });

        await expectTableHolds(
          page,
          `${locale} at ${String(viewport)} with a scrollbar`,
        );
        expect(await overflowingBoxes(page, LIST)).toEqual([]);
        expect(await wordsBrokenInTheList(page)).toEqual([]);
        for (const accessoryId of BUILT_IN_ACCESSORIES) {
          const row = await boxOf(rowOf(page, accessoryId));
          expect(row.x + row.width).toBeLessThanOrEqual(
            viewport - SCROLLBAR_PX + SUBPIXEL_PX,
          );
        }
      });
    }
  }
});
