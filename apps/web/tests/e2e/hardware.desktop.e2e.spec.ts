// Wave U4a of M10 at 1440 x 900 with a pointer: the hardware screens "Feronerie" (the list, one class, a new class) against
// frames D4A to D4F of the dashboard mockup (docs/design/mockups/Lemnaria Dashboard.dc.html).
//
// WHICH SERVER THIS FILE HOLDS ON, and what is not reachable, is written at the head of hardware.e2e.spec.ts and holds
// here too: the list, the rate Save and the refusals run under both `next dev` and `CI` (`next start`); the dialogs need
// the sample lifecycle that only `next dev` draws, and the off controls are what `next start` draws; creating a class has
// no route yet (S3).
//
// The draft is ONE draft in the e2e server's memory, so every test starts and ends by emptying it and the file takes the
// lock the dashboard's specs share.
import {
  countStaffFixturesForTests,
  removeStaffFixturesForTests,
} from "@lemnaria/persistence";
import { expect, type Locator, type Page } from "@playwright/test";

import {
  collectWrites,
  expectPendingCount,
} from "./support/cabinet-detail-page";
import {
  activeRatesOf,
  activeSwitch,
  BLUM,
  boxOf,
  chipsOf,
  CI_ONLY_REASON,
  collectDashboardRequests,
  columnTitlesOf,
  DEV_ONLY_REASON,
  deleteClassButton,
  draftChanges,
  editPageOf,
  focusedName,
  HETTICH,
  itemDialogOf,
  listedRatesOf,
  menuButtonOf,
  menuEntryOf,
  menuOf,
  openClass,
  openHardwareList,
  openNewClass,
  rateCellOf,
  RATE_COLUMN_KEY,
  RATE_FIELDS,
  SAYS_SAVED_KITCHENS_USE_IT,
  PROMISES_PUBLICATION,
  rateField,
  rowOf,
  rowsOf,
  saveRatesButton,
  SERVER_IS_PRODUCTION_BUILD,
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
import {
  plainText,
  stickingOut,
  wordsBrokenIn,
  wordsOf,
} from "./support/publish-page";
import { shootForReview } from "./support/staff-pages";
import {
  NOTHING_LEFT,
  plantSignedInAdministrator,
  romanian,
  signIn,
  type SignedInAdministrator,
} from "./support/staff-world";

const DESKTOP = { width: 1440, height: 900 } as const;
const LOCALES = ["ro", "ru"] as const;
/** Where the layout changes from the card to the table (`hardware.module.css`), and the widths either side of it. */
const TABLE_FROM_PX = 1200;
const WIDTHS = [900, 1024, 1199, 1200, 1280, 1440, 1920] as const;
const ALIGNMENT_TOLERANCE_PX = 1;
/** A dialog centred in the viewport is off true centre by at most the width a scrollbar would take. */
const CENTRE_SLACK_PX = 16;
const FILES_TAKE_TURNS_MS = 600_000;
const HETTICH_SAVED_KITCHENS = 14;
const CANCEL = () => romanian("priceDashboard.common.cancel");
const CONFIRM_SWITCH_OFF = () =>
  romanian("priceDashboard.lifecycle.deactivateConfirm");

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

test.describe("the hardware screens at desktop 1440", () => {
  test.beforeEach(({ page }) => {
    expect(page.viewportSize(), "the viewport this project asked for").toEqual(
      DESKTOP,
    );
  });

  test.describe("D4A: the table, under either server", () => {
    test("the table has a title for the class, the four rates (the lift among them) and the state, each over its own figures; RO and RU", async ({
      page,
    }) => {
      for (const locale of LOCALES) {
        const words = wordsOf(locale);
        await openHardwareList(page, locale);

        const titles = columnTitlesOf(page).locator("span");
        await expect(
          titles,
          `${locale}: seven titles, the last blank`,
        ).toHaveCount(7);
        await expect(titles.nth(0)).toHaveText(
          words("priceDashboard.hardware.columnClass"),
        );
        for (const [index, field] of RATE_FIELDS.entries()) {
          await expect(titles.nth(index + 1)).toHaveText(
            words(RATE_COLUMN_KEY[field]),
          );
        }
        await expect(titles.nth(5)).toHaveText(
          words("priceDashboard.hardware.columnState"),
        );
        await expect(rowsOf(page)).toHaveCount(3);
        for (const tierId of [STANDARD, HETTICH, BLUM]) {
          const row = rowOf(page, tierId);
          expect(await listedRatesOf(row), `${locale} ${tierId}`).toEqual(
            activeRatesOf(tierId),
          );
          for (const [index, field] of RATE_FIELDS.entries()) {
            const title = await boxOf(titles.nth(index + 1));
            const cell = await boxOf(rateCellOf(row, field));
            expect(
              Math.abs(title.x - cell.x),
              `${locale} ${tierId}: the ${field} figure starts under its title`,
            ).toBeLessThanOrEqual(ALIGNMENT_TOLERANCE_PX);
          }
        }
        await expect(
          rowsOf(page).locator("input, textarea, select"),
          "a rate is changed on the class's page, not in the table",
        ).toHaveCount(0);
        await expectNoSidewaysScroll(page, `${locale} table`);
        expect(await stickingOut(page), `${locale} table`).toEqual([]);
        await shootForReview(page, `1440-d4a-list-${locale}`);
      }
    });

    // RED ON PURPOSE: DEFECT. In Russian the column title "Направляющие (пара)" is one word of 113 px in a column of 82 px at
    // 1200, 92 px at 1280 and 111 px at 1440, so it is drawn over the next title ("Push-to-open") at 1200 and 1280; at
    // 1200 "Подъёмный механизм" overflows its 82 px column too. `hardware.module.css:475` (`.columns`, from 1200) sets
    // seven fixed-fraction columns with `minmax(0, 1fr)` and uppercase letter-spaced 11 px text, with nothing that lets a
    // long word shrink or wrap. Romanian and 1920 pass.
    test("no width from 900 to 1920 scrolls the page sideways, in RO and RU; the card is drawn below 1200 and the table from 1200; no word is broken in the middle", async ({
      page,
    }) => {
      for (const locale of LOCALES) {
        await openHardwareList(page, locale);
        for (const width of WIDTHS) {
          await page.setViewportSize({ width, height: DESKTOP.height });
          const title = `${locale} at ${String(width)}`;
          const titles = columnTitlesOf(page);

          if (width >= TABLE_FROM_PX) {
            await expect
              .soft(titles, `${title}: the table's titles`)
              .toBeVisible();
          } else {
            await expect
              .soft(titles, `${title}: the card layout has no titles`)
              .toBeHidden();
          }
          await expectNoSidewaysScroll(page, title);
          expect.soft(await stickingOut(page), title).toEqual([]);
          expect
            .soft(
              await overflowingBoxes(page),
              `${title}: text wider than its box`,
            )
            .toEqual([]);
          // A hyphenated name ("Push-to-open") may wrap at its hyphens; any other word broken in two is a cut.
          const broken = (await wordsBrokenIn(listOf(page))).filter(
            (word) => !word.includes("-"),
          );
          expect
            .soft(broken, `${title}: words broken across lines`)
            .toEqual([]);
          const rowBox = await boxOf(rowOf(page, HETTICH));
          const tops = await Promise.all(
            RATE_FIELDS.map(async (field) =>
              Math.round(
                (await boxOf(rateCellOf(rowOf(page, HETTICH), field))).y,
              ),
            ),
          );
          if (width >= TABLE_FROM_PX) {
            expect
              .soft(
                new Set(tops).size,
                `${title}: the four rates stand on one line`,
              )
              .toBe(1);
          } else {
            expect
              .soft(rowBox.width, `${title}: a card`)
              .toBeLessThanOrEqual(width);
          }
          if ([TABLE_FROM_PX - 1, TABLE_FROM_PX, 1280].includes(width)) {
            await shootForReview(page, `d4a-list-${locale}-${String(width)}`);
          }
        }
        await page.setViewportSize(DESKTOP);
      }
    });
  });

  test.describe("a class's page and the new class form, under either server", () => {
    test("the class's page stands in two columns, the words and the switch on the left and the four rates on the right; a rate is saved by the pointer and a reload keeps it", async ({
      page,
    }) => {
      const words = wordsOf("ro");
      await openClass(page, HETTICH);
      const writes = collectWrites(page);

      const left = await boxOf(
        editPageOf(page).getByText(
          romanian("priceDashboard.hardware.nameLabel"),
          { exact: true },
        ),
      );
      const right = await boxOf(rateField(page, words, "perHingeMinor"));
      expect(right.x, "the rates are in the right column").toBeGreaterThan(
        left.x + left.width,
      );
      await shootForReview(page, "1440-d4b-hettich");
      await rateField(page, words, "perLiftMinor").fill("650");
      await saveRatesButton(page, words).click();

      await expect(
        editPageOf(page).getByText(
          romanian("priceDashboard.common.priceSavedNotice"),
        ),
      ).toBeVisible();
      expect(writes).toEqual(["PUT /api/staff/prices/draft"]);
      await expectPendingCount(page, 1);
      expect(
        (await draftChanges(page)).map(({ address, value }) => [
          address.field,
          value,
        ]),
      ).toEqual([["perLiftMinor", 65000]]);
      await openClass(page, HETTICH);
      await expect(rateField(page, words, "perLiftMinor")).toHaveValue("650");
      await shootForReview(page, "1440-d4b-saved");
      await rateField(page, words, "perLiftMinor").fill("600");
      await saveRatesButton(page, words).click();
      await expect
        .poll(async () => (await draftChanges(page)).length, {
          message: "typing the active amount back empties the draft",
        })
        .toBe(0);
    });

    test("a refused value on the lift says why in Russian too, and Save stays off", async ({
      page,
    }) => {
      const words = wordsOf("ru");
      await openClass(page, HETTICH, "ru");

      await rateField(page, words, "perLiftMinor").fill("abc");

      await expect(
        editPageOf(page).getByText(
          words("priceDashboard.errors.notNumber", { example: "450,00" }),
        ),
      ).toBeVisible();
      await expect(saveRatesButton(page, words)).toBeDisabled();
      await expectNoSidewaysScroll(page, "ru refused");
      await shootForReview(page, "1440-d4b-refused-ru");
    });

    test("the new class form stands in two columns in Romanian only: name, description, four prices; Create is off and says why, and nothing is sent", async ({
      page,
    }) => {
      const words = wordsOf("ro");
      await openNewClass(page);
      const requests = collectDashboardRequests(page);
      const form = page.getByTestId("hardware-create");

      await expect(form.locator("input[type=text]")).toHaveCount(6);
      await expect(form.getByRole("tab")).toHaveCount(0);
      const name = await boxOf(
        form.getByLabel(words("priceDashboard.hardware.nameLabel"), {
          exact: true,
        }),
      );
      const hinge = await boxOf(
        form.getByLabel(words("priceDashboard.hardware.priceHinge"), {
          exact: true,
        }),
      );
      expect(hinge.x, "the prices are in the right column").toBeGreaterThan(
        name.x + name.width,
      );
      await form
        .getByLabel(words("priceDashboard.hardware.nameLabel"), { exact: true })
        .fill("Grass Test");
      await form
        .getByLabel(words("priceDashboard.hardware.descriptionLabel"), {
          exact: true,
        })
        .fill("Clasa de proba");
      const prices = {
        priceHinge: "10",
        priceSlide: "20",
        pricePush: "30",
        priceLift: "40",
      };
      for (const [leaf, value] of Object.entries(prices)) {
        await form
          .getByLabel(words(`priceDashboard.hardware.${leaf}`), { exact: true })
          .fill(value);
      }
      const create = form.getByRole("button", {
        name: romanian("priceDashboard.hardware.createAction"),
        exact: true,
      });

      await expect(
        create,
        "valid, and still off: no route takes a creation (S3)",
      ).toBeDisabled();
      await expect(
        form.getByText(romanian("priceDashboard.lifecycle.cannotJudge")),
      ).toBeVisible();
      await create.click({ force: true });
      expect(requests).toEqual([]);
      await shootForReview(page, "1440-d4c-new-class");
    });
  });

  test.describe("D4F: the row's menu, under either server", () => {
    test("the pointer opens the menu, Escape closes it and puts focus back on the three dots, and a click outside closes it; Standard's entries are off with the catalogue's words", async ({
      page,
    }) => {
      const words = wordsOf("ro");
      await openHardwareList(page);
      const row = rowOf(page, STANDARD);
      const more = menuButtonOf(row);

      await more.click();

      await expect(menuOf(row)).toBeVisible();
      for (const which of ["switch-off", "delete"] as const) {
        await expect(menuEntryOf(row, words, which)).toHaveAttribute(
          "aria-disabled",
          "true",
        );
      }
      await expect(row.getByTestId("menu-reason")).toHaveText([
        romanian("priceDashboard.lifecycle.fixedDefaultCannotChange"),
        romanian("priceDashboard.lifecycle.fixedDefaultCannotChange"),
      ]);
      await shootForReview(page, "1440-d4f-default-menu");
      await page.keyboard.press("Escape");
      await expect(menuOf(row)).toHaveCount(0);
      expect(await focusedName(page)).toContain(
        romanian("priceDashboard.common.moreActionsFor", { name: "Standard" }),
      );
      await more.click();
      await page.getByRole("heading", { level: 1 }).click();
      await expect(menuOf(row), "a click outside closes it").toHaveCount(0);
    });
  });

  test.describe("the row menus, under either server", () => {
    // RED ON PURPOSE: DEFECT. `use-close-on-outside-press.ts` (used at `hardware-list.tsx:282`) closes the open menu on
    // `pointerdown`, and the menu is drawn in the row's flow (`hardware.module.css:245`, `.menu` at flex-basis 100%), so the
    // row grows and shrinks with it: on the press the rows below move up by the menu's height (measured 81 px at 1440), the
    // release lands off the three dots, and no click happens. A real mouse click on another row's three dots while one menu
    // is open does nothing at the first click. The touch tap on the phone is not affected (its test passes).
    test("with one row's menu open, a click on the next row's three dots opens that menu at the first click", async ({
      page,
    }) => {
      await openHardwareList(page);
      const first = rowOf(page, HETTICH);
      const second = rowOf(page, BLUM);
      await menuButtonOf(first).click();
      await expect(menuOf(first)).toBeVisible();
      const target = menuButtonOf(second);
      const before = await boxOf(target);

      await page.mouse.move(
        before.x + before.width / 2,
        before.y + before.height / 2,
      );
      await page.mouse.down();
      const atPress = await boxOf(target);
      await page.mouse.up();

      expect
        .soft(
          atPress.y,
          "the three dots stay under the pointer between the press and the release",
        )
        .toBe(before.y);
      await expect(
        menuOf(second),
        "the menu above closed on the press and the row below moved up before the click landed",
      ).toBeVisible();
      await expect(menuOf(first)).toHaveCount(0);
    });
  });

  test.describe("a production build (CI): the lifecycle is drawn off, honestly", () => {
    test.skip(!SERVER_IS_PRODUCTION_BUILD, CI_ONLY_REASON);

    test("Hettich and Blum: every entry and the class page's switch and deletion are off with the reason, no count is claimed, and clicking sends nothing", async ({
      page,
    }) => {
      const words = wordsOf("ro");
      const cannotJudge = romanian("priceDashboard.lifecycle.cannotJudge");
      await openHardwareList(page);
      const requests = collectDashboardRequests(page);

      for (const tierId of [HETTICH, BLUM]) {
        const row = rowOf(page, tierId);
        await menuButtonOf(row).click();
        for (const which of ["switch-off", "delete"] as const) {
          const entry = menuEntryOf(row, words, which);
          await expect(entry).toHaveAttribute("aria-disabled", "true");
          await entry.click({ force: true });
        }
        await expect(row.getByTestId("menu-reason")).toHaveText([
          cannotJudge,
          cannotJudge,
        ]);
        // A press outside closes this row's menu first: with it open the next row's dots move under the pointer.
        await page.getByRole("heading", { level: 1 }).click();
      }
      await expect(itemDialogOf(page)).toHaveCount(0);
      expect(plainText(await page.getByRole("main").innerText())).not.toMatch(
        SAYS_SAVED_KITCHENS_USE_IT,
      );
      await shootForReview(page, "1440-d4f-production-menu");
      await openClass(page, HETTICH);
      await expect(activeSwitch(page, words)).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await expect(deleteClassButton(page, words)).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await activeSwitch(page, words).click({ force: true });
      await deleteClassButton(page, words).click({ force: true });
      await expect(itemDialogOf(page)).toHaveCount(0);
      expect(requests, "nothing was sent").toEqual([]);
      await shootForReview(page, "1440-d4b-production-off");
    });
  });

  test.describe("the sample's working lifecycle (next dev)", () => {
    test.skip(SERVER_IS_PRODUCTION_BUILD, DEV_ONLY_REASON);
    const words = wordsOf("ro");

    test("D4E: the question opens on Cancel and keeps Tab inside, Escape closes it, and a click on Cancel puts focus back on the row's entry", async ({
      page,
    }) => {
      await openHardwareList(page);
      const row = rowOf(page, HETTICH);
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
      const centre = box.x + box.width / 2;
      expect(
        Math.abs(centre - DESKTOP.width / 2),
        "centred across the screen",
      ).toBeLessThanOrEqual(CENTRE_SLACK_PX);
      await shootForReview(page, "1440-d4e-deactivate-hettich");
      for (let presses = 0; presses < 6; presses += 1) {
        await page.keyboard.press("Tab");
        expect(
          await insideDialog(page),
          `Tab ${String(presses + 1)} stays inside`,
        ).toBe(true);
      }
      for (let presses = 0; presses < 6; presses += 1) {
        await page.keyboard.press("Shift+Tab");
        expect(
          await insideDialog(page),
          `Shift+Tab ${String(presses + 1)} stays inside`,
        ).toBe(true);
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

    test("confirming switches Hettich off at once: it says it applies immediately and promises no publication, the chip changes, the pending count does not move, and nothing reaches the draft's routes", async ({
      page,
    }) => {
      await openHardwareList(page);
      const requests = collectDashboardRequests(page);
      const row = rowOf(page, HETTICH);
      await menuButtonOf(row).click();
      await menuEntryOf(row, words, "switch-off").click();
      const dialog = itemDialogOf(page);
      const text = plainText(await dialog.innerText());
      expect(text).toContain(
        romanian("priceDashboard.lifecycle.appliesImmediately"),
      );
      expect(text).toContain(
        plainText(
          romanian("priceDashboard.lifecycle.usedBy", {
            count: HETTICH_SAVED_KITCHENS,
          }),
        ),
      );
      expect(text).toContain(
        romanian("priceDashboard.lifecycle.remaining", {
          options: "Standard, Blum",
        }),
      );
      expect(text).not.toContain("Hettich, Hettich");
      expect(text, "no publishing is promised").not.toMatch(
        PROMISES_PUBLICATION,
      );

      await dialog
        .getByRole("button", { name: CONFIRM_SWITCH_OFF(), exact: true })
        .click();

      await expect(dialog).toHaveCount(0);
      await expect(
        chipsOf(row).filter({
          hasText: new RegExp(`^${romanian("priceDashboard.chips.inactive")}$`),
        }),
      ).toHaveCount(1);
      await expect(page.getByTestId("staff-pending-prices")).toHaveCount(0);
      expect(requests).toEqual([]);
      await shootForReview(page, "1440-d4e-hettich-off");
      await expect(
        menuEntryOf(row, words, "switch-on"),
        "the entry now offers the opposite",
      ).toBeVisible();
    });

    test("D4F: Delete on Hettich is blocked with the count and offers to deactivate instead; on Blum it asks and the draft route refuses until R4a", async ({
      page,
      pageErrors,
    }) => {
      await openHardwareList(page);
      const hettich = rowOf(page, HETTICH);
      await menuButtonOf(hettich).click();
      await menuEntryOf(hettich, words, "delete").click();

      const blocked = itemDialogOf(page);
      await expect(
        blocked.getByRole("button", { name: CANCEL(), exact: true }),
      ).toBeFocused();
      expect(plainText(await blocked.innerText())).toContain(
        plainText(
          romanian("priceDashboard.lifecycle.deleteBlockedBody", {
            name: "Hettich",
            count: HETTICH_SAVED_KITCHENS,
          }),
        ),
      );
      await shootForReview(page, "1440-d4d-delete-blocked");
      await blocked
        .getByRole("button", {
          name: romanian("priceDashboard.lifecycle.deactivateInstead"),
          exact: true,
        })
        .click();
      await expect(
        itemDialogOf(page).getByRole("heading", { level: 2 }),
      ).toHaveText(
        romanian("priceDashboard.lifecycle.deactivateTitle", {
          name: "Hettich",
        }),
      );
      await itemDialogOf(page)
        .getByRole("button", { name: CANCEL(), exact: true })
        .click();
      await page.getByRole("heading", { level: 1 }).click();

      const blum = rowOf(page, BLUM);
      await menuButtonOf(blum).click();
      await menuEntryOf(blum, words, "delete").click();
      await itemDialogOf(page)
        .getByRole("button", {
          name: romanian("priceDashboard.common.delete"),
          exact: true,
        })
        .click();

      // R4a has not built the draft route's deletion yet (`draft-address.ts` reads no `item-deleted`): the route answers 400,
      // the dialog says so and the draft is untouched. When R4a lands this is the assertion to change.
      await expect(
        itemDialogOf(page).getByText(
          romanian("priceDashboard.errors.saveFailed"),
        ),
      ).toBeVisible();
      expect(await draftChanges(page)).toEqual([]);
      const note =
        "console: Failed to load resource: the server responded with a status of 400";
      const rest = pageErrors.filter((entry) => !entry.startsWith(note));
      expect(
        pageErrors.length - rest.length,
        "the browser's note of the 400",
      ).toBe(1);
      pageErrors.splice(0, pageErrors.length, ...rest);
    });

    test("the class's page asks the same question with the right remaining classes, and the switch turns off at once", async ({
      page,
    }) => {
      await openClass(page, HETTICH);

      await activeSwitch(page, words).click();

      const dialog = itemDialogOf(page);
      const text = plainText(await dialog.innerText());
      expect(text).toContain(
        romanian("priceDashboard.lifecycle.remaining", {
          options: "Standard, Blum",
        }),
      );
      expect(text).not.toContain("Hettich, Hettich");
      await dialog
        .getByRole("button", { name: CONFIRM_SWITCH_OFF(), exact: true })
        .click();
      await expect(activeSwitch(page, words)).toHaveAttribute(
        "aria-checked",
        "false",
      );
      await expect(page.getByTestId("staff-pending-prices")).toHaveCount(0);
      await shootForReview(page, "1440-d4b-hettich-off");
    });
  });
});

function listOf(page: Page): Locator {
  return page.getByTestId("hardware-list");
}

function insideDialog(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.activeElement?.closest('[role="alertdialog"]') != null,
  );
}

/** The elements of the list whose text is wider than their own box, named: a word is cut, or spills into its neighbour. */
function overflowingBoxes(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    const scope = document.querySelector('[data-testid="hardware-list"]');
    for (const element of scope?.querySelectorAll("*") ?? []) {
      if (!(element instanceof HTMLElement)) continue;
      // The visually hidden labels are one pixel wide on purpose.
      if (element.clientWidth <= 1) continue;
      if (element.scrollWidth > element.clientWidth + 1) {
        found.push(
          `${element.tagName.toLowerCase()} "${element.textContent.trim().slice(0, 30)}" ${String(element.scrollWidth)} > ${String(element.clientWidth)}`,
        );
      }
    }
    return found.slice(0, 8);
  });
}
