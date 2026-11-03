// The hardware screens at every width a phone or a narrow window can have (320 to 899 px) and across the 1439 / 1440 edge
// where the table begins, in Romanian and Russian, and the row menu from the keyboard. The sweep sets the viewport on a
// pointer browser: it is the layout under test, not touch. Runs under `next dev` and `next start` alike, since it reads
// the fake price book's classes and writes nothing.
//
// The draft is ONE draft in the e2e server's memory, so the file takes the lock the dashboard's specs share.
import {
  countStaffFixturesForTests,
  removeStaffFixturesForTests,
} from "@lemnaria/persistence";
import { expect, type Page } from "@playwright/test";

import {
  boxOf,
  columnTitlesOf,
  editPageOf,
  HETTICH,
  menuButtonOf,
  menuOf,
  openClass,
  openHardwareList,
  openNewClass,
  rateCellOf,
  RATE_FIELDS,
  rateField,
  rowOf,
  STANDARD,
  warmHardwareRoutes,
} from "./support/hardware-page";
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
const NARROW_WIDTHS = [320, 360, 375, 390, 414, 600, 768, 899] as const;
const EDGE_WIDTHS = [1438, 1439, 1440, 1441] as const;
const TABLE_FROM_PX = 1440;
const FILES_TAKE_TURNS_MS = 600_000;
const SUBPIXEL_PX = 1;

let signedIn: SignedInAdministrator;
let rateLimitKeys: readonly string[] = [];

test.beforeAll(async ({ browser }) => {
  test.setTimeout(FILES_TAKE_TURNS_MS);
  await holdPriceDraft();
  signedIn = await plantSignedInAdministrator();
  rateLimitKeys = priceRateLimitKeysOf(signedIn);
  await warmHardwareRoutes(browser, signedIn.administrator);
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
  const broken = await wordsBrokenIn(page.getByTestId("hardware-list"));
  return broken.filter((word) => !word.includes("-"));
}

test.describe("the list at every phone and narrow width", () => {
  for (const locale of LOCALES) {
    test(`${locale}: nothing scrolls sideways or sticks out, all five rates of every card are drawn inside it, no word is cut`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: NARROW_WIDTHS[0], height: HEIGHT });
      await openHardwareList(page, locale);
      for (const width of NARROW_WIDTHS) {
        await page.setViewportSize({ width, height: HEIGHT });
        const title = `${locale} at ${String(width)}`;
        await expectNoSidewaysScroll(page, title);
        expect.soft(await stickingOut(page), title).toEqual([]);
        expect
          .soft(await wordsBrokenInTheList(page), `${title}: broken words`)
          .toEqual([]);
        for (const tierId of [STANDARD, HETTICH]) {
          const row = rowOf(page, tierId);
          const rowBox = await boxOf(row);
          for (const field of RATE_FIELDS) {
            const cell = rateCellOf(row, field);
            await expect
              .soft(cell, `${title}: ${tierId} ${field}`)
              .toBeVisible();
            const box = await boxOf(cell);
            expect
              .soft(box.x, `${title}: ${field} starts inside the card`)
              .toBeGreaterThanOrEqual(rowBox.x - SUBPIXEL_PX);
            expect
              .soft(box.x + box.width, `${title}: ${field} ends inside it`)
              .toBeLessThanOrEqual(rowBox.x + rowBox.width + SUBPIXEL_PX);
            expect
              .soft(
                await cell.evaluate((el) => el.scrollWidth - el.clientWidth),
                `${title}: ${field} is not clipped`,
              )
              .toBeLessThanOrEqual(SUBPIXEL_PX);
          }
        }
      }
    });
  }

  test("the five rates of a card never overlap one another, at any width", async ({
    page,
  }) => {
    await page.setViewportSize({ width: NARROW_WIDTHS[0], height: HEIGHT });
    await openHardwareList(page);
    for (const width of NARROW_WIDTHS) {
      await page.setViewportSize({ width, height: HEIGHT });
      const row = rowOf(page, HETTICH);
      const boxes = await Promise.all(
        RATE_FIELDS.map((field) => boxOf(rateCellOf(row, field))),
      );
      for (const [index, box] of boxes.entries()) {
        for (const other of boxes.slice(index + 1)) {
          const overlapsAcross =
            Math.min(box.x + box.width, other.x + other.width) -
            Math.max(box.x, other.x);
          const overlapsDown =
            Math.min(box.y + box.height, other.y + other.height) -
            Math.max(box.y, other.y);
          expect
            .soft(
              overlapsAcross > SUBPIXEL_PX && overlapsDown > SUBPIXEL_PX,
              `at ${String(width)} two rates share ground`,
            )
            .toBe(false);
        }
      }
    }
  });
});

