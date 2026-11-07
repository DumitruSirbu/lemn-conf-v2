// The materials screens "Materiale" (the list and one material) at 1440 x 900 with a pointer, against frames D5A to D5G
// of the dashboard mockup (docs/design/mockups/Lemnaria Dashboard.dc.html).
//
// WHICH SERVER THIS FILE HOLDS ON, and what is not reachable, is written at the head of materials.e2e.spec.ts and
// support/material-page.ts and holds here too: the list, the surcharge Save and the refusals run under both `next dev`
// and `CI` (`next start`); the dialogs need the sample lifecycle that only `next dev` draws, and the off controls are
// what `next start` draws; deleting a material into the draft needs R4a.
//
// The draft is ONE draft in the e2e server's memory, so every test starts and ends by emptying it and the file takes
// the lock the dashboard's specs share.
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
import {
  activePercentOf,
  activeSwitch,
  chipsOf,
  coloursCellOf,
  columnTitlesOf,
  deleteMaterialButton,
  editPageOf,
  exampleOf,
  examplePricesOf,
  listedColoursOf,
  listOf,
  MATERIAL_NAME_KEY,
  MDF,
  MDF_SAVED_KITCHENS,
  menuButtonOf,
  menuEntryOf,
  menuOf,
  openMaterial,
  openMaterialList,
  PAL,
  rowOf,
  rowsOf,
  saveSurchargeButton,
  surchargeCellOf,
  surchargeField,
  VENEER,
  warmMaterialRoutes,
} from "./support/material-page";
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
/** Where the layout changes from the card to the table (`material.module.css`), and the widths either side of it. */
const TABLE_FROM_PX = 1200;
const WIDTHS = [900, 1024, 1100, 1199, 1200, 1280, 1440, 1920] as const;
const POPOVER_WIDTHS = [900, 1199, 1200, 1440, 1920] as const;
const ALIGNMENT_TOLERANCE_PX = 1;
/** A dialog centred in the viewport is off true centre by at most the width a scrollbar would take. */
const CENTRE_SLACK_PX = 16;
const FILES_TAKE_TURNS_MS = 600_000;
const PAL_NAME = romanian(MATERIAL_NAME_KEY[PAL]);
const MDF_NAME = romanian(MATERIAL_NAME_KEY[MDF]);
const VENEER_NAME = romanian(MATERIAL_NAME_KEY[VENEER]);
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
  await warmMaterialRoutes(browser, signedIn.administrator);
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

