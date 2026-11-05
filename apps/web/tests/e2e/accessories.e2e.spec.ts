// The accessory screens "Accesorii" (the list, one accessory and the new-accessory form) on a phone, 390 x 844 with real
// touch, against frames D6A to D6C of the dashboard mockup (docs/design/mockups/Lemnaria Dashboard.dc.html).
//
// WHICH SERVER THIS FILE HOLDS ON (`playwright.config.ts` starts `next start` when `CI` is set, `next dev` otherwise), and
// what each gives these pages, is written at the head of `support/accessory-page.ts`. The list, a price's Save, a reload
// and the refusals run under BOTH; the dialogs need the sample lifecycle that only `next dev` draws, and the off controls
// are what `next start` draws. The tests of the dialogs skip themselves under `CI`, and the test of the off controls skips
// itself without it. On `next dev` a switch never reaches the server, and each page starts from its own copy of it.
//
// NOT REACHABLE, so not asserted here: creating an accessory (no route takes a creation until the draft's routes do, so the
// form's Create is off, which a test holds), renaming, deleting a created accessory and opening a linked one (the sample
// book has none); a switch's survival of a reload (the in-memory client forgets it).
//
// The draft is ONE draft in the e2e server's memory, so every test starts and ends by emptying it and the file takes the
// lock the dashboard's specs share.
import {
  countStaffFixturesForTests,
  removeStaffFixturesForTests,
} from "@lemnaria/persistence";
import { expect } from "@playwright/test";
import { SAMPLE_PRICE_BOOK } from "@lemnaria/configurator-domain";

import { formatLeiAmount } from "../../src/price-dashboard/format-lei";