test.describe("the class page and the new class form at every phone and narrow width", () => {
  for (const locale of LOCALES) {
    test(`${locale}: the five rate fields are inside the screen, nothing scrolls sideways`, async ({
      page,
    }) => {
      const words = wordsOf(locale);
      await page.setViewportSize({ width: NARROW_WIDTHS[0], height: HEIGHT });
      await openClass(page, HETTICH, locale);
      for (const width of NARROW_WIDTHS) {
        await page.setViewportSize({ width, height: HEIGHT });
        const title = `${locale} at ${String(width)}`;
        await expectNoSidewaysScroll(page, title);
        expect.soft(await stickingOut(page), title).toEqual([]);
        await expect(editPageOf(page).locator("input[type=text]")).toHaveCount(
          RATE_FIELDS.length,
        );
        for (const field of RATE_FIELDS) {
          const box = await boxOf(rateField(page, words, field));
          expect
            .soft(box.x + box.width, `${title}: ${field} inside the screen`)
            .toBeLessThanOrEqual(width);
        }
      }
    });
  }

  test("ro: the new class form holds nothing wider than the screen", async ({
    page,
  }) => {
    await page.setViewportSize({ width: NARROW_WIDTHS[0], height: HEIGHT });
    await openNewClass(page);
    for (const width of NARROW_WIDTHS) {
      await page.setViewportSize({ width, height: HEIGHT });
      await expectNoSidewaysScroll(page, `new class at ${String(width)}`);
      expect
        .soft(await stickingOut(page), `new class at ${String(width)}`)
        .toEqual([]);
    }
  });
});

test.describe("either side of the table's first width", () => {
  for (const locale of LOCALES) {
    test(`${locale}: ${String(EDGE_WIDTHS[0])} to ${String(EDGE_WIDTHS[3])} px scroll nowhere, and the table's titles and one line of five rates begin exactly at ${String(TABLE_FROM_PX)}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: EDGE_WIDTHS[0], height: HEIGHT });
      await openHardwareList(page, locale);
      for (const width of EDGE_WIDTHS) {
        await page.setViewportSize({ width, height: HEIGHT });
        const title = `${locale} at ${String(width)}`;
        await expectNoSidewaysScroll(page, title);
        expect.soft(await stickingOut(page), title).toEqual([]);
        expect
          .soft(await wordsBrokenInTheList(page), `${title}: broken words`)
          .toEqual([]);
        const isTable = width >= TABLE_FROM_PX;
        if (isTable) {
          await expect
            .soft(columnTitlesOf(page), `${title}: the table's titles`)
            .toBeVisible();
        } else {
          await expect
            .soft(columnTitlesOf(page), `${title}: the card has no titles`)
            .toBeHidden();
        }
        for (const tierId of [STANDARD, HETTICH]) {
          const row = rowOf(page, tierId);
          const tops = await Promise.all(
            RATE_FIELDS.map(async (field) =>
              Math.round((await boxOf(rateCellOf(row, field))).y),
            ),
          );
          if (isTable) {
            expect
              .soft(new Set(tops).size, `${title}: ${tierId} on one line`)
              .toBe(1);
          }
        }
      }
    });
  }
});

test.describe("the row menu from the keyboard", () => {
  for (const width of [390, 1440]) {
    test(`at ${String(width)} px Enter and Space open it, Escape closes it with focus back on the dots, and another row's dots take over`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: HEIGHT });
      await openHardwareList(page);
      const dots = menuButtonOf(rowOf(page, HETTICH));

      await dots.focus();
      await page.keyboard.press("Enter");
      await expect(menuOf(rowOf(page, HETTICH))).toBeVisible();
      await expect(dots).toHaveAttribute("aria-expanded", "true");

      await page.keyboard.press("Escape");
      await expect(menuOf(rowOf(page, HETTICH))).toHaveCount(0);
      await expect(dots).toBeFocused();

      await page.keyboard.press("Space");
      await expect(menuOf(rowOf(page, HETTICH))).toBeVisible();

      await menuButtonOf(rowOf(page, STANDARD)).click();
      await expect(menuOf(rowOf(page, STANDARD))).toBeVisible();
      await expect(menuOf(rowOf(page, HETTICH))).toHaveCount(0);
      await expect(page.locator("button[aria-expanded=true]")).toHaveCount(1);
    });
  }

  test("a press on the page's empty space leaves the menu open until the click is over, then closes it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: HEIGHT });
    await openHardwareList(page);
    await menuButtonOf(rowOf(page, HETTICH)).click();
    await expect(menuOf(rowOf(page, HETTICH))).toBeVisible();

    await page.mouse.move(8, 8);
    await page.mouse.down();
    await expect(menuOf(rowOf(page, HETTICH))).toBeVisible();
    await page.mouse.up();

    await expect(menuOf(rowOf(page, HETTICH))).toHaveCount(0);
  });
});
