// The accessory screens at desktop 1440, against frames D6A to D6C of the dashboard mockup
// (docs/design/mockups/Lemnaria Dashboard.dc.html), with a pointer and a keyboard: the table, the two-column page, the
// row's menu and the question before a switch. The widths either side of the table's first width are
// `accessories.widths.desktop.e2e.spec.ts`'s.
//
// WHICH SERVER THIS FILE HOLDS ON, and what each gives these pages, is written at the head of `support/accessory-page.ts`:
// the list, a price's Save and a reload run under BOTH; the dialogs need the sample lifecycle that only `next dev` draws,
// and the off controls are what `next start` draws. The draft is ONE draft in the e2e server's memory, so every test starts
// and ends by emptying it and the file takes the lock the dashboard's specs share.
import {
  countStaffFixturesForTests,
  removeStaffFixturesForTests,
} from "@lemnaria/persistence";
import { expect } from "@playwright/test";

import {
  ACCESSORY_NAME_KEY,
  activePriceOf,
  activeSwitch,
  BUILT_IN_ACCESSORIES,
  chipsOf,
  columnTitlesOf,
  deleteAccessoryButton,
  DRYING_RACK,
  DRYING_RACK_SAVED_KITCHENS,
  earningCellOf,
  editPageOf,
  menuButtonOf,
  menuEntryOf,
  menuOf,
  openAccessory,
  openAccessoryList,
  priceCellOf,
  priceField,
  rowOf,
  rowsOf,
  savePriceButton,
  SINK_COVER,
  warmAccessoryRoutes,
} from "./support/accessory-page";
import {
  collectWrites,
  expectPendingCount,
} from "./support/cabinet-detail-page";
import {
  baniOf,
  boxOf,
  CI_ONLY_REASON,
  collectDashboardRequests,
  DEV_ONLY_REASON,
  draftChanges,
  focusedName,
  itemDialogOf,
  PROMISES_PUBLICATION,
  SAYS_SAVED_KITCHENS_USE_IT,
  SERVER_IS_PRODUCTION_BUILD,
} from "./support/hardware-page";
import { isTopmostAtCentre } from "./support/item-list-geometry";
import {
  discardDraft,
  expectNoSidewaysScroll,
  priceRateLimitKeysOf,
  test,
} from "./support/price-dashboard-session";
import { holdPriceDraft, releasePriceDraft } from "./support/price-draft-lock";
import { plainText, stickingOut, wordsOf } from "./support/publish-page";
import { shootForReview } from "./support/staff-pages";
import {
  NOTHING_LEFT,
  plantSignedInAdministrator,
  romanian,
  signIn,
  type SignedInAdministrator,
} from "./support/staff-world";
import { formatLei } from "../../src/price-dashboard/format-lei";

const DESKTOP = { width: 1440, height: 900 } as const;
const LOCALES = ["ro", "ru"] as const;
const ALIGNMENT_TOLERANCE_PX = 1;
/** A dialog centred in the viewport is off true centre by at most the width a scrollbar would take. */
const CENTRE_SLACK_PX = 16;
const FILES_TAKE_TURNS_MS = 600_000;
const RACK_NAME = romanian(ACCESSORY_NAME_KEY[DRYING_RACK] ?? "brand");
const CANCEL = () => romanian("priceDashboard.common.cancel");
const CONFIRM_SWITCH_OFF = () =>
  romanian("priceDashboard.lifecycle.deactivateConfirm");
const CONFIRM_SWITCH_ON = () =>
  romanian("priceDashboard.lifecycle.activateConfirm");

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
  const removed = await removeStaffFixturesForTests(signedIn.marker, scope);
  const left = await countStaffFixturesForTests(signedIn.marker, scope);
  expect(
    removed.rateLimitCounters,
    "the price routes' counters were found under the keys computed here, so they are the server's",
  ).toBeGreaterThan(0);
  expect(left, "rows left behind").toEqual(NOTHING_LEFT);
});

test.beforeEach(async ({ context }) => {
  await signIn(context, signedIn.administrator);
  await discardDraft(context);
});

test.afterEach(async ({ context }) => {
  await discardDraft(context);
});