import {
  collectWrites,
  expectPendingCount,
  refusalOf,
  shootViewport,
} from "./support/cabinet-detail-page";
import {
  ACCESSORY_NAME_KEY,
  accessoryPath,
  activePriceOf,
  activeSwitch,
  BUILT_IN_ACCESSORIES,
  cancelPriceButton,
  chipsOf,
  columnTitlesOf,
  createButton,
  createPageOf,
  deleteAccessoryButton,
  DRYING_RACK,
  DRYING_RACK_SAVED_KITCHENS,
  earningCellOf,
  editPageOf,
  linkSelect,
  menuButtonOf,
  menuEntryOf,
  menuOf,
  openAccessory,
  openAccessoryList,
  openNewAccessory,
  priceCellOf,
  priceField,
  rowOf,
  rowsOf,
  savePriceButton,
  SINK_COVER,
  warmAccessoryRoutes,
} from "./support/accessory-page";
import {
  baniOf,
  boxOf,
  CI_ONLY_REASON,
  collectDashboardRequests,
  DEV_ONLY_REASON,
  draftChanges,
  itemDialogOf,
  PROMISES_PUBLICATION,
  SAYS_SAVED_KITCHENS_USE_IT,
  SERVER_IS_PRODUCTION_BUILD,
} from "./support/hardware-page";
import {
  discardDraft,
  expectNoSidewaysScroll,
  expectTargetsLargeEnough,
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

const PHONE = { width: 390, height: 844 } as const;
const LOCALES = ["ro", "ru"] as const;
const FILES_TAKE_TURNS_MS = 600_000;
const DRAFT_PATH = "/api/staff/prices/draft";
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

test.describe("the accessory screens on a phone, 390 x 844", () => {
  test.beforeEach(({ page }) => {
    expect(page.viewportSize(), "the viewport this project asked for").toEqual(
      PHONE,
    );
  });

  test.describe("D6A: the list, under either server", () => {
    test("each built-in accessory is a card with the rule that adds it and its price at the book's amount; no field in a card, nothing wider than the screen, every control 44 px; RO and RU", async ({
      page,
    }) => {
      for (const locale of LOCALES) {
        const words = wordsOf(locale);
        await openAccessoryList(page, locale);

        await expect(rowsOf(page), locale).toHaveCount(2);
        await expect(
          earningCellOf(rowOf(page, SINK_COVER)),
          `${locale}: the cover's rule`,
        ).toContainText(words("priceDashboard.accessories.ruleSinkCover"));
        await expect(
          earningCellOf(rowOf(page, DRYING_RACK)),
          `${locale}: the rack's rule`,
        ).toContainText(words("priceDashboard.accessories.ruleDryingRack"));
        for (const accessoryId of BUILT_IN_ACCESSORIES) {
          const figure = priceCellOf(rowOf(page, accessoryId))
            .locator("span")
            .nth(1);
          expect(
            baniOf(await figure.innerText()),
            `${locale}: ${accessoryId} draws the book's price`,
          ).toBe(activePriceOf(accessoryId));
        }
        await expect(
          rowsOf(page).locator("input, textarea, select, [contenteditable]"),
          `${locale}: a card holds no field`,
        ).toHaveCount(0);
        await expect(
          columnTitlesOf(page),
          `${locale}: the table's column titles are not drawn on a phone`,
        ).toBeHidden();
        await expectNoSidewaysScroll(page, `${locale} list`);
        expect(await stickingOut(page), `${locale} list`).toEqual([]);
        await expectTargetsLargeEnough(
          page,
          '[data-testid="accessory-list"]',
          `${locale} list`,
        );
        await shootForReview(page, `390-d6a-list-${locale}`);
      }
    });

    test("a tap in the card's middle opens the accessory", async ({ page }) => {
      await openAccessoryList(page);
      const row = rowOf(page, DRYING_RACK);
      await row.scrollIntoViewIfNeeded();
      const box = await boxOf(row);

      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);

      await expect(page).toHaveURL(
        new RegExp(`${accessoryPath(DRYING_RACK)}$`),
      );
    });

    test("the three dots open a menu of two entries that stands above the stretched link; the built-in's delete entry is off and says it comes with the catalogue, and a tap on it sends nothing", async ({
      page,
    }) => {
      const words = wordsOf("ro");
      await openAccessoryList(page);
      const requests = collectDashboardRequests(page);
      const row = rowOf(page, DRYING_RACK);
      await row.scrollIntoViewIfNeeded();

      await menuButtonOf(row).tap();

      await expect(menuButtonOf(row)).toHaveAttribute("aria-expanded", "true");
      await expect(menuOf(row).getByRole("button")).toHaveCount(2);
      await expectTargetsLargeEnough(
        page,
        `[data-accessory-id="${DRYING_RACK}"]`,
        "the menu open",
      );
      const remove = menuEntryOf(row, words, "delete");
      await expect(remove).toHaveAttribute("aria-disabled", "true");
      await remove.tap({ force: true });
      await expect(
        row.getByTestId("menu-reason").last(),
        "the delete entry says why, in the accessory's words",
      ).toHaveText(
        romanian("priceDashboard.lifecycle.builtInAccessoryCannotBeDeleted"),
      );
      await expect(itemDialogOf(page)).toHaveCount(0);
      expect(requests, "an off entry sends nothing").toEqual([]);
      await shootForReview(page, "390-d6a-menu-open");

      await page.getByRole("heading", { level: 1 }).tap();
      await expect(
        menuButtonOf(row),
        "an outside tap closes the menu",
      ).toHaveAttribute("aria-expanded", "false");
    });
  });

  test.describe("D6B: an accessory's page, under either server", () => {
    test("a built-in's words and rule are the catalogue's: no field for them, its rule is said, and its deletion is off with the reason", async ({
      page,
    }) => {
      const words = wordsOf("ro");
      await openAccessory(page, SINK_COVER);
      const requests = collectDashboardRequests(page);

      await expect(editPageOf(page).locator("input[type=text]")).toHaveCount(1);
      await expect(editPageOf(page)).toContainText(
        words("priceDashboard.accessories.ruleSinkCover"),
      );
      await expect(editPageOf(page)).toContainText(
        words("priceDashboard.accessories.builtInNote"),
      );
      await expect(deleteAccessoryButton(page, words)).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await expect(
        editPageOf(page).getByText(
          romanian("priceDashboard.lifecycle.alwaysPresentCannotBeDeleted"),
        ),
      ).toBeVisible();
      await deleteAccessoryButton(page, words).tap({ force: true });
      await expect(itemDialogOf(page)).toHaveCount(0);
      expect(requests, "an off control sends nothing").toEqual([]);
      await expectNoSidewaysScroll(page, "the cover's page");
      await shootForReview(page, "390-d6b-cover");
    });

    test("the sink cover's switch is off with the reason that it is always added, under either server; a tap sends nothing and opens nothing", async ({
      page,
    }) => {
      const words = wordsOf("ro");
      await openAccessory(page, SINK_COVER);
      const requests = collectDashboardRequests(page);

      const toggle = activeSwitch(page, words);
      await expect(toggle).toHaveAttribute("aria-disabled", "true");
      await expect(toggle).toHaveAttribute("aria-checked", "true");
      await expect(
        editPageOf(page).getByText(
          romanian("priceDashboard.lifecycle.alwaysPresentCannotChange"),
        ),
      ).toBeVisible();
      await toggle.tap({ force: true });

      await expect(itemDialogOf(page)).toHaveCount(0);
      expect(requests, "an off control sends nothing").toEqual([]);

      await openAccessoryList(page);
      const row = rowOf(page, SINK_COVER);
      await menuButtonOf(row).tap();
      await expect(menuEntryOf(row, words, "switch-off")).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    });

    test("the price is a field with its unit and the active amount beside it; a refused value says why in the field, switches Save off and sends nothing; RO and RU", async ({
      page,
    }) => {
      for (const locale of LOCALES) {
        const words = wordsOf(locale);
        const refusals = [
          { typed: "", words: words("priceDashboard.errors.empty") },
          {
            typed: "125,50",
            words: words("priceDashboard.errors.notMultipleOfTen", {
              step: "10",
              example: "450",
            }),
          },
          {
            typed: "abc",
            words: words("priceDashboard.errors.notNumber", {
              example: "450,00",
            }),
          },
        ];
        await openAccessory(page, DRYING_RACK, locale);
        const requests = collectDashboardRequests(page);
        const field = priceField(page, words);
        await expect(field).toBeVisible();
        await expect(
          savePriceButton(page, words),
          `${locale}: nothing to save yet`,
        ).toBeDisabled();

        for (const refusal of refusals) {
          await field.fill(refusal.typed);

          await expect(field, `${locale} "${refusal.typed}"`).toHaveAttribute(
            "aria-invalid",
            "true",
          );
          await expect(
            await refusalOf(field),
            `${locale} "${refusal.typed}" is refused in words`,
          ).toHaveText(refusal.words);
          await expect(savePriceButton(page, words)).toBeDisabled();
        }
        await expectNoSidewaysScroll(page, `${locale} refused`);
        await shootForReview(page, `390-d6b-refused-${locale}`);
        await cancelPriceButton(page, words).tap();
        await expect(field).toHaveValue(
          String(activePriceOf(DRYING_RACK) / 100),
        );
        expect(requests, `${locale}: refusals send nothing`).toEqual([]);
      }
    });

    test("Save writes one change; a reload keeps it and the list says what was active; typing the active price back takes it out of the draft again", async ({
      page,
    }) => {
      const words = wordsOf("ro");
      const active = activePriceOf(DRYING_RACK);
      await openAccessory(page, DRYING_RACK);
      const writes = collectWrites(page);

      await priceField(page, words).fill("700");
      await expectTargetsLargeEnough(
        page,
        '[data-testid="accessory-edit"]',
        "a price typed",
      );
      await savePriceButton(page, words).tap();

      await expect(
        editPageOf(page).getByText(
          romanian("priceDashboard.common.priceSavedNotice"),
        ),
      ).toBeVisible();
      expect(writes, "one write").toEqual([`PUT ${DRAFT_PATH}`]);
      expect(
        (await draftChanges(page)).map(({ address, value }) => [
          address.kind,
          (address as { accessoryId?: string }).accessoryId,
          address.field,
          value,
        ]),
        "the server holds the one change, in bani",
      ).toEqual([["accessory", DRYING_RACK, "perUnitMinor", 70_000]]);
      await expectPendingCount(page, 1);
      await shootForReview(page, "390-d6b-saved");

      await openAccessory(page, DRYING_RACK);
      await expect(priceField(page, words)).toHaveValue("700");
      await expect(
        chipsOf(editPageOf(page)).filter({
          hasText: romanian("priceDashboard.chips.pending"),
        }),
        "a reload keeps the pending chip",
      ).toHaveCount(1);
      await openAccessoryList(page);
      const listed = priceCellOf(rowOf(page, DRYING_RACK));
      expect(
        baniOf(await listed.locator("span").nth(1).innerText()),
        "the list says the new price",
      ).toBe(70_000);
      await expect(listed, "and what was active").toContainText(
        plainText(
          romanian("priceDashboard.common.activeThenPending", {
            active: formatLeiAmount(active),
          }),
        ),
      );

      await openAccessory(page, DRYING_RACK);
      await priceField(page, words).fill(String(active / 100));
      await savePriceButton(page, words).tap();

      await expect
        .poll(async () => (await draftChanges(page)).length, {
          message: "retyping the active price empties the draft",
        })
        .toBe(0);
    });
  });

  test.describe("D6B: the new accessory, under either server", () => {
    test("the form has a Romanian name and description, a cabinet type chosen from the rows the manufacturer supplies, and a price, and no Russian field; Create is off with the reason, and nothing is sent", async ({
      page,
    }) => {
      for (const locale of LOCALES) {
        const words = wordsOf(locale);
        await openNewAccessory(page, locale);
        const requests = collectDashboardRequests(page);

        await expect(
          createPageOf(page).locator("input[type=text]"),
          `${locale}: name, description and price`,
        ).toHaveCount(3);
        const select = linkSelect(page, words);
        await expect(select).toHaveValue("");
        const offered = await select
          .locator("option")
          .evaluateAll((options) =>
            options.map((option) => (option as HTMLOptionElement).value),
          );
        const customerRows = SAMPLE_PRICE_BOOK.cabinetRules
          .filter((rule) => rule.suppliedBy === "customer")
          .map((rule) => rule.buildId);
        expect(customerRows.length).toBeGreaterThan(0);
        expect(
          offered.length,
          `${locale}: a placeholder and the rows`,
        ).toBeGreaterThan(5);
        for (const row of customerRows) expect(offered).not.toContain(row);
        await expect(createButton(page, words)).toBeDisabled();
        await createPageOf(page)
          .getByLabel(words("priceDashboard.accessories.nameLabel"), {
            exact: true,
          })
          .fill("Suport");
        await select.selectOption({ index: 1 });
        await createPageOf(page)
          .getByLabel(words("priceDashboard.accessories.pricePerPiece"), {
            exact: true,
          })
          .fill("80");
        await expect(
          createButton(page, words),
          `${locale}: no route takes a creation, so Create stays off`,
        ).toBeDisabled();
        await expect(createPageOf(page)).toContainText(
          words("priceDashboard.lifecycle.cannotJudge"),
        );
        await expectNoSidewaysScroll(page, `${locale} new accessory`);
        expect(await stickingOut(page), `${locale} new accessory`).toEqual([]);
        await expectTargetsLargeEnough(
          page,
          '[data-testid="accessory-create"]',
          `${locale} new accessory`,
        );
        await shootForReview(page, `390-d6b-new-${locale}`);
        expect(requests, `${locale}: nothing was sent`).toEqual([]);
      }
    });
  });

  test.describe("a production build (CI): the lifecycle is drawn off, honestly", () => {
    test.skip(!SERVER_IS_PRODUCTION_BUILD, CI_ONLY_REASON);

    test("each built-in: the switch entry is off (the cover because it is always added, the rack because nothing can be checked), the delete entry says it comes with the catalogue, no count is claimed anywhere, and pressing sends nothing", async ({
      page,
    }) => {
      const words = wordsOf("ro");
      const cannotJudge = romanian("priceDashboard.lifecycle.cannotJudge");
      const alwaysPresent = romanian(
        "priceDashboard.lifecycle.alwaysPresentCannotChange",
      );
      const builtIn = romanian(
        "priceDashboard.lifecycle.builtInAccessoryCannotBeDeleted",
      );
      const alwaysPresentDelete = romanian(
        "priceDashboard.lifecycle.alwaysPresentCannotBeDeleted",
      );
      await openAccessoryList(page);
      const requests = collectDashboardRequests(page);

      for (const accessoryId of BUILT_IN_ACCESSORIES) {
        const row = rowOf(page, accessoryId);
        await menuButtonOf(row).tap();
        for (const which of ["switch-off", "delete"] as const) {
          const entry = menuEntryOf(row, words, which);
          await expect(entry, `${accessoryId} ${which}`).toHaveAttribute(
            "aria-disabled",
            "true",
          );
          await entry.tap({ force: true });
        }
        await expect(row.getByTestId("menu-reason")).toHaveText([
          accessoryId === SINK_COVER ? alwaysPresent : cannotJudge,
          accessoryId === SINK_COVER ? alwaysPresentDelete : builtIn,
        ]);
      }
      await expect(itemDialogOf(page)).toHaveCount(0);
      expect(
        plainText(await page.getByRole("main").innerText()),
        "no count of saved kitchens is said",
      ).not.toMatch(SAYS_SAVED_KITCHENS_USE_IT);
      await shootForReview(page, "390-d6a-production-menu");

      await openAccessory(page, DRYING_RACK);
      await expect(activeSwitch(page, words)).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await expect(editPageOf(page).getByText(cannotJudge)).toHaveCount(1);
      await activeSwitch(page, words).tap({ force: true });
      await deleteAccessoryButton(page, words).tap({ force: true });
      await expect(itemDialogOf(page)).toHaveCount(0);
      expect(
        requests,
        "no request was made by pressing an off control",
      ).toEqual([]);
      await shootForReview(page, "390-d6b-production-off");
    });
  });

  test.describe("the sample's working lifecycle (next dev)", () => {
    test.skip(SERVER_IS_PRODUCTION_BUILD, DEV_ONLY_REASON);
    const words = wordsOf("ro");

    test("D6C: switching the rack off asks first, in the accessory's words: Cancel has focus, it says how many kitchens use it, that customers no longer get it and that it applies at once; the dialog fits the phone; the switch is immediate and the pending count does not move", async ({
      page,
    }) => {
      await openAccessoryList(page);
      const requests = collectDashboardRequests(page);
      const row = rowOf(page, DRYING_RACK);
      await row.scrollIntoViewIfNeeded();

      await menuButtonOf(row).tap();
      await menuEntryOf(row, words, "switch-off").tap();

      const dialog = itemDialogOf(page);
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: CANCEL(), exact: true }),
      ).toBeFocused();
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
        romanian("priceDashboard.lifecycle.clientsNoLongerGetAccessory"),
      );
      expect(text).toContain(
        romanian("priceDashboard.lifecycle.accessoryRemovedExplained"),
      );
      expect(text).toContain(
        romanian("priceDashboard.lifecycle.appliesImmediately"),
      );
      expect(text, "an accessory is never called an option").not.toMatch(
        /op.iun/i,
      );
      expect(text, "no publishing is promised for a switch").not.toMatch(
        PROMISES_PUBLICATION,
      );
      await expectDialogFitsScreen(dialog);
      await expectNoSidewaysScroll(page, "the D6C dialog");
      await expectTargetsLargeEnough(
        page,
        '[role="alertdialog"]',
        "the D6C dialog",
      );
      await shootViewport(page, "390-d6c-deactivate-rack");

      await dialog.getByRole("button", { name: CANCEL(), exact: true }).tap();
      await expect(dialog).toHaveCount(0);
      await expect(
        chipsOf(row).filter({
          hasText: romanian("priceDashboard.chips.inactive"),
        }),
      ).toHaveCount(0);

      await menuEntryOf(row, words, "switch-off").tap();
      await dialog
        .getByRole("button", { name: CONFIRM_SWITCH_OFF(), exact: true })
        .tap();

      await expect(dialog).toHaveCount(0);
      await expect(
        chipsOf(row).filter({
          hasText: romanian("priceDashboard.chips.inactive"),
        }),
        "the chip changes at once",
      ).toHaveCount(1);
      await expect(
        page.getByTestId("staff-pending-prices"),
        "a switch is no pending price",
      ).toHaveCount(0);
      expect(
        requests,
        "a switch never goes through the draft's routes",
      ).toEqual([]);
      await shootForReview(page, "390-d6c-rack-off");

      await menuEntryOf(row, words, "switch-on").tap();
      const activation = itemDialogOf(page);
      expect(plainText(await activation.innerText())).toContain(
        romanian("priceDashboard.lifecycle.activateAccessoryBody"),
      );
      await expectDialogFitsScreen(activation);
      await activation
        .getByRole("button", { name: CONFIRM_SWITCH_ON(), exact: true })
        .tap();
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

      await activeSwitch(page, words).tap();
      const dialog = itemDialogOf(page);
      await expect(dialog.getByRole("heading", { level: 2 })).toHaveText(
        romanian("priceDashboard.lifecycle.deactivateTitle", {
          name: RACK_NAME,
        }),
      );
      await dialog
        .getByRole("button", { name: CONFIRM_SWITCH_OFF(), exact: true })
        .tap();

      await expect(activeSwitch(page, words)).toHaveAttribute(
        "aria-checked",
        "false",
      );
      await expect(deleteAccessoryButton(page, words)).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await expect(
        page.getByTestId("staff-pending-prices"),
        "a switch is no pending price",
      ).toHaveCount(0);
      await shootForReview(page, "390-d6c-page-switched-off");
    });
  });
});

async function expectDialogFitsScreen(
  dialog: ReturnType<typeof itemDialogOf>,
): Promise<void> {
  const box = await boxOf(dialog);
  expect(box.x, "left").toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, "right").toBeLessThanOrEqual(PHONE.width);
  expect(box.y, "top").toBeGreaterThanOrEqual(0);
  expect(box.y + box.height, "bottom").toBeLessThanOrEqual(PHONE.height);
}
