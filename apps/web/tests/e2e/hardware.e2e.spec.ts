// Wave U4a of M10 on a phone, 390 x 844 with real touch: the hardware screens "Feronerie" (the list, one class, a new class)
// against frames D4A to D4F of the dashboard mockup (docs/design/mockups/Lemnaria Dashboard.dc.html).
//
// WHICH SERVER THIS FILE HOLDS ON (`playwright.config.ts` starts `next start` when `CI` is set, `next dev` otherwise).
// Both serve these pages from the e2e server's fake price book, so the list, a rate's Save, a reload and the refusals run
// under BOTH. What differs is the lifecycle, which has no server behind it yet (R4a, R4b, S3): a production build draws
// every switch and deletion of a class the book states off with its reason and claims no count; `next dev` hands the
// page the sample defaults, the sample counts (Standard 9, Hettich 14, Blum 0) and an in-memory switch, so the dialogs
// can be driven. The tests of the dialogs skip themselves under `CI`, and the test of the off controls skips itself
// without it. A switch never reaches the server, and each page starts from its own copy of it.
//
// NOT REACHABLE, so not asserted here: creating a class (the default client has no creation route, S3, so Create is off
// under both servers, and "appears in the list, deleting it reverts it" cannot be reached); the counting notice (the
// in-memory client answers in a microtask, so the notice is never painted; the test records whether it ever appeared); the
// last-active dialog (Standard is the fixed default, which is judged first, so its entry is off before the dialog could
// open); a switch's survival of a reload (the in-memory client forgets it).
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
  refusalOf,
} from "./support/cabinet-detail-page";
import {
  activeRatesOf,
  boxOf,
  type Box,
  activeSwitch,
  BLUM,
  cancelRatesButton,
  chipsOf,
  CI_ONLY_REASON,
  classPath,
  collectDashboardRequests,
  deleteClassButton,
  DEV_ONLY_REASON,
  draftChanges,
  HARDWARE_PATH,
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
  SERVER_IS_PRODUCTION_BUILD,
  saveRatesButton,
  STANDARD,
  warmHardwareRoutes,
  editPageOf,
  type RateField,
} from "./support/hardware-page";
import {
  discardDraft,
  expectNoSidewaysScroll,
  expectTargetsLargeEnough,
  priceRateLimitKeysOf,
  test,
} from "./support/price-dashboard-session";
import { holdPriceDraft, releasePriceDraft } from "./support/price-draft-lock";
import {
  plainText,
  stickingOut,
  wordsOf,
  type Words,
} from "./support/publish-page";
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
const EDGE_PX = 3;
const HETTICH_SAVED_KITCHENS = 14;
const DRAFT_PATH = "/api/staff/prices/draft";

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