test.describe("the materials screens at desktop 1440", () => {
  test.beforeEach(({ page }) => {
    expect(page.viewportSize(), "the viewport this project asked for").toEqual(
      DESKTOP,
    );
  });

  test.describe("D5A: the table, under either server", () => {
    test("the table has a title for the material, the surcharge, the colours and the state, each over its own figures; RO and RU", async ({
      page,
    }) => {
      for (const locale of LOCALES) {
        const words = wordsOf(locale);
        await openMaterialList(page, locale);

        const titles = columnTitlesOf(page).locator("span");
        await expect(
          titles,
          `${locale}: five titles, the last blank`,
        ).toHaveCount(5);
        await expect(titles.nth(0)).toHaveText(
          words("priceDashboard.materials.columnMaterial"),
        );
        await expect(titles.nth(1)).toHaveText(
          words("priceDashboard.materials.columnSurcharge"),
        );
        await expect(titles.nth(2)).toHaveText(
          words("priceDashboard.materials.columnColours"),
        );
        await expect(titles.nth(3)).toHaveText(
          words("priceDashboard.materials.columnState"),
        );
        await expect(rowsOf(page)).toHaveCount(3);
        for (const tierId of [PAL, MDF, VENEER]) {
          const row = rowOf(page, tierId);
          const surcharge = await boxOf(surchargeCellOf(row));
          const colours = await boxOf(coloursCellOf(row));
          expect(
            Math.abs((await boxOf(titles.nth(1))).x - surcharge.x),
            `${locale} ${tierId}: the surcharge starts under its title`,
          ).toBeLessThanOrEqual(ALIGNMENT_TOLERANCE_PX);
          expect(
            Math.abs((await boxOf(titles.nth(2))).x - colours.x),
            `${locale} ${tierId}: the colours start under their title`,
          ).toBeLessThanOrEqual(ALIGNMENT_TOLERANCE_PX);
          const count = listedColoursOf(tierId);
          await expect(coloursCellOf(row)).toContainText(
            count === undefined
              ? words("priceDashboard.materials.colourPicker")
              : words("priceDashboard.materials.colourCount", { count }),
          );
        }
        await expect(surchargeCellOf(rowOf(page, MDF))).toContainText(
          words("priceDashboard.common.percentPlus", {
            percent: String(activePercentOf(MDF)),
          }),
        );
        await expect(
          rowsOf(page).locator("input, textarea, select"),
          "a surcharge is changed on the material's page, not in the table",
        ).toHaveCount(0);
        await expectNoSidewaysScroll(page, `${locale} table`);
        expect(await stickingOut(page), `${locale} table`).toEqual([]);
        await shootForReview(page, `1440-d5a-list-${locale}`);
      }
    });

    test("no width from 900 to 1920 scrolls the page sideways, in RO and RU; the card is drawn below 1200 and the table from 1200; no title runs into the next and no word is broken in the middle", async ({
      page,
    }) => {
      for (const locale of LOCALES) {
        await openMaterialList(page, locale);
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
          expect
            .soft(
              await overlappingTitles(page),
              `${title}: titles run into each other`,
            )
            .toEqual([]);
          expect
            .soft(
              await wordsBrokenIn(listOf(page)),
              `${title}: words broken across lines`,
            )
            .toEqual([]);
          const rowBox = await boxOf(rowOf(page, MDF));
          if (width < TABLE_FROM_PX) {
            expect
              .soft(rowBox.width, `${title}: a card`)
              .toBeLessThanOrEqual(width);
          }
          if ([TABLE_FROM_PX - 1, TABLE_FROM_PX, 1280].includes(width)) {
            await shootForReview(page, `d5a-list-${locale}-${String(width)}`);
          }
        }
        await page.setViewportSize(DESKTOP);
      }
    });
  });

  test.describe("a material's page, under either server", () => {
    test("the page stands in two columns, the words and the switch on the left and the surcharge and its example on the right; a surcharge is saved by the pointer and a reload keeps it", async ({
      page,
    }) => {
      const words = wordsOf("ro");
      await openMaterial(page, MDF);
      const writes = collectWrites(page);

      const left = await boxOf(
        editPageOf(page).getByText(
          romanian("priceDashboard.materials.nameLabel"),
          { exact: true },
        ),
      );
      const right = await boxOf(surchargeField(page, words));
      expect(right.x, "the surcharge is in the right column").toBeGreaterThan(
        left.x + left.width,
      );
      await expect(exampleOf(page)).toBeVisible();
      await shootForReview(page, "1440-d5b-mdf");
      await surchargeField(page, words).fill("35");
      await saveSurchargeButton(page, words).click();

      await expect(
        editPageOf(page).getByText(
          romanian("priceDashboard.common.priceSavedNotice"),
        ),
      ).toBeVisible();
      expect(writes).toEqual(["PUT /api/staff/prices/draft"]);
      await expectPendingCount(page, 1);
      expect(
        (await draftChanges(page)).map(({ address, value }) => [
          address.tierId,
          address.field,
          value,
        ]),
      ).toEqual([[MDF, "percentOfCabinets", 35]]);
      await openMaterial(page, MDF);
      await expect(surchargeField(page, words)).toHaveValue("35");
      await shootForReview(page, "1440-d5b-saved");
      await surchargeField(page, words).fill(String(activePercentOf(MDF)));
      await saveSurchargeButton(page, words).click();
      await expect
        .poll(async () => (await draftChanges(page)).length, {
          message: "typing the active surcharge back empties the draft",
        })
        .toBe(0);
    });

    test("a refused surcharge says why in Russian too, and Save stays off; the example follows what is typed", async ({
      page,
    }) => {
      const words = wordsOf("ru");
      await openMaterial(page, MDF, "ru");

      await surchargeField(page, words).fill("201");

      await expect(surchargeField(page, words)).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      await expect(
        editPageOf(page).getByText(
          words("priceDashboard.errors.percentTooBig", { max: "200" }),
        ),
      ).toBeVisible();
      await expect(saveSurchargeButton(page, words)).toBeDisabled();

      await surchargeField(page, words).fill("0");
      const none = await examplePricesOf(
        exampleOf(page).getByTestId("material-example-next"),
      );
      await surchargeField(page, words).fill("100");
      const doubled = await examplePricesOf(
        exampleOf(page).getByTestId("material-example-next"),
      );
      expect(
        none.material,
        "nothing added: the material costs what PAL does",
      ).toBe(none.reference);
      expect(doubled.material).toBeGreaterThan(none.material);
      await shootForReview(page, "1440-d5b-example-ru");
    });

    test("PAL's page has no field and says it is the reference; its switch and deletion are off with the catalogue's own words", async ({
      page,
    }) => {
      const words = wordsOf("ro");
      await openMaterial(page, PAL);
      const reason = romanian(
        "priceDashboard.lifecycle.fixedDefaultCannotChange",
      );

      await expect(editPageOf(page).locator("input")).toHaveCount(0);
      await expect(exampleOf(page)).toHaveCount(0);
      await expect(activeSwitch(page, words)).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await expect(deleteMaterialButton(page, words)).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await expect(editPageOf(page).getByText(reason)).toHaveCount(2);
      await shootForReview(page, "1440-d5b-pal-reference");
    });
  });

  test.describe("the row's menu, under either server", () => {
    test("the pointer opens the menu, Escape closes it and puts focus back on the three dots, and a click outside closes it; PAL's entries are off with the catalogue's words", async ({
      page,
    }) => {
      const words = wordsOf("ro");
      await openMaterialList(page);
      const row = rowOf(page, PAL);
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
      await shootForReview(page, "1440-d5a-default-menu");
      await page.keyboard.press("Escape");
      await expect(menuOf(row)).toHaveCount(0);
      expect(await focusedName(page)).toContain(
        romanian("priceDashboard.common.moreActionsFor", { name: PAL_NAME }),
      );
      await more.click();
      await page.getByRole("heading", { level: 1 }).click();
      await expect(menuOf(row), "a click outside closes it").toHaveCount(0);
    });

    test("a row's menu is a popover over the rows: it moves no row, keeps the next row's three dots free, stays in the viewport and adds no sideways scroll; RO and RU, from 900 to 1920", async ({
      page,
    }) => {
      for (const locale of LOCALES) {
        await openMaterialList(page, locale);
        for (const width of POPOVER_WIDTHS) {
          await page.setViewportSize({ width, height: DESKTOP.height });
          for (const [tierId, nextTierId] of [
            [PAL, MDF],
            [VENEER, undefined],
          ] as const) {
            const title = `${locale} at ${String(width)}, ${tierId}`;
            const row = rowOf(page, tierId);
            const distanceBefore = await distanceBetweenRows(page, PAL, VENEER);

            await menuButtonOf(row).click();

            const menu = await boxOf(menuOf(row));
            expect
              .soft(
                await distanceBetweenRows(page, PAL, VENEER),
                `${title}: no row moves`,
              )
              .toBe(distanceBefore);
            expect
              .soft(menu.x, `${title}: left edge`)
              .toBeGreaterThanOrEqual(0);
            expect
              .soft(menu.x + menu.width, `${title}: right edge`)
              .toBeLessThanOrEqual(width);
            await expectNoSidewaysScroll(page, title);
            expect
              .soft(await stickingOut(page), `${title}: sticking out`)
              .toEqual([]);
            const entries = menuOf(row).getByRole("button");
            await entries.last().scrollIntoViewIfNeeded();
            expect
              .soft(
                await isTopmostAtCentre(entries.last()),
                `${title}: the last entry is the topmost box where it stands`,
              )
              .toBe(true);
            if (nextTierId !== undefined) {
              expect
                .soft(
                  await isTopmostAtCentre(
                    menuButtonOf(rowOf(page, nextTierId)),
                  ),
                  `${title}: the next row's three dots are not under the menu`,
                )
                .toBe(true);
            }
            await menuButtonOf(row).click();
            await expect(menuOf(row)).toHaveCount(0);
          }
        }
        await page.setViewportSize(DESKTOP);
      }
    });
  });

  test.describe("a production build (CI): the switch-off is judged, the deletion stays off, and the counts come from the server", () => {
    test.skip(!SERVER_IS_PRODUCTION_BUILD, CI_ONLY_REASON);

    test("MDF and veneer: the switch-off entry and the page's switch are on, the deletion is off with the reason, the page counts the material once, and pressing the deletion sends nothing", async ({
      page,
    }) => {
      const words = wordsOf("ro");
      const cannotJudge = romanian("priceDashboard.lifecycle.cannotJudge");
      await openMaterialList(page);
      const requests = collectDashboardRequests(page);

      for (const tierId of [MDF, VENEER]) {
        const row = rowOf(page, tierId);
        await menuButtonOf(row).click();
        await expect(
          menuEntryOf(row, words, "switch-off"),
          `${tierId} switch-off`,
        ).not.toHaveAttribute("aria-disabled", "true");
        const deletion = menuEntryOf(row, words, "delete");
        await expect(deletion, `${tierId} delete`).toHaveAttribute(
          "aria-disabled",
          "true",
        );
        await deletion.click({ force: true });
        await expect(row.getByTestId("menu-reason")).toHaveText([cannotJudge]);
        await menuButtonOf(row).click();
      }
      await expect(itemDialogOf(page)).toHaveCount(0);
      expect(
        plainText(await page.getByRole("main").innerText()),
        "no count of saved kitchens is said",
      ).not.toMatch(SAYS_SAVED_KITCHENS_USE_IT);
      await shootForReview(page, "1440-d5a-production-menu");

      await openMaterial(page, MDF);
      await expect(activeSwitch(page, words)).not.toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await expect(deleteMaterialButton(page, words)).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await expect(editPageOf(page).getByText(cannotJudge)).toHaveCount(1);
      await expect(
        editPageOf(page)
          .locator("dl > div")
          .filter({
            hasText: romanian("priceDashboard.materials.usedInKitchens"),
          }),
        "the server counted the material, and no saved kitchen uses it in this world",
      ).toHaveText(
        new RegExp(
          `${romanian("priceDashboard.materials.usedInKitchens")}\\s*0$`,
        ),
      );
      const requestsBeforeDeletion = requests.length;
      await deleteMaterialButton(page, words).click({ force: true });
      await expect(itemDialogOf(page)).toHaveCount(0);
      expect(
        requests.slice(requestsBeforeDeletion),
        "no request was made by pressing the off deletion",
      ).toEqual([]);
      await activeSwitch(page, words).click();
      await expect(
        itemDialogOf(page),
        "the switch-off asks first",
      ).toBeVisible();
      await itemDialogOf(page)
        .getByRole("button", {
          name: romanian("priceDashboard.common.cancel"),
          exact: true,
        })
        .click();
      await expect(itemDialogOf(page)).toHaveCount(0);
      expect(
        requests,
        "one count for the page, one for the switch-off dialog, and nothing was written",
      ).toEqual([
        "POST /api/staff/prices/usage",
        "POST /api/staff/prices/usage",
      ]);
      await shootForReview(page, "1440-d5b-production-off");
    });
  });

  test.describe("the sample's working lifecycle (next dev)", () => {
    test.skip(SERVER_IS_PRODUCTION_BUILD, DEV_ONLY_REASON);
    const words = wordsOf("ro");

    test("D5C: the question opens on Cancel and keeps Tab inside, Escape closes it, and a click on Cancel puts focus back on the row's entry", async ({
      page,
    }) => {
      await openMaterialList(page);
      const row = rowOf(page, MDF);
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
      await shootForReview(page, "1440-d5c-deactivate-mdf");
      for (const key of ["Tab", "Shift+Tab"]) {
        for (let presses = 0; presses < 6; presses += 1) {
          await page.keyboard.press(key);
          expect(
            await insideDialog(page),
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

    test("confirming switches MDF off at once: it says it applies immediately and promises no publication, the chip says how many kitchens use it, the pending count does not move, nothing reaches the draft's routes, and switching on brings it back", async ({
      page,
    }) => {
      await openMaterialList(page);
      const requests = collectDashboardRequests(page);
      const row = rowOf(page, MDF);
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
            count: MDF_SAVED_KITCHENS,
          }),
        ),
      );
      expect(text).toContain(
        romanian("priceDashboard.lifecycle.remaining", {
          options: `${PAL_NAME}, ${VENEER_NAME}`,
        }),
      );
      expect(text).not.toContain(`${MDF_NAME}, ${MDF_NAME}`);
      expect(text, "no publishing is promised").not.toMatch(
        PROMISES_PUBLICATION,
      );

      await dialog
        .getByRole("button", { name: CONFIRM_SWITCH_OFF(), exact: true })
        .click();

      await expect(dialog).toHaveCount(0);
      await expect(
        chipsOf(row).filter({
          hasText: plainText(
            romanian("priceDashboard.chips.inactiveInUse", {
              count: MDF_SAVED_KITCHENS,
            }),
          ),
        }),
      ).toHaveCount(1);
      await expect(page.getByTestId("staff-pending-prices")).toHaveCount(0);
      expect(requests).toEqual([]);
      await shootForReview(page, "1440-d5e-mdf-off");

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

    test("D5F and D5G: the page's switch asks the same question; a switched-off MDF says so in a banner; with MDF and veneer off, PAL's switch opens the last-active block", async ({
      page,
    }) => {
      await openMaterial(page, MDF);

      await activeSwitch(page, words).click();

      expect(plainText(await itemDialogOf(page).innerText())).toContain(
        romanian("priceDashboard.lifecycle.remaining", {
          options: `${PAL_NAME}, ${VENEER_NAME}`,
        }),
      );
      await itemDialogOf(page)
        .getByRole("button", { name: CONFIRM_SWITCH_OFF(), exact: true })
        .click();
      await expect(activeSwitch(page, words)).toHaveAttribute(
        "aria-checked",
        "false",
      );
      await expect(page.getByTestId("staff-pending-prices")).toHaveCount(0);
      await shootForReview(page, "1440-d5f-mdf-inactive");

      await openMaterialList(page);
      for (const tierId of [MDF, VENEER]) {
        const row = rowOf(page, tierId);
        await menuButtonOf(row).click();
        await menuEntryOf(row, words, "switch-off").click();
        await itemDialogOf(page)
          .getByRole("button", { name: CONFIRM_SWITCH_OFF(), exact: true })
          .click();
      }
      const pal = rowOf(page, PAL);
      await menuButtonOf(pal).click();
      await menuEntryOf(pal, words, "switch-off").click();

      const lastActive = itemDialogOf(page);
      await expect(lastActive).toBeVisible();
      expect(plainText(await lastActive.innerText())).toContain(
        romanian("priceDashboard.lifecycle.lastActiveBody"),
      );
      await expect(lastActive.getByRole("button")).toHaveText([
        romanian("priceDashboard.common.close"),
      ]);
      await expect(lastActive.getByRole("button")).toBeFocused();
      await shootForReview(page, "1440-d5g-last-active");
      await page.keyboard.press("Escape");
      await expect(lastActive).toHaveCount(0);
    });

    test("D5D: Delete on MDF is blocked with the count and offers to disable it instead", async ({
      page,
    }) => {
      await openMaterialList(page);
      const row = rowOf(page, MDF);
      await menuButtonOf(row).click();

      await menuEntryOf(row, words, "delete").click();

      const blocked = itemDialogOf(page);
      await expect(blocked).toBeVisible();
      const text = plainText(await blocked.innerText());
      expect(text).toContain(
        plainText(
          romanian("priceDashboard.lifecycle.deleteBlockedBody", {
            name: MDF_NAME,
            count: MDF_SAVED_KITCHENS,
          }),
        ),
      );
      await expect(
        blocked.getByRole("button", { name: CANCEL(), exact: true }),
      ).toBeFocused();
      await shootForReview(page, "1440-d5d-delete-blocked");
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
          name: MDF_NAME,
        }),
      );
      await itemDialogOf(page)
        .getByRole("button", { name: CANCEL(), exact: true })
        .click();
      expect(await draftChanges(page)).toEqual([]);
    });
  });
});