test.describe("the accessory screens at desktop 1440", () => {
  test.beforeEach(({ page }) => {
    expect(page.viewportSize(), "the viewport this project asked for").toEqual(
      DESKTOP,
    );
  });

  test.describe("D6A: the table, under either server", () => {
    test("the table has a title for the accessory, the rule, the price and the state, each over its own figures; RO and RU", async ({
      page,
    }) => {
      for (const locale of LOCALES) {
        const words = wordsOf(locale);
        await openAccessoryList(page, locale);

        const titles = columnTitlesOf(page).locator("span");
        await expect(
          titles,
          `${locale}: five titles, the last blank`,
        ).toHaveCount(5);
        await expect(titles.nth(0)).toHaveText(
          words("priceDashboard.accessories.columnAccessory"),
        );
        await expect(titles.nth(1)).toHaveText(
          words("priceDashboard.accessories.columnAddedTo"),
        );
        await expect(titles.nth(2)).toHaveText(
          words("priceDashboard.accessories.columnPrice"),
        );
        await expect(titles.nth(3)).toHaveText(
          words("priceDashboard.accessories.columnState"),
        );
        await expect(rowsOf(page)).toHaveCount(2);
        for (const accessoryId of BUILT_IN_ACCESSORIES) {
          const row = rowOf(page, accessoryId);
          const rule = await boxOf(earningCellOf(row));
          const price = await boxOf(priceCellOf(row));
          expect(
            Math.abs((await boxOf(titles.nth(1))).x - rule.x),
            `${locale} ${accessoryId}: the rule starts under its title`,
          ).toBeLessThanOrEqual(ALIGNMENT_TOLERANCE_PX);
          expect(
            Math.abs((await boxOf(titles.nth(2))).x - price.x),
            `${locale} ${accessoryId}: the price starts under its title`,
          ).toBeLessThanOrEqual(ALIGNMENT_TOLERANCE_PX);
          expect(
            baniOf(await priceCellOf(row).locator("span").nth(1).innerText()),
            `${locale} ${accessoryId}: the book's price`,
          ).toBe(activePriceOf(accessoryId));
        }
        await expect(earningCellOf(rowOf(page, SINK_COVER))).toContainText(
          words("priceDashboard.accessories.ruleSinkCover"),
        );
        await expect(earningCellOf(rowOf(page, DRYING_RACK))).toContainText(
          words("priceDashboard.accessories.ruleDryingRack"),
        );
        await expect(
          rowsOf(page).locator("input, textarea, select"),
          "a price is changed on the accessory's page, not in the table",
        ).toHaveCount(0);
        await expectNoSidewaysScroll(page, `${locale} table`);
        expect(await stickingOut(page), `${locale} table`).toEqual([]);
        await shootForReview(page, `1440-d6a-list-${locale}`);
      }
    });
  });

  test.describe("an accessory's page, under either server", () => {
    test("the page stands in two columns, the words and the switch on the left and the price on the right; a price is saved by the pointer and a reload keeps it", async ({
      page,
    }) => {
      const words = wordsOf("ro");
      await openAccessory(page, DRYING_RACK);
      const writes = collectWrites(page);

      const left = await boxOf(
        editPageOf(page).getByText(
          romanian("priceDashboard.accessories.nameLabel"),
          { exact: true },
        ),
      );
      const right = await boxOf(priceField(page, words));
      expect(right.x, "the price is in the right column").toBeGreaterThan(
        left.x + left.width,
      );
      await shootForReview(page, "1440-d6b-rack");
      await priceField(page, words).fill("700");
      await savePriceButton(page, words).click();

      await expect(
        editPageOf(page).getByText(
          romanian("priceDashboard.common.priceSavedNotice"),
        ),
      ).toBeVisible();
      expect(writes).toEqual(["PUT /api/staff/prices/draft"]);
      await expectPendingCount(page, 1);
      expect(
        (await draftChanges(page)).map(({ address, value }) => [
          (address as { accessoryId?: string }).accessoryId,
          address.field,
          value,
        ]),
      ).toEqual([[DRYING_RACK, "perUnitMinor", 70_000]]);
      await openAccessory(page, DRYING_RACK);
      await expect(priceField(page, words)).toHaveValue("700");
      await expect(editPageOf(page)).toContainText(
        romanian("priceDashboard.common.activeValue", {
          amount: formatLei(
            activePriceOf(DRYING_RACK),
            romanian("priceDashboard.units.currency"),
          ),
        }),
      );
      await shootForReview(page, "1440-d6b-saved");
      await priceField(page, words).fill(
        String(activePriceOf(DRYING_RACK) / 100),
      );
      await savePriceButton(page, words).click();
      await expect
        .poll(async () => (await draftChanges(page)).length, {
          message: "typing the active price back empties the draft",
        })
        .toBe(0);
    });

    test("a refused price says why in Russian too, and Save stays off", async ({
      page,
    }) => {
      const words = wordsOf("ru");
      await openAccessory(page, SINK_COVER, "ru");

      await priceField(page, words).fill("125,50");

      await expect(priceField(page, words)).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      await expect(editPageOf(page)).toContainText(
        words("priceDashboard.errors.notMultipleOfTen", {
          step: "10",
          example: "450",
        }),
      );
      await expect(savePriceButton(page, words)).toBeDisabled();
      await shootForReview(page, "1440-d6b-refused-ru");
    });

    test("a built-in's page is the catalogue's: its rule and note are said, its name is no field, and its deletion is off", async ({
      page,
    }) => {
      const words = wordsOf("ro");
      await openAccessory(page, SINK_COVER);

      await expect(editPageOf(page)).toContainText(
        words("priceDashboard.accessories.ruleSinkCover"),
      );
      await expect(editPageOf(page)).toContainText(
        words("priceDashboard.accessories.builtInNote"),
      );
      await expect(editPageOf(page).locator("input[type=text]")).toHaveCount(1);
      await expect(deleteAccessoryButton(page, words)).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await shootForReview(page, "1440-d6b-cover");
    });
  });

  test.describe("the row's menu, under either server", () => {
    test("the pointer opens the menu, Escape closes it and puts focus back on the three dots, and a click outside closes it; the delete entry is off with the catalogue's words", async ({
      page,
    }) => {
      const words = wordsOf("ro");
      await openAccessoryList(page);
      const row = rowOf(page, SINK_COVER);
      const more = menuButtonOf(row);

      await more.click();

      await expect(menuOf(row)).toBeVisible();
      await expect(menuEntryOf(row, words, "delete")).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await expect(row.getByTestId("menu-reason").last()).toHaveText(
        romanian("priceDashboard.lifecycle.builtInAccessoryCannotBeDeleted"),
      );
      await shootForReview(page, "1440-d6a-menu");
      await page.keyboard.press("Escape");
      await expect(menuOf(row)).toHaveCount(0);
      expect(await focusedName(page)).toContain(
        romanian("priceDashboard.common.moreActionsFor", {
          name: romanian(ACCESSORY_NAME_KEY[SINK_COVER] ?? "brand"),
        }),
      );
      await more.click();
      await page.getByRole("heading", { level: 1 }).click();
      await expect(menuOf(row), "a click outside closes it").toHaveCount(0);
    });

    test("the menu is a popover over the rows: it moves no row and keeps the next row's three dots free", async ({
      page,
    }) => {
      await openAccessoryList(page);
      const first = rowOf(page, SINK_COVER);
      const second = rowOf(page, DRYING_RACK);
      const before = (await boxOf(second)).y - (await boxOf(first)).y;

      await menuButtonOf(first).click();

      expect((await boxOf(second)).y - (await boxOf(first)).y).toBe(before);
      expect(await isTopmostAtCentre(menuButtonOf(second))).toBe(true);
    });
  });

  test.describe("a production build (CI): the lifecycle is drawn off, honestly", () => {
    test.skip(!SERVER_IS_PRODUCTION_BUILD, CI_ONLY_REASON);

    test("each built-in: the switch is off (the cover because it is always added, the rack because nothing can be checked), the deletion says it comes with the catalogue, no count is claimed, and pressing sends nothing", async ({
      page,
    }) => {
      const words = wordsOf("ro");
      const cannotJudge = romanian("priceDashboard.lifecycle.cannotJudge");
      const alwaysPresent = romanian(
        "priceDashboard.lifecycle.alwaysPresentCannotChange",
      );
      await openAccessoryList(page);
      const requests = collectDashboardRequests(page);

      for (const accessoryId of BUILT_IN_ACCESSORIES) {
        const row = rowOf(page, accessoryId);
        await menuButtonOf(row).click();
        for (const which of ["switch-off", "delete"] as const) {
          const entry = menuEntryOf(row, words, which);
          await expect(entry, `${accessoryId} ${which}`).toHaveAttribute(
            "aria-disabled",
            "true",
          );
          await entry.click({ force: true });
        }
        await expect(row.getByTestId("menu-reason")).toHaveText([
          accessoryId === SINK_COVER ? alwaysPresent : cannotJudge,
          romanian("priceDashboard.lifecycle.builtInAccessoryCannotBeDeleted"),
        ]);
        await menuButtonOf(row).click();
      }
      await expect(itemDialogOf(page)).toHaveCount(0);
      expect(
        plainText(await page.getByRole("main").innerText()),
        "no count of saved kitchens is said",
      ).not.toMatch(SAYS_SAVED_KITCHENS_USE_IT);
      await shootForReview(page, "1440-d6a-production-menu");

      await openAccessory(page, DRYING_RACK);
      await expect(activeSwitch(page, words)).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await activeSwitch(page, words).click({ force: true });
      await deleteAccessoryButton(page, words).click({ force: true });
      await expect(itemDialogOf(page)).toHaveCount(0);
      expect(
        requests,
        "no request was made by pressing an off control",
      ).toEqual([]);
      await shootForReview(page, "1440-d6b-production-off");
    });
  });

  test.describe("the sample's working lifecycle (next dev)", () => {
    test.skip(SERVER_IS_PRODUCTION_BUILD, DEV_ONLY_REASON);
    const words = wordsOf("ro");

    test("D6C: the question opens on Cancel and keeps Tab inside, Escape closes it, and a click on Cancel puts focus back on the row's entry", async ({
      page,
    }) => {
      await openAccessoryList(page);
      const row = rowOf(page, DRYING_RACK);
      await menuButtonOf(row).click();
      const entry = menuEntryOf(row, words, "switch-off");

      await entry.click({ force: true });

      const dialog = itemDialogOf(page);
      await expect(dialog).toBeVisible();
      const cancel = dialog.getByRole("button", {
        name: CANCEL(),
        exact: true,
      });
      await expect(cancel).toBeFocused();
      const box = await boxOf(dialog);
      expect(
        Math.abs(box.x + box.width / 2 - DESKTOP.width / 2),
        "centred across the screen",
      ).toBeLessThanOrEqual(CENTRE_SLACK_PX);
      await shootForReview(page, "1440-d6c-deactivate-rack");
      for (const key of ["Tab", "Shift+Tab"]) {
        for (let presses = 0; presses < 6; presses += 1) {
          await page.keyboard.press(key);
          expect(
            await page.evaluate(
              () =>
                document.activeElement?.closest('[role="alertdialog"]') != null,
            ),
            `${key} ${String(presses + 1)} stays inside`,
          ).toBe(true);
        }
      }

      await page.keyboard.press("Escape");

      await expect(dialog).toHaveCount(0);
      expect(
        await focusedName(page),
        "Escape returns focus to the entry that asked",
      ).toContain(romanian("priceDashboard.common.deactivate"));

      await entry.click({ force: true });
      await dialog.getByRole("button", { name: CANCEL(), exact: true }).click();

      await expect(dialog).toHaveCount(0);
      await expect(
        entry,
        "a real click on Cancel returns focus to the entry",
      ).toBeFocused();
      await expect(
        chipsOf(row).filter({
          hasText: romanian("priceDashboard.chips.inactive"),
        }),
        "Cancel changed nothing",
      ).toHaveCount(0);
    });

    test("confirming switches the rack off at once: it says it applies immediately and promises no publication, the pending count does not move, nothing reaches the draft's routes, and switching on brings it back", async ({
      page,
    }) => {
      await openAccessoryList(page);
      const requests = collectDashboardRequests(page);
      const row = rowOf(page, DRYING_RACK);
      await menuButtonOf(row).click();
      await menuEntryOf(row, words, "switch-off").click();
      const dialog = itemDialogOf(page);
      const text = plainText(await dialog.innerText());
      expect(text).toContain(
        romanian("priceDashboard.lifecycle.deactivateTitle", {
          name: RACK_NAME,
        }),
      );
      expect(text).toContain(
        plainText(
          romanian("priceDashboard.lifecycle.usedByAccessory", {
            count: DRYING_RACK_SAVED_KITCHENS,
          }),
        ),
      );
      expect(text).toContain(
        romanian("priceDashboard.lifecycle.appliesImmediately"),
      );
      expect(text, "no publishing is promised").not.toMatch(
        PROMISES_PUBLICATION,
      );
      expect(text, "an accessory is never called an option").not.toMatch(
        /op.iun/i,
      );

      await dialog
        .getByRole("button", { name: CONFIRM_SWITCH_OFF(), exact: true })
        .click();

      await expect(dialog).toHaveCount(0);
      await expect(
        chipsOf(row).filter({
          hasText: romanian("priceDashboard.chips.inactive"),
        }),
      ).toHaveCount(1);
      await expect(page.getByTestId("staff-pending-prices")).toHaveCount(0);
      expect(requests).toEqual([]);
      await shootForReview(page, "1440-d6c-rack-off");

      await menuEntryOf(row, words, "switch-on").click();
      await itemDialogOf(page)
        .getByRole("button", { name: CONFIRM_SWITCH_ON(), exact: true })
        .click();
      await expect(
        chipsOf(row).filter({
          hasText: romanian("priceDashboard.chips.inactive"),
        }),
      ).toHaveCount(0);
    });

    test("the page's switch asks the same question, and the built-in's deletion stays off beside it", async ({
      page,
    }) => {
      await openAccessory(page, DRYING_RACK);

      await activeSwitch(page, words).click();
      const dialog = itemDialogOf(page);
      await expect(dialog.getByRole("heading", { level: 2 })).toHaveText(
        romanian("priceDashboard.lifecycle.deactivateTitle", {
          name: RACK_NAME,
        }),
      );
      await dialog
        .getByRole("button", { name: CONFIRM_SWITCH_OFF(), exact: true })
        .click();

      await expect(activeSwitch(page, words)).toHaveAttribute(
        "aria-checked",
        "false",
      );
      await expect(deleteAccessoryButton(page, words)).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await expect(page.getByTestId("staff-pending-prices")).toHaveCount(0);
    });
  });
});