test.describe("the hardware screens on a phone, 390 x 844", () => {
  test.beforeEach(({ page }) => {
    expect(page.viewportSize(), "the viewport this project asked for").toEqual(
      PHONE,
    );
  });

  test.describe("D4A: the list, under either server", () => {
    test("every class is a card with all four rates, the lift among them, at the book's amounts; no field in a card, nothing wider than the screen, every control 44 px; RO and RU", async ({
      page,
    }) => {
      for (const locale of LOCALES) {
        const words = wordsOf(locale);
        await openHardwareList(page, locale);

        await expect(rowsOf(page), locale).toHaveCount(3);
        for (const tierId of [STANDARD, HETTICH, BLUM]) {
          const row = rowOf(page, tierId);
          const active = activeRatesOf(tierId);
          expect(
            await listedRatesOf(row),
            `${locale}: ${tierId} draws the book's four amounts`,
          ).toEqual(active);
          for (const field of RATE_FIELDS) {
            await expect(
              rateCellOf(row, field),
              `${locale}: ${tierId} ${field} is labelled by its column`,
            ).toContainText(words(RATE_COLUMN_KEY[field]));
          }
        }
        await expect(
          rowsOf(page).locator("input, textarea, select, [contenteditable]"),
          `${locale}: a card holds no field`,
        ).toHaveCount(0);
        await expect(
          page.locator('[data-testid="hardware-list"] > [aria-hidden="true"]'),
          `${locale}: the table's column titles are not drawn on a phone`,
        ).toBeHidden();
        await expectNoSidewaysScroll(page, `${locale} list`);
        expect(await stickingOut(page), `${locale} list`).toEqual([]);
        await expectTargetsLargeEnough(
          page,
          '[data-testid="hardware-list"]',
          `${locale} list`,
        );
        await shootForReview(page, `390-d4a-list-${locale}`);
      }
    });

    test("the four rates of a card stand two by two, so none is cut and the lift is the fourth", async ({
      page,
    }) => {
      await openHardwareList(page);

      const row = rowOf(page, HETTICH);
      const boxes = await Promise.all(
        RATE_FIELDS.map((field) => rateCellOf(row, field).boundingBox()),
      );

      const lefts = new Set(boxes.map((box) => Math.round(box?.x ?? -1)));
      const tops = new Set(boxes.map((box) => Math.round(box?.y ?? -1)));
      expect(lefts.size, "two columns").toBe(2);
      expect(tops.size, "two lines").toBe(2);
      const rowBox = await row.boundingBox();
      for (const box of boxes) {
        expect(box, "each rate is drawn").not.toBeNull();
        expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
          (rowBox?.x ?? 0) + (rowBox?.width ?? 0),
        );
      }
    });
  });

  test.describe("the whole card opens the class by a real tap", () => {
    test("taps at the card's corners, its middle and its rates open the class; so does the far corner", async ({
      page,
    }) => {
      const points = [
        {
          name: "top-left corner",
          at: (box: Box) => [box.x + EDGE_PX, box.y + EDGE_PX],
        },
        {
          name: "middle",
          at: (box: Box) => [box.x + box.width / 2, box.y + box.height / 2],
        },
        {
          name: "top-right corner",
          at: (box: Box) => [box.x + box.width - EDGE_PX, box.y + EDGE_PX],
        },
        {
          name: "far bottom-right corner",
          at: (box: Box) => [
            box.x + box.width - EDGE_PX,
            box.y + box.height - EDGE_PX,
          ],
        },
        {
          name: "bottom-left corner",
          at: (box: Box) => [box.x + EDGE_PX, box.y + box.height - EDGE_PX],
        },
      ];

      for (const point of points) {
        await openHardwareList(page);
        const row = rowOf(page, HETTICH);
        await row.scrollIntoViewIfNeeded();
        const box = await boxOf(row);
        const [x = 0, y = 0] = point.at(box);

        await page.touchscreen.tap(x, y);

        await expect(page, `a tap at the ${point.name}`).toHaveURL(
          new RegExp(`${classPath(HETTICH).replaceAll(".", "\\.")}$`),
        );
      }
    });

    // RED ON PURPOSE: DEFECT (judgement on whether the frame wants it, a defect against "the whole card opens the class").
    // `hardware.module.css:131` makes `.rowActions` `position: relative; z-index: 1` inside the max-width 899.98px block, and
    // the box is the card's full width (a flex item of the card's grid), so everything right of "Editează" and the three dots,
    // in their row, is above the name link's stretched `::after` (line 125) and a tap there opens nothing. The other three
    // corners and the far bottom-right corner (in the card's padding) do open it. Fix: let `.rowActions` ignore pointer events
    // and give only its buttons them back, or stand the controls themselves above the link.
    test("a tap on the empty space beside Edit and the three dots opens the class too", async ({
      page,
    }) => {
      await openHardwareList(page);
      const row = rowOf(page, HETTICH);
      await row.scrollIntoViewIfNeeded();
      const more = await boxOf(menuButtonOf(row));
      const rowBox = await boxOf(row);
      const beside = {
        x:
          more.x +
          more.width +
          (rowBox.x + rowBox.width - more.x - more.width) / 2,
        y: more.y + more.height / 2,
      };

      const hit = await page.evaluate(({ x, y }) => {
        const element = document.elementFromPoint(x, y);
        const link = element?.closest("a");
        return {
          element: `${element?.tagName.toLowerCase() ?? "nothing"}.${element?.getAttribute("class") ?? ""}`,
          link: link?.getAttribute("href") ?? null,
        };
      }, beside);
      await page.touchscreen.tap(beside.x, beside.y);

      expect(
        hit.link,
        `the card's own link is what a finger beside the controls hits; it hit ${hit.element}`,
      ).toBe(classPath(HETTICH));
      await expect(page, "a tap beside the controls").toHaveURL(
        new RegExp(`${classPath(HETTICH).replaceAll(".", "\\.")}$`),
      );
    });

    test("with one card's menu open, a tap on the next card's three dots opens that menu at the first tap", async ({
      page,
    }) => {
      await openHardwareList(page);
      const first = rowOf(page, STANDARD);
      const second = rowOf(page, HETTICH);
      await menuButtonOf(first).tap();
      await expect(menuOf(first)).toBeVisible();

      await menuButtonOf(second).tap();

      await expect(
        menuOf(second),
        "the card above closed under the finger and the one below opened",
      ).toBeVisible();
      await expect(menuOf(first)).toHaveCount(0);
    });

    test("Edit opens the class and the three dots open a menu that stands above the stretched link: a tap in the menu navigates nowhere", async ({
      page,
    }) => {
      await openHardwareList(page);
      const row = rowOf(page, HETTICH);
      await row.scrollIntoViewIfNeeded();
      const more = menuButtonOf(row);

      await more.tap();

      await expect(more).toHaveAttribute("aria-expanded", "true");
      const menu = menuOf(row);
      await expect(menu).toBeVisible();
      await expect(menu.getByRole("button")).toHaveCount(2);
      await expectTargetsLargeEnough(
        page,
        `[data-tier-id="${HETTICH}"]`,
        "the menu open",
      );
      const menuBox = await boxOf(menu);
      const topmost = await page.evaluate(
        ({ x, y }) => {
          const element = document.elementFromPoint(x, y);
          return element?.closest("ul[id]") !== null;
        },
        { x: menuBox.x + menuBox.width / 2, y: menuBox.y + EDGE_PX },
      );
      expect(
        topmost,
        "the menu, not the link, is under a finger at its edge",
      ).toBe(true);
      await shootForReview(page, "390-d4f-menu-open");

      // A finger beside a button is snapped to it by the browser, so the padding is not tapped on its own: the entry is.
      const words = wordsOf("ro");
      await menuEntryOf(row, words, "switch-off").tap({ force: true });

      await expect(page, "a tap on a menu entry").toHaveURL(
        new RegExp(`${HARDWARE_PATH}$`),
      );
      if (!SERVER_IS_PRODUCTION_BUILD) {
        await itemDialogOf(page)
          .getByRole("button", {
            name: romanian("priceDashboard.common.cancel"),
            exact: true,
          })
          .tap();
      }
      await expect(more).toHaveAttribute("aria-expanded", "true");
      await menuOutsidePressCloses(page, more);
    });
  });

  test.describe("a class's page: its rates, under either server", () => {
    test("each rate is a field with its unit and the active amount beside it; a refused value says why in the field, switches Save off and sends nothing; RO and RU", async ({
      page,
    }) => {
      const refusals = [
        {
          typed: "abc",
          words: (w: Words) =>
            w("priceDashboard.errors.notNumber", { example: "450,00" }),
        },
        {
          typed: "-5",
          words: (w: Words) => w("priceDashboard.errors.negative"),
        },
        {
          typed: "1,234",
          words: (w: Words) =>
            w("priceDashboard.errors.tooManyDecimals", { example: "450,25" }),
        },
        {
          typed: "85,5",
          words: (w: Words) =>
            w("priceDashboard.errors.notMultipleOfTen", {
              step: "10",
              example: "450",
            }),
        },
        { typed: "", words: (w: Words) => w("priceDashboard.errors.empty") },
        {
          typed: "99999999999999",
          words: (w: Words) => w("priceDashboard.errors.tooBig"),
        },
      ];
      for (const locale of LOCALES) {
        const words = wordsOf(locale);
        await openClass(page, HETTICH, locale);
        const requests = collectDashboardRequests(page);
        for (const field of RATE_FIELDS) {
          await expect(rateField(page, words, field)).toBeVisible();
        }
        await expect(editPageOf(page).locator("input[type=text]")).toHaveCount(
          4,
        );
        await expect(
          saveRatesButton(page, words),
          `${locale}: nothing to save yet`,
        ).toBeDisabled();

        for (const refusal of refusals) {
          const field = rateField(page, words, "perHingeMinor");
          await field.fill(refusal.typed);

          await expect(field, `${locale} "${refusal.typed}"`).toHaveAttribute(
            "aria-invalid",
            "true",
          );
          await expect(
            await refusalOf(field),
            `${locale} "${refusal.typed}" is refused in words`,
          ).toHaveText(refusal.words(words));
          await expect(saveRatesButton(page, words)).toBeDisabled();
          await expect(
            editPageOf(page).getByText(
              words("priceDashboard.errors.fixToSave"),
            ),
          ).toBeVisible();
        }
        await expectNoSidewaysScroll(page, `${locale} refused`);
        await shootForReview(page, `390-d4b-refused-${locale}`);
        await cancelRatesButton(page, words).tap();
        await expect(rateField(page, words, "perHingeMinor")).toHaveValue("85");
        await expect(saveRatesButton(page, words)).toBeDisabled();
        expect(requests, `${locale}: refusals send nothing`).toEqual([]);
      }
    });

    test("Save writes one change per changed rate and not for the others; a reload keeps them; typing the active amounts back takes them out of the draft again", async ({
      page,
    }) => {
      const words = wordsOf("ro");
      await openClass(page, HETTICH);
      const writes = collectWrites(page);

      await rateField(page, words, "perHingeMinor").fill("90");
      await rateField(page, words, "perPushToOpenMinor").fill("130");
      await expectTargetsLargeEnough(
        page,
        '[data-testid="hardware-edit"]',
        "two rates typed",
      );
      await saveRatesButton(page, words).tap();

      await expect(
        editPageOf(page).getByText(
          romanian("priceDashboard.common.priceSavedNotice"),
        ),
      ).toBeVisible();
      expect(writes, "one write per changed rate").toEqual([
        `PUT ${DRAFT_PATH}`,
        `PUT ${DRAFT_PATH}`,
      ]);
      const changes = await draftChanges(page);
      expect(
        changes.map(({ address, value }) => [
          address.tierId,
          address.field,
          value,
        ]),
        "the server holds the two",
      ).toEqual([
        [HETTICH, "perHingeMinor", 9000],
        [HETTICH, "perPushToOpenMinor", 13000],
      ]);
      await expectPendingCount(page, 2);
      await shootForReview(page, "390-d4b-saved");

      await openClass(page, HETTICH);
      await expect(rateField(page, words, "perHingeMinor")).toHaveValue("90");
      await expect(rateField(page, words, "perPushToOpenMinor")).toHaveValue(
        "130",
      );
      await expect(rateField(page, words, "perDrawerMinor")).toHaveValue("626");
      await expect(
        editPageOf(page).getByText(
          romanian("priceDashboard.common.activeValue", { amount: "85 lei" }),
        ),
      ).toBeVisible();
      await expect(
        chipsOf(editPageOf(page)).filter({
          hasText: romanian("priceDashboard.chips.pending"),
        }),
        "a reload keeps the pending chip",
      ).toHaveCount(1);
      await openHardwareList(page);
      const listed = rateCellOf(rowOf(page, HETTICH), "perHingeMinor");
      await expect(
        listed,
        "the list says 90 and what was active",
      ).toContainText(
        romanian("priceDashboard.common.activeThenPending", { active: "85" }),
      );

      await openClass(page, HETTICH);
      const reverts = collectWrites(page);
      await rateField(page, words, "perHingeMinor").fill("85");
      await rateField(page, words, "perPushToOpenMinor").fill("120");
      await saveRatesButton(page, words).tap();

      await expect
        .poll(async () => (await draftChanges(page)).length, {
          message: "retyping the active amounts empties the draft",
        })
        .toBe(0);
      expect(reverts, "one take-back per rate").toEqual([
        `DELETE ${DRAFT_PATH}`,
        `DELETE ${DRAFT_PATH}`,
      ]);
      await expect(
        page.getByTestId("staff-pending-prices"),
        "no pending count is left",
      ).toHaveCount(0);
    });

    test("a Save whose second write fails keeps the first, says so under the failed field, and Save again writes the rest", async ({
      page,
      pageErrors,
    }) => {
      const words = wordsOf("ro");
      await openClass(page, HETTICH);
      let writeNumber = 0;
      await page.route(`**${DRAFT_PATH}`, async (route) => {
        if (route.request().method() !== "PUT") return route.continue();
        writeNumber += 1;
        return writeNumber === 2
          ? route.fulfill({ status: 500, body: "{}" })
          : route.continue();
      });

      await rateField(page, words, "perHingeMinor").fill("90");
      await rateField(page, words, "perDrawerMinor").fill("630");
      await saveRatesButton(page, words).tap();

      const slide = rateField(page, words, "perDrawerMinor");
      await expect(
        editPageOf(page).getByText(
          romanian("priceDashboard.errors.savePartlyFailed"),
        ),
      ).toBeVisible();
      await expect(slide).toHaveAttribute("aria-invalid", "true");
      await expect(
        rateField(page, words, "perHingeMinor"),
        "the field that was written carries no error",
      ).not.toHaveAttribute("aria-invalid", "true");
      expect(
        (await draftChanges(page)).map(({ address }) => address.field),
        "the first write stayed",
      ).toEqual(["perHingeMinor"]);
      await shootForReview(page, "390-d4b-partial-failure");
      await page.unroute(`**${DRAFT_PATH}`);
      const unexpected = pageErrors.filter((entry) => !isNoteOf500(entry));
      expect(
        pageErrors.length - unexpected.length,
        "the browser's one note of the 500",
      ).toBe(1);
      pageErrors.splice(0, pageErrors.length, ...unexpected);

      await saveRatesButton(page, words).tap();

      await expect
        .poll(async () =>
          (await draftChanges(page)).map(({ address }) => address.field),
        )
        .toEqual(["perHingeMinor", "perDrawerMinor"]);
    });
  });

  test.describe("a class's page: Standard is the fixed default, under either server", () => {
    test("its switch and its deletion are off with the catalogue's own words, a tap sends nothing and opens nothing, and it carries the Implicit chip", async ({
      page,
    }) => {
      const words = wordsOf("ro");
      await openClass(page, STANDARD);
      const requests = collectDashboardRequests(page);
      const reason = romanian(
        "priceDashboard.lifecycle.fixedDefaultCannotChange",
      );

      const toggle = activeSwitch(page, words);
      await expect(toggle).toHaveAttribute("aria-disabled", "true");
      await expect(toggle).toHaveAttribute("aria-checked", "true");
      await expect(editPageOf(page).getByText(reason)).toHaveCount(2);
      await expect(deleteClassButton(page, words)).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await expect(
        chipsOf(editPageOf(page)).filter({
          hasText: romanian("priceDashboard.chips.defaultChoice"),
        }),
      ).toHaveCount(1);
      await toggle.tap({ force: true });
      await deleteClassButton(page, words).tap({ force: true });

      await expect(itemDialogOf(page)).toHaveCount(0);
      expect(requests, "an off control sends nothing").toEqual([]);
      await shootForReview(page, "390-d4b-standard-default");

      await openHardwareList(page);
      const row = rowOf(page, STANDARD);
      await menuButtonOf(row).tap();
      for (const which of ["switch-off", "delete"] as const) {
        const entry = menuEntryOf(row, words, which);
        await expect(entry).toHaveAttribute("aria-disabled", "true");
        await entry.tap({ force: true });
      }
      await expect(
        row.getByTestId("menu-reason"),
        "both entries say why, in the catalogue's words",
      ).toHaveText([reason, reason]);
      await expect(itemDialogOf(page)).toHaveCount(0);
      await shootForReview(page, "390-d4f-default-menu");
    });
  });

  test.describe("D4C: a new class, under either server", () => {
    test("Romanian only, a name, a description and four prices; Create stays off and says why, and nothing is sent; refusals show only where something was typed", async ({
      page,
    }) => {
      const words = wordsOf("ro");
      await openNewClass(page);
      const requests = collectDashboardRequests(page);
      const form = page.getByTestId("hardware-create");

      await expect(
        form.getByRole("heading", {
          level: 1,
          name: romanian("priceDashboard.hardware.newTitle"),
        }),
      ).toBeVisible();
      await expect(form.locator("input[type=text]")).toHaveCount(6);
      await expect(
        form.getByLabel(words("priceDashboard.hardware.nameLabel"), {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        form.getByLabel(words("priceDashboard.hardware.descriptionLabel"), {
          exact: true,
        }),
      ).toBeVisible();
      for (const field of RATE_FIELDS) {
        await expect(
          form.getByLabel(
            words(`priceDashboard.hardware.${priceKeyOf(field)}`),
            { exact: true },
          ),
        ).toBeVisible();
      }
      await expect(
        form.getByRole("tab"),
        "no language tabs: Romanian only",
      ).toHaveCount(0);
      await expect(
        form.getByText(romanian("priceDashboard.common.createdTextNote")),
      ).toBeVisible();
      const create = form.getByRole("button", {
        name: romanian("priceDashboard.hardware.createAction"),
        exact: true,
      });
      await expect(create).toBeDisabled();
      await expect(
        form.getByRole("alert"),
        "nothing is scolded before it is touched",
      ).toHaveCount(0);

      await form
        .getByLabel(words("priceDashboard.hardware.nameLabel"), { exact: true })
        .fill("   ");
      await expect(form.getByRole("alert")).toHaveText(
        romanian("priceDashboard.errors.textEmpty"),
      );
      await form
        .getByLabel(words("priceDashboard.hardware.nameLabel"), { exact: true })
        .fill("Grass Test");
      await form
        .getByLabel(words("priceDashboard.hardware.descriptionLabel"), {
          exact: true,
        })
        .fill("Clasa de proba");
      const prices = ["10", "20", "30", "40"];
      for (const [index, field] of RATE_FIELDS.entries()) {
        await form
          .getByLabel(words(`priceDashboard.hardware.${priceKeyOf(field)}`), {
            exact: true,
          })
          .fill(prices[index] ?? "");
      }

      await expect(
        form.getByRole("alert"),
        "all six values are valid",
      ).toHaveCount(0);
      await expect(
        create,
        "every value is valid and Create is still off: no route takes a creation yet (S3)",
      ).toBeDisabled();
      await expect(
        form.getByText(romanian("priceDashboard.lifecycle.cannotJudge")),
        "and the form says so",
      ).toBeVisible();
      await create.tap({ force: true });
      expect(requests, "nothing was sent").toEqual([]);
      await expectNoSidewaysScroll(page, "the new class form");
      await expectTargetsLargeEnough(
        page,
        '[data-testid="hardware-create"]',
        "the new class form",
      );
      await shootForReview(page, "390-d4c-new-class");

      await form
        .getByLabel(words(`priceDashboard.hardware.priceHinge`), {
          exact: true,
        })
        .fill("15");
      await expect(form.getByRole("alert")).toContainText(
        romanian("priceDashboard.errors.notMultipleOfTen", {
          step: "10",
          example: "450",
        }),
      );
    });
  });

  test.describe("a production build (CI): the lifecycle is drawn off, honestly", () => {
    test.skip(!SERVER_IS_PRODUCTION_BUILD, CI_ONLY_REASON);

    test("Hettich and Blum: the menu entries and the class page's switch and deletion are off with the reason, no count is claimed anywhere, and pressing sends nothing", async ({
      page,
    }) => {
      const words = wordsOf("ro");
      const cannotJudge = romanian("priceDashboard.lifecycle.cannotJudge");
      await openHardwareList(page);
      const requests = collectDashboardRequests(page);

      for (const tierId of [HETTICH, BLUM]) {
        const row = rowOf(page, tierId);
        await menuButtonOf(row).tap();
        for (const which of ["switch-off", "delete"] as const) {
          const entry = menuEntryOf(row, words, which);
          await expect(entry, `${tierId} ${which}`).toHaveAttribute(
            "aria-disabled",
            "true",
          );
          await entry.tap({ force: true });
        }
        await expect(row.getByTestId("menu-reason")).toHaveText([
          cannotJudge,
          cannotJudge,
        ]);
      }
      await expect(itemDialogOf(page)).toHaveCount(0);
      expect(
        plainText(await page.getByRole("main").innerText()),
        "no count of saved kitchens is said",
      ).not.toMatch(SAYS_SAVED_KITCHENS_USE_IT);
      await shootForReview(page, "390-d4f-production-menu");

      await openClass(page, HETTICH);
      await expect(activeSwitch(page, words)).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await expect(deleteClassButton(page, words)).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await expect(editPageOf(page).getByText(cannotJudge)).toHaveCount(2);
      await activeSwitch(page, words).tap({ force: true });
      await deleteClassButton(page, words).tap({ force: true });
      await expect(itemDialogOf(page)).toHaveCount(0);
      expect(
        requests,
        "no request was made by pressing an off control",
      ).toEqual([]);
      await shootForReview(page, "390-d4b-production-off");
    });
  });

  test.describe("the sample's working lifecycle (next dev)", () => {
    test.skip(SERVER_IS_PRODUCTION_BUILD, DEV_ONLY_REASON);
    const words = wordsOf("ro");

    test("D4E: switching Hettich off asks first: Cancel has focus, it says who uses it, what remains (never Hettich itself) and that it applies at once; the switch is immediate and the pending count does not move", async ({
      page,
    }) => {
      await openHardwareList(page);
      const requests = collectDashboardRequests(page);
      const row = rowOf(page, HETTICH);
      await row.scrollIntoViewIfNeeded();
      await watchForCountingNotice(page);

      await menuButtonOf(row).tap();
      await menuEntryOf(row, words, "switch-off").tap();

      const dialog = itemDialogOf(page);
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByRole("button", {
          name: romanian("priceDashboard.common.cancel"),
          exact: true,
        }),
      ).toBeFocused();
      const text = plainText(await dialog.innerText());
      expect(text).toContain(
        romanian("priceDashboard.lifecycle.deactivateTitle", {
          name: "Hettich",
        }),
      );
      expect(text).toContain(
        plainText(
          romanian("priceDashboard.lifecycle.usedBy", {
            count: HETTICH_SAVED_KITCHENS,
          }),
        ),
      );
      expect(text).toContain(
        romanian("priceDashboard.lifecycle.clientsCannotChoose"),
      );
      expect(text).toContain(
        romanian("priceDashboard.lifecycle.appliesImmediately"),
      );
      expect(text, "the others that stay on offer, and not Hettich").toContain(
        romanian("priceDashboard.lifecycle.remaining", {
          options: "Standard, Blum",
        }),
      );
      expect(text).not.toContain("Hettich, Hettich");
      expect(text, "no publishing is promised for a switch").not.toMatch(
        PROMISES_PUBLICATION,
      );
      await expectDialogFitsScreen(dialog);
      await expectNoSidewaysScroll(page, "the D4E dialog");
      await expectTargetsLargeEnough(
        page,
        '[role="alertdialog"]',
        "the D4E dialog",
      );
      await shootForReview(page, "390-d4e-deactivate-hettich");

      await dialog
        .getByRole("button", {
          name: romanian("priceDashboard.common.cancel"),
          exact: true,
        })
        .tap();
      await expect(dialog).toHaveCount(0);
      await expect(
        chipsOf(row).filter({
          hasText: romanian("priceDashboard.chips.inactive"),
        }),
      ).toHaveCount(0);

      await menuEntryOf(row, words, "switch-off").tap();
      await dialog
        .getByRole("button", {
          name: romanian("priceDashboard.lifecycle.deactivateConfirm"),
          exact: true,
        })
        .tap();

      await expect(dialog).toHaveCount(0);
      await expect(
        chipsOf(row).filter({
          hasText: new RegExp(`^${romanian("priceDashboard.chips.inactive")}$`),
        }),
        "the chip changes at once",
      ).toHaveCount(1);
      await expect(
        page.getByTestId("staff-pending-prices"),
        "a switch is no pending price",
      ).toHaveCount(0);
      await expect(
        chipsOf(row).filter({
          hasText: romanian("priceDashboard.chips.pending"),
        }),
      ).toHaveCount(0);
      expect(
        requests,
        "a switch never goes through the draft's routes",
      ).toEqual([]);
      await shootForReview(page, "390-d4e-hettich-off");

      await menuEntryOf(row, words, "switch-on").tap();
      const activation = itemDialogOf(page);
      const activationText = plainText(await activation.innerText());
      expect(activationText).toContain(
        romanian("priceDashboard.lifecycle.activateBody"),
      );
      test.info().annotations.push({
        type: "switch-on dialog says it applies at once",
        description: String(
          activationText.includes(
            romanian("priceDashboard.lifecycle.appliesImmediately"),
          ),
        ),
      });
      await expectDialogFitsScreen(activation);
      await activation
        .getByRole("button", {
          name: romanian("priceDashboard.lifecycle.activateConfirm"),
          exact: true,
        })
        .tap();
      await expect(
        chipsOf(row).filter({
          hasText: romanian("priceDashboard.chips.inactive"),
        }),
      ).toHaveCount(0);

      test.info().annotations.push({
        type: "counting notice painted",
        description: String(await countingNoticeWasPainted(page)),
      });
    });

    test("Blum is used by no saved kitchen: its switch-off says nothing of use and names Standard and Hettich; with Hettich and Blum off, switching Standard off opens the last-active block and changes nothing", async ({
      page,
    }) => {
      await openHardwareList(page);
      const blum = rowOf(page, BLUM);
      await menuButtonOf(blum).tap();
      await menuEntryOf(blum, words, "switch-off").tap();
      const dialog = itemDialogOf(page);
      const text = plainText(await dialog.innerText());
      expect(text).toContain(
        romanian("priceDashboard.lifecycle.remaining", {
          options: "Standard, Hettich",
        }),
      );
      expect(text, "no use is claimed").not.toMatch(SAYS_SAVED_KITCHENS_USE_IT);
      await dialog
        .getByRole("button", {
          name: romanian("priceDashboard.lifecycle.deactivateConfirm"),
          exact: true,
        })
        .tap();
      const hettich = rowOf(page, HETTICH);
      await menuButtonOf(hettich).tap();
      await menuEntryOf(hettich, words, "switch-off").tap();
      expect(plainText(await itemDialogOf(page).innerText())).toContain(
        romanian("priceDashboard.lifecycle.remaining", { options: "Standard" }),
      );
      await itemDialogOf(page)
        .getByRole("button", {
          name: romanian("priceDashboard.lifecycle.deactivateConfirm"),
          exact: true,
        })
        .tap();

      const standard = rowOf(page, STANDARD);
      await menuButtonOf(standard).tap();
      await menuEntryOf(standard, words, "switch-off").tap();

      const lastActive = itemDialogOf(page);
      await expect(
        lastActive,
        "the last-active block opens: with the others off it is judged before the fixed default",
      ).toBeVisible();
      const lastText = plainText(await lastActive.innerText());
      expect(lastText).toContain(
        romanian("priceDashboard.lifecycle.lastActiveTitle", {
          name: "Standard",
        }),
      );
      expect(lastText).toContain(
        romanian("priceDashboard.lifecycle.lastActiveBody"),
      );
      await expect(lastActive.getByRole("button")).toHaveText([
        romanian("priceDashboard.common.close"),
      ]);
      await expect(lastActive.getByRole("button")).toBeFocused();
      await expectDialogFitsScreen(lastActive);
      await shootForReview(page, "390-d5g-last-active");
      await lastActive.getByRole("button").tap();
      await expect(lastActive).toHaveCount(0);
      await expect(
        chipsOf(standard).filter({
          hasText: romanian("priceDashboard.chips.inactive"),
        }),
        "nothing was switched",
      ).toHaveCount(0);
    });

    test("D4F/D4E: Delete on a used class blocks with the count and offers to deactivate instead, which leads to the switch-off question; on an unused one it asks, and confirming is refused by the draft route until R4a", async ({
      page,
      pageErrors,
    }) => {
      await openHardwareList(page);
      const hettich = rowOf(page, HETTICH);
      await hettich.scrollIntoViewIfNeeded();
      await menuButtonOf(hettich).tap();

      await menuEntryOf(hettich, words, "delete").tap();

      const blocked = itemDialogOf(page);
      await expect(blocked).toBeVisible();
      const blockedText = plainText(await blocked.innerText());
      expect(blockedText).toContain(
        romanian("priceDashboard.lifecycle.deleteBlockedTitle", {
          name: "Hettich",
        }),
      );
      expect(blockedText).toContain(
        plainText(
          romanian("priceDashboard.lifecycle.deleteBlockedBody", {
            name: "Hettich",
            count: HETTICH_SAVED_KITCHENS,
          }),
        ),
      );
      await expect(
        blocked.getByRole("button", {
          name: romanian("priceDashboard.common.cancel"),
          exact: true,
        }),
      ).toBeFocused();
      await expectDialogFitsScreen(blocked);
      await expectTargetsLargeEnough(
        page,
        '[role="alertdialog"]',
        "the delete-blocked dialog",
      );
      await shootForReview(page, "390-d4d-delete-blocked");
      await blocked
        .getByRole("button", {
          name: romanian("priceDashboard.lifecycle.deactivateInstead"),
          exact: true,
        })
        .tap();
      await expect(
        itemDialogOf(page).getByRole("heading", { level: 2 }),
      ).toHaveText(
        romanian("priceDashboard.lifecycle.deactivateTitle", {
          name: "Hettich",
        }),
      );
      await itemDialogOf(page)
        .getByRole("button", {
          name: romanian("priceDashboard.lifecycle.deactivateConfirm"),
          exact: true,
        })
        .tap();
      await menuEntryOf(hettich, words, "delete").tap();
      await expect(
        itemDialogOf(page).getByRole("button"),
        "an inactive class that is used has only Close",
      ).toHaveText([romanian("priceDashboard.common.close")]);
      await itemDialogOf(page).getByRole("button").tap();

      const blum = rowOf(page, BLUM);
      await menuButtonOf(blum).tap();
      await menuEntryOf(blum, words, "delete").tap();
      const asking = itemDialogOf(page);
      expect(plainText(await asking.innerText())).toContain(
        romanian("priceDashboard.lifecycle.deleteBody"),
      );
      await asking
        .getByRole("button", {
          name: romanian("priceDashboard.common.delete"),
          exact: true,
        })
        .tap();

      // R4a has not built the draft route's deletion yet (`draft-address.ts` reads no `item-deleted`), so the route refuses
      // it with a 400: the dialog stays, says so, and the draft is untouched. When R4a lands this assertion is the one to
      // change, to the deletion in De publicat and the pending count of 1.
      await expect(
        asking.getByText(romanian("priceDashboard.errors.saveFailed")),
        "the refused deletion is said in the dialog, not silently dropped",
      ).toBeVisible();
      expect(await draftChanges(page)).toEqual([]);
      await shootForReview(page, "390-d4d-blum-delete-refused");
      expectBrowsersNoteOf(pageErrors, 400);
    });

    test("the class page asks the same question: its switch names Standard and Blum and never Hettich twice, and turns off at once", async ({
      page,
    }) => {
      await openClass(page, HETTICH);
      const requests = collectDashboardRequests(page);

      await activeSwitch(page, words).tap();

      const dialog = itemDialogOf(page);
      const text = plainText(await dialog.innerText());
      expect(text).toContain(
        romanian("priceDashboard.lifecycle.remaining", {
          options: "Standard, Blum",
        }),
      );
      expect(text).not.toContain("Hettich, Hettich");
      await expectDialogFitsScreen(dialog);
      await shootForReview(page, "390-d4b-switch-off-dialog");
      await dialog
        .getByRole("button", {
          name: romanian("priceDashboard.lifecycle.deactivateConfirm"),
          exact: true,
        })
        .tap();

      await expect(activeSwitch(page, words)).toHaveAttribute(
        "aria-checked",
        "false",
      );
      await expect(page.getByTestId("staff-pending-prices")).toHaveCount(0);
      expect(requests).toEqual([]);
    });
  });
});