function insideDialog(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.activeElement?.closest('[role="alertdialog"]') != null,
  );
}

/** The elements of the list, outside the table's titles, whose text is wider than their own box, named. */
function overflowingBoxes(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    const scope = document.querySelector('[data-testid="material-list"]');
    for (const element of scope?.querySelectorAll("*") ?? []) {
      if (!(element instanceof HTMLElement)) continue;
      if (element.closest('[aria-hidden="true"]') !== null) continue;
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

/** How far the second row's top lies below the first's: unchanged by scrolling, changed by a row growing. */
async function distanceBetweenRows(
  page: Page,
  firstTierId: string,
  secondTierId: string,
): Promise<number> {
  const first = await boxOf(rowOf(page, firstTierId));
  const second = await boxOf(rowOf(page, secondTierId));
  return second.y - first.y;
}

/** Whether the box's centre point lands on the box itself or something inside it, and not on a box drawn over it. */
function isTopmostAtCentre(target: Locator): Promise<boolean> {
  return target.evaluate((element) => {
    const { left, top, width, height } = element.getBoundingClientRect();
    const hit = document.elementFromPoint(left + width / 2, top + height / 2);
    return hit !== null && element.contains(hit);
  });
}

/** The table's titles whose text runs into the next title's text, named with the overlap in pixels. */
function overlappingTitles(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const titles = [
      ...document.querySelectorAll(
        '[data-testid="material-list"] > [aria-hidden="true"] > span',
      ),
    ];
    const found: string[] = [];
    for (const [index, title] of titles.entries()) {
      const next = titles[index + 1];
      if (next === undefined) continue;
      const text = document.createRange();
      text.selectNodeContents(title);
      const textRight = Math.max(
        ...Array.from(text.getClientRects()).map((rect) => rect.right),
      );
      const overlap = textRight - next.getBoundingClientRect().left;
      if (overlap > 0) {
        found.push(
          `"${title.textContent.trim()}" runs ${overlap.toFixed(1)} px into the next title`,
        );
      }
    }
    return found;
  });
}