/** The dialog lies wholly inside the screen: a phone's dialog is not taller than the screen nor wider. */
async function expectDialogFitsScreen(dialog: Locator): Promise<void> {
  const box = await boxOf(dialog);
  expect(box.x, "left").toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, "right").toBeLessThanOrEqual(PHONE.width);
  expect(box.y, "top").toBeGreaterThanOrEqual(0);
  expect(box.y + box.height, "bottom").toBeLessThanOrEqual(PHONE.height);
}

/** A tap on the page heading, outside the menu, closes it. */
async function menuOutsidePressCloses(
  page: Page,
  more: Locator,
): Promise<void> {
  await page.getByRole("heading", { level: 1 }).tap();
  await expect(more, "an outside tap closes the menu").toHaveAttribute(
    "aria-expanded",
    "false",
  );
}

/** The browser's own console line for a response of 500, which a test that answers one on purpose has to expect. */
function isNoteOf500(entry: string): boolean {
  return entry.startsWith(
    "console: Failed to load resource: the server responded with a status of 500",
  );
}

/** Takes out of the page's errors the browser's one console line for an answer of this status, which the test provoked. */
function expectBrowsersNoteOf(pageErrors: string[], status: number): void {
  const note = `console: Failed to load resource: the server responded with a status of ${String(status)}`;
  const rest = pageErrors.filter((entry) => !entry.startsWith(note));
  expect(
    pageErrors.length - rest.length,
    `the browser's note of the ${String(status)}`,
  ).toBe(1);
  pageErrors.splice(0, pageErrors.length, ...rest);
}

/** Records, from now on, whether the "counting the saved kitchens" notice ever appears in the document. */
async function watchForCountingNotice(page: Page): Promise<void> {
  const counting = romanian("priceDashboard.lifecycle.counting");
  await page.evaluate((needle) => {
    const target = window as unknown as { __countingSeen: boolean };
    target.__countingSeen = false;
    new MutationObserver(() => {
      if (document.body.innerText.includes(needle))
        target.__countingSeen = true;
    }).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }, counting);
}

function countingNoticeWasPainted(page: Page): Promise<boolean> {
  return page.evaluate(
    () => (window as unknown as { __countingSeen: boolean }).__countingSeen,
  );
}

/** The leaf that names a rate's price field. */
function priceKeyOf(field: RateField): string {
  return {
    perHingeMinor: "priceHinge",
    perDrawerMinor: "priceSlide",
    perPushToOpenMinor: "pricePush",
    perLiftMinor: "priceLift",
  }[field];
}
