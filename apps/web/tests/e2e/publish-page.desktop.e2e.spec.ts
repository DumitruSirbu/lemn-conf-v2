// Waves U5b and U5c of M10 at 1440 x 900 with a pointer: the publish page "Publicare prețuri", its history tab and one
// version's page, against frames D7A to D8C of the dashboard mock-up (docs/design/mockups/Lemnaria Dashboard.dc.html).
//
// WHICH SERVER THIS FILE HOLDS ON. Both: the pages read the server's own draft and history, in a development server and
// in the production build that CI serves, and write through the dashboard's routes. Each test that needs a pending draft
// seeds it through those routes (`seedPendingDraft`) and the hooks below empty it again.
//
// NOT DRIVEN HERE, and why. No test publishes, and none restores: a publish moves the active version for every other
// spec of the same server, and the server holds one version. So the success of a publish, the history pager (more than
// one page of versions), an archived version's page with its restore, the refusal list of a publish the catalogue
// refused, a draft that cannot be read and the "Se publică…" frame are covered by the DOM and route-contract tests, and
// their proof against a database waits for the Z gate.
//
// The draft is ONE draft in the e2e server's memory and this file takes the lock the dashboard's specs share.
import {
  countStaffFixturesForTests,
  removeStaffFixturesForTests,
} from "@lemnaria/persistence";
import { expect, type Locator, type Page } from "@playwright/test";

import {
  expectPendingCount,
  isBrowsersNoteOfA404,
} from "./support/cabinet-detail-page";
import {
  discardDraft,
  expectNoSidewaysScroll,
  priceRateLimitKeysOf,
  test,
} from "./support/price-dashboard-session";
import { holdPriceDraft, releasePriceDraft } from "./support/price-draft-lock";
import {
  describeFocus,
  dialogOf,
  diffRows,
  EDITABLE_PRICES_IN_SEED,
  heightOf,
  isBrowsersNoteOfARefusal,
  HISTORY_PATH,
  measureOpenField,
  newValueButtons,
  nouCellOf,
  newValueField,
  noticeOf,
  openPublish,
  openVersion,
  PENDING_IN_SEED,
  readVersions,
  pageOf,
  provisionalSwitch,
  publishButton,
  PUBLISH_PATH,
  RUSSIAN_PUBLISH_PATH,
  restoreButton,
  revertButtons,
  seedPendingDraft,
  versionNameField,
  startsWithNewValue,
  versionPathOf,
  wordsBrokenIn,
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

const DESKTOP = { width: 1440, height: 900 } as const;
const WIDTHS_OF_THE_DESKTOP_LINE = [900, 1024, 1280, 1440, 1920] as const;
const LOCALES = ["ro", "ru"] as const;
/** Where the three prices that can be corrected stand among the rows: the cabinet's, the hinge's and the rack's. */
const ROWS_OF_THE_EDITABLE_PRICES = [0, 5, 6] as const;
const SHORT_WAIT_MS = 3_000;
const FILES_TAKE_TURNS_MS = 600_000;
const MAX_NAME_LENGTH = 80;
const PENDING_ANCHOR_LEI = "4020";
const OTHER_TEN_LEI = "4030";
const NOT_A_MULTIPLE_OF_TEN = "1234";
const VERSION_NAME = "Autumn prices";

let signedIn: SignedInAdministrator;
let rateLimitKeys: readonly string[] = [];

test.beforeAll(async () => {
  test.setTimeout(FILES_TAKE_TURNS_MS);
  await holdPriceDraft();
  signedIn = await plantSignedInAdministrator();
  rateLimitKeys = priceRateLimitKeysOf(signedIn);
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

test.describe("the publish page at desktop 1440", () => {
  test.beforeEach(({ page }) => {
    expect(page.viewportSize(), "the viewport this project asked for").toEqual(
      DESKTOP,
    );
  });

  test.describe("over the dashboard's routes", () => {
    const words = wordsOf("ro");

    test.beforeEach(async ({ context }) => {
      await seedPendingDraft(context);
    });

    test.describe("D7A: the pending list", () => {
      test("the table and the panel stand side by side, the frame counts the draft, and nothing scrolls sideways", async ({
        page,
      }) => {
        await openPublish(page);

        await expect(
          page.getByRole("heading", {
            level: 1,
            name: romanian("priceDashboard.publish.title"),
          }),
        ).toBeVisible();
        await expectPendingCount(page, PENDING_IN_SEED);
        await expect(diffRows(page)).toHaveCount(PENDING_IN_SEED);
        const table = await page.getByTestId("diff-table").boundingBox();
        const nameField = await versionNameField(page, words).boundingBox();
        const button = await publishButton(
          page,
          words,
          PENDING_IN_SEED,
        ).boundingBox();
        expect(table, "the table is drawn").not.toBeNull();
        expect(nameField, "the version name is drawn").not.toBeNull();
        expect(button, "the publish button is drawn").not.toBeNull();
        expect(
          (table?.x ?? 0) + (table?.width ?? 0),
          "the table ends before the panel starts",
        ).toBeLessThanOrEqual(nameField?.x ?? 0);
        expect(
          nameField?.y ?? 0,
          "D7A: the name field heads the panel, the button ends it",
        ).toBeLessThan(button?.y ?? 0);
        await expectNoSidewaysScroll(page, "the pending list at 1440");
        await shootForReview(page, "1440-d7a-pending");
      });

      test("the frame's tabs carry the count, and the two tabs are links to the two addresses", async ({
        page,
      }) => {
        await openPublish(page);

        const tabs = page.getByRole("navigation", {
          name: romanian("priceDashboard.publish.title"),
        });
        await expect(
          tabs.getByRole("link", {
            name: new RegExp(romanian("priceDashboard.publish.tabPending")),
          }),
        ).toHaveAttribute("aria-current", "page");
        await expect(
          tabs.getByRole("link", {
            name: romanian("priceDashboard.publish.tabHistory"),
          }),
        ).toHaveAttribute("href", HISTORY_PATH);
      });

      test("a price is a button that opens a field; a percentage, a bulk member and the switch's row are plain figures", async ({
        page,
      }) => {
        await openPublish(page);

        await expect(newValueButtons(page, words)).toHaveCount(
          EDITABLE_PRICES_IN_SEED,
        );
        const inBulkGroup = page
          .getByTestId("diff-group")
          .locator("[data-testid='diff-row']");
        await expect(inBulkGroup).toHaveCount(2);
        await expect(
          inBulkGroup.locator("input, [class*='priceButton']"),
          "a bulk group's members are not corrected one by one",
        ).toHaveCount(0);
      });
    });

    test.describe("the inline correction of a price, by keyboard", () => {
      test("Enter opens the field on the price, selected; Enter on a new ten saves it into the row and gives focus back to the button", async ({
        page,
      }) => {
        await openPublish(page);
        const button = newValueButtons(page, words).first();
        await button.focus();

        await page.keyboard.press("Enter");

        const field = newValueField(page, words);
        await expect(field).toBeFocused();
        expect(
          await field.evaluate(
            (input: HTMLInputElement) =>
              input.selectionStart === 0 &&
              input.selectionEnd === input.value.length,
          ),
          "the typed text is selected, so typing replaces it",
        ).toBe(true);
        await expect(field).toHaveValue(PENDING_ANCHOR_LEI);
        await shootForReview(page, "1440-d7a-field-open");

        await page.keyboard.type(OTHER_TEN_LEI);
        await page.keyboard.press("Enter");

        await expect(field).toHaveCount(0);
        await expect(nouCellOf(diffRows(page).first())).toContainText(
          /4\s030\s*lei/,
        );
        await expect(button).toBeFocused();
        await expectPendingCount(page, PENDING_IN_SEED);
        await expect(diffRows(page).first()).toContainText("+70");
      });

      test("Esc closes the field and sends nothing, whatever was typed; focus returns to the button", async ({
        page,
      }) => {
        await openPublish(page);
        const button = newValueButtons(page, words).first();
        await button.focus();
        await page.keyboard.press("Enter");
        await page.keyboard.type(OTHER_TEN_LEI);

        await page.keyboard.press("Escape");

        await expect(newValueField(page, words)).toHaveCount(0);
        await expect(button).toBeFocused();
        await expect(
          nouCellOf(diffRows(page).first()),
          "the row still says what it said",
        ).toContainText(/4\s020\s*lei/);
      });

      const REFUSED_TEXTS: readonly {
        readonly typed: string;
        readonly reason: string;
      }[] = [
        {
          typed: NOT_A_MULTIPLE_OF_TEN,
          reason: romanian("priceDashboard.errors.notMultipleOfTen", {
            step: 10,
            example: "450",
          }),
        },
        {
          typed: "4025",
          reason: romanian("priceDashboard.errors.notMultipleOfTen", {
            step: 10,
            example: "450",
          }),
        },
        {
          typed: "abc",
          reason: romanian("priceDashboard.errors.notNumber", {
            example: "450,00",
          }),
        },
        {
          typed: "-10",
          reason: romanian("priceDashboard.errors.negative"),
        },
        { typed: "", reason: romanian("priceDashboard.errors.empty") },
      ];

      test("a value that is not a whole ten of lei, a number, or anything at all is refused in the field: it stays open, invalid, and nothing is sent", async ({
        page,
      }) => {
        await openPublish(page);
        const button = newValueButtons(page, words).first();

        for (const { typed, reason } of REFUSED_TEXTS) {
          await button.click();
          const field = newValueField(page, words);
          await field.fill(typed);
          await field.press("Enter");

          await expect(
            pageOf(page).getByRole("alert").filter({ hasText: reason }),
            `${JSON.stringify(typed)} is refused with its reason`,
          ).toBeVisible();
          await expect(field, typed).toHaveAttribute("aria-invalid", "true");
          await expect(field, typed).toBeFocused();
          const described = await field.getAttribute("aria-describedby");
          expect(
            described,
            "the reason is the one the field names, so it is read with it",
          ).not.toBeNull();
          await expectPendingCount(page, PENDING_IN_SEED);
          await field.press("Escape");
          await expect(
            nouCellOf(diffRows(page).first()),
            `${JSON.stringify(typed)} changed nothing`,
          ).toContainText(/4\s020\s*lei/);
        }
      });

      test("typing the draft's own price closes the field, sends nothing, and the count stays", async ({
        page,
      }) => {
        await openPublish(page);
        const button = newValueButtons(page, words).first();
        await button.click();
        const field = newValueField(page, words);

        await field.fill(PENDING_ANCHOR_LEI);
        await field.press("Enter");

        await expect(
          field,
          "the draft's own value closes the field",
        ).toHaveCount(0);
        await expectPendingCount(page, PENDING_IN_SEED);
        await expect(nouCellOf(diffRows(page).first())).toContainText(
          /4\s020\s*lei/,
        );
      });

      test("typing the active price removes the row, and focus goes to the arrow now standing where the row stood", async ({
        page,
        context,
      }) => {
        for (
          let position = 0;
          position < EDITABLE_PRICES_IN_SEED;
          position += 1
        ) {
          await discardDraft(context);
          await seedPendingDraft(context);
          await openPublish(page);
          const arrows = revertButtons(page);
          const rowsBefore = await diffRows(page).count();
          const priceButton = newValueButtons(page, words).nth(position);
          const ownArrow = priceButton.locator(
            "xpath=ancestor::li[@data-testid='diff-row'][1]//button[@data-testid='diff-revert']",
          );
          const index = await arrows.evaluateAll(
            (all, own) => all.indexOf(own as HTMLElement),
            await ownArrow.elementHandle(),
          );
          const successor = await arrows
            .nth(index + 1)
            .getAttribute("aria-label");
          const activeLei = await activeLeiOfRow(priceButton);
          await priceButton.focus();
          await page.keyboard.press("Enter");

          await page.keyboard.type(activeLei);
          await page.keyboard.press("Enter");

          await expect(diffRows(page), `price ${String(position)}`).toHaveCount(
            rowsBefore - 1,
          );
          await expectPendingCount(page, PENDING_IN_SEED - 1);
          expect(
            await page.evaluate(
              () => document.activeElement?.getAttribute("aria-label") ?? null,
            ),
            `focus after price ${String(position)} left, now on ${await describeFocus(page)}`,
          ).toBe(successor);
        }
      });
    });

    test.describe("the long label in the narrow cell, at every width of the desktop line", () => {
      test("no word of a row is broken, and an open field, with its refusal under it, fits its cell, grows its row and does not scroll the table, in RO and RU", async ({
        page,
      }) => {
        test.setTimeout(240_000);
        for (const locale of LOCALES) {
          const localised = wordsOf(locale);
          for (const width of WIDTHS_OF_THE_DESKTOP_LINE) {
            await page.setViewportSize({ width, height: DESKTOP.height });
            await openPublish(
              page,
              locale === "ro" ? PUBLISH_PATH : RUSSIAN_PUBLISH_PATH,
            );
            for (const [
              position,
              rowIndex,
            ] of ROWS_OF_THE_EDITABLE_PRICES.entries()) {
              await checkOneRowAtWidth(page, localised, {
                row: diffRows(page).nth(rowIndex),
                where: `${locale} at ${String(width)} px, price ${String(position)}`,
                shot:
                  position === 0
                    ? `d7a-open-field-${String(width)}-${locale}`
                    : undefined,
              });
            }
          }
        }
      });
    });

    test.describe("publish while a field holds text that was not sent", () => {
      test("publish is off with its reason beside it, a press does nothing, and it is back when the field is closed", async ({
        page,
      }) => {
        await openPublish(page);
        await versionNameField(page, words).fill(VERSION_NAME);
        const publish = publishButton(page, words, PENDING_IN_SEED);
        await expect(publish, "nothing is unsent yet").not.toHaveAttribute(
          "aria-disabled",
          "true",
        );
        await newValueButtons(page, words).first().click();
        await expect(
          publish,
          "an open field with the draft's own figure holds nothing unsent",
        ).not.toHaveAttribute("aria-disabled", "true");

        await newValueField(page, words).fill("4031");

        await expect(publish).toHaveAttribute("aria-disabled", "true");
        const reason = pageOf(page).getByText(
          romanian("priceDashboard.publish.unsentAmountHint"),
        );
        await expect(reason).toBeVisible();
        const describedBy = await publish.getAttribute("aria-describedby");
        expect(
          await page.locator(`[id="${describedBy ?? ""}"]`).innerText(),
          "the button names the reason it is off",
        ).toBe(await reason.innerText());
        await publish.click({ force: true });
        await expect(dialogOf(page), "a press on it opens nothing").toHaveCount(
          0,
        );
        await shootForReview(page, "1440-d7a-publish-off-unsent");

        await newValueField(page, words).press("Escape");

        await expect(reason).toHaveCount(0);
        await expect(publish).not.toHaveAttribute("aria-disabled", "true");
      });

      test("it stays off while any one of two fields holds unsent text, and a refused value is unsent too", async ({
        page,
      }) => {
        await openPublish(page);
        await versionNameField(page, words).fill(VERSION_NAME);
        const publish = publishButton(page, words, PENDING_IN_SEED);
        const buttons = newValueButtons(page, words);
        const fields = newValueField(page, words);
        await buttons.first().click();
        await fields.first().fill(NOT_A_MULTIPLE_OF_TEN);
        await buttons.first().click();
        await fields.nth(1).fill("46");
        await expect(publish).toHaveAttribute("aria-disabled", "true");

        await fields.nth(1).press("Escape");

        await expect(
          publish,
          "the first field still holds a refused value",
        ).toHaveAttribute("aria-disabled", "true");
        await fields.first().press("Escape");
        await expect(publish).not.toHaveAttribute("aria-disabled", "true");
      });
    });

    test.describe("the version's name", () => {
      const BLANK_NAMES = ["", "   "];

      test("a name that is empty is refused before any question is asked, and typing clears the refusal", async ({
        page,
      }) => {
        await openPublish(page);
        const publish = publishButton(page, words, PENDING_IN_SEED);

        for (const blank of BLANK_NAMES) {
          await versionNameField(page, words).fill(blank);
          await publish.click();

          await expect(
            pageOf(page)
              .getByRole("alert")
              .filter({
                hasText: romanian("priceDashboard.publish.versionNameEmpty"),
              }),
            JSON.stringify(blank),
          ).toBeVisible();
          await expect(dialogOf(page)).toHaveCount(0);
          await expect(versionNameField(page, words)).toHaveAttribute(
            "aria-invalid",
            "true",
          );
        }
        await versionNameField(page, words).fill("a");
        await expect(
          pageOf(page)
            .getByRole("alert")
            .filter({
              hasText: romanian("priceDashboard.publish.versionNameEmpty"),
            }),
        ).toHaveCount(0);
      });

      test("a name of 81 characters, one with a direction control, and one that shows nothing are refused when the question is confirmed; 80 reaches the question", async ({
        page,
        pageErrors,
      }) => {
        const refused: readonly {
          readonly name: string;
          readonly reason: string;
        }[] = [
          {
            name: "n".repeat(MAX_NAME_LENGTH + 1),
            reason: romanian("priceDashboard.publish.versionNameTooLong"),
          },
          {
            name: "ab‮cd",
            reason: romanian("priceDashboard.publish.versionNameForbidden"),
          },
          {
            name: "⠀⠀",
            reason: romanian("priceDashboard.publish.versionNameEmpty"),
          },
        ];
        await openPublish(page);
        await confirmableDraft(page, words);
        for (const { name, reason } of refused) {
          await versionNameField(page, words).fill(name);

          await askAndConfirmPublish(page, words);

          await expect(
            pageOf(page).getByRole("alert").filter({ hasText: reason }),
            JSON.stringify(name),
          ).toBeVisible();
          await expect(noticeOf(page), "nothing was published").toHaveCount(0);
          await expect(diffRows(page)).toHaveCount(PENDING_IN_SEED - 1);
        }

        await expect
          .poll(
            () => pageErrors.filter(isBrowsersNoteOfARefusal).length,
            "the browser notes each refusal of the route, and only those",
          )
          .toBe(refused.length);
        const unexpected = pageErrors.filter(
          (error) => !isBrowsersNoteOfARefusal(error),
        );
        pageErrors.length = 0;
        expect(unexpected, "no other console error").toEqual([]);

        await versionNameField(page, words).fill("n".repeat(MAX_NAME_LENGTH));
        await publishButton(page, words, PENDING_IN_SEED - 1).click();
        await expect(
          dialogOf(page),
          "the longest name is accepted as far as the question",
        ).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(dialogOf(page)).toHaveCount(0);
      });
    });

    test.describe("D7C: the draft turns the provisional figures off", () => {
      test("the question opens on its check box, the confirmation is off until it is ticked, Tab stays inside, Esc closes and focus returns", async ({
        page,
      }) => {
        await openPublish(page);
        await versionNameField(page, words).fill(VERSION_NAME);
        const publish = publishButton(page, words, PENDING_IN_SEED);

        await publish.click();

        const dialog = dialogOf(page);
        await expect(dialog).toBeVisible();
        await expect(
          dialog.getByRole("heading", {
            name: romanian("priceDashboard.publish.provisionalOffTitle"),
          }),
        ).toBeVisible();
        const check = dialog.getByRole("checkbox");
        await expect(
          check,
          "D7C: the check box is where focus starts",
        ).toBeFocused();
        const confirm = dialog.getByRole("button", {
          name: romanian("priceDashboard.publish.provisionalOffConfirm"),
        });
        await expect(confirm).toHaveAttribute("aria-disabled", "true");
        await shootForReview(page, "1440-d7c-provisional-off");
        await confirm.click({ force: true });
        await expect(
          dialog,
          "a press on the off confirmation does nothing",
        ).toBeVisible();
        await expect(noticeOf(page)).toHaveCount(0);
        await expectFocusStaysInside(page, dialog);

        await page.keyboard.press("Escape");

        await expect(dialog).toHaveCount(0);
        await expect(publish, "focus returns to what asked").toBeFocused();
        await expectPendingCount(page, PENDING_IN_SEED);
        await expect(diffRows(page)).toHaveCount(PENDING_IN_SEED);
      });

      test("ticking it turns the confirmation on, and Esc then closes it with nothing published", async ({
        page,
      }) => {
        await openPublish(page);
        await versionNameField(page, words).fill(VERSION_NAME);
        await publishButton(page, words, PENDING_IN_SEED).click();
        const dialog = dialogOf(page);
        await dialog.getByRole("checkbox").check();
        const confirm = dialog.getByRole("button", {
          name: romanian("priceDashboard.publish.provisionalOffConfirm"),
        });
        await expect(confirm).not.toHaveAttribute("aria-disabled", "true");

        await page.keyboard.press("Escape");

        await expect(dialog).toHaveCount(0);
        await expect(noticeOf(page)).toHaveCount(0);
        await expectPendingCount(page, PENDING_IN_SEED);
      });
    });

    test.describe("D7B: the plain question", () => {
      test("it opens on Cancel, says how many prices go live, Tab stays inside, Esc closes with nothing sent and focus back on the button", async ({
        page,
      }) => {
        await openPublish(page);
        await confirmableDraft(page, words);
        await versionNameField(page, words).fill(VERSION_NAME);
        const count = PENDING_IN_SEED - 1;
        const publish = publishButton(page, words, count);

        await publish.click();

        const dialog = dialogOf(page);
        await expect(
          dialog.getByRole("heading", {
            name: new RegExp(`^Publici .*${VERSION_NAME}.*\\?$`),
          }),
        ).toBeVisible();
        await expect(dialog).toContainText(
          romanian("priceDashboard.publish.confirmBody", { count }),
        );
        await expect(
          dialog.getByRole("button", {
            name: romanian("priceDashboard.common.cancel"),
          }),
          "D7B: focus starts on the safe action",
        ).toBeFocused();
        await shootForReview(page, "1440-d7b-confirm");
        await expectFocusStaysInside(page, dialog);

        await page.keyboard.press("Escape");

        await expect(dialog).toHaveCount(0);
        await expect(publish).toBeFocused();
        await expect(diffRows(page), "Esc sent nothing").toHaveCount(count);
        await expectPendingCount(page, count);
        await expect(noticeOf(page)).toHaveCount(0);

        await publish.click();
        await dialog
          .getByRole("button", {
            name: romanian("priceDashboard.common.cancel"),
          })
          .click();

        await expect(dialog, "Cancel closes it as Esc does").toHaveCount(0);
        await expectPendingCount(page, count);
      });
    });

    test.describe("D7D: nothing left to publish", () => {
      test("taking back every row by the keyboard walks focus from arrow to arrow, then lands on the empty page's heading; the frame has no count", async ({
        page,
        context,
      }) => {
        const held = await readVersions(context);
        await openPublish(page);
        await revertButtons(page).first().focus();

        for (
          let left = await revertButtons(page).count();
          left > 0;
          left -= 1
        ) {
          await expect(
            revertButtons(page).first(),
            `${String(left)} arrows left`,
          ).toBeFocused();
          await page.keyboard.press("Enter");
          await expect(
            revertButtons(page),
            "the write is answered before the next row is taken back",
          ).toHaveCount(left - 1);
        }

        const empty = page.getByTestId("publish-empty");
        await expect(empty).toBeVisible();
        await expect(
          empty.getByText(romanian("priceDashboard.publish.emptyTitle")),
        ).toBeFocused();
        await expect(page.getByTestId("staff-pending-prices")).toHaveCount(0);
        await expect(
          page.getByTestId("version-row"),
          "D7D: the latest three versions, or all there are",
        ).toHaveCount(Math.min(3, held.length));
        await expect(provisionalSwitch(page)).toBeVisible();
        await shootForReview(page, "1440-d7d-empty");
      });
    });

    test.describe("D8A: the history", () => {
      test("the versions are listed newest first with the preparing row on top, and no pager is drawn for one page", async ({
        page,
        context,
      }) => {
        const held = await readVersions(context);
        await openPublish(page, HISTORY_PATH);

        const versions = page.getByTestId("version-row");
        await expect(versions).toHaveCount(held.length);
        await expect(versions.first()).toHaveAttribute("data-state", "active");
        await expect(versions.first()).toContainText(
          String(held[0]?.sequenceNumber),
        );
        await expect(page.getByTestId("version-row-pending")).toContainText(
          romanian("priceDashboard.history.statePreparing"),
        );
        await expect(
          page.getByTestId("version-pager"),
          "fewer versions than a page holds: no pager",
        ).toHaveCount(0);
        await expectNoSidewaysScroll(page, "the history at 1440");
        await shootForReview(page, "1440-d8a-history");
      });

      test("a version's row opens that version's page", async ({
        page,
        context,
      }) => {
        const [newest] = await readVersions(context);
        await openPublish(page, HISTORY_PATH);

        await page.getByTestId("version-row").first().click();

        await expect(page).toHaveURL(
          new RegExp(`${versionPathOf(newest?.versionId ?? "")}$`),
        );
        await expect(page.getByTestId("version-detail")).toBeVisible();
      });
    });

    test.describe("D8B: one version", () => {
      test("the first version, which is the active one, has no diff and no restore, and nothing in it can be edited", async ({
        page,
        context,
      }) => {
        const [only] = await readVersions(context);
        expect(only?.sequenceNumber, "the server holds version 1 first").toBe(
          1,
        );
        await openVersion(page, only?.versionId ?? "");

        await expect(diffRows(page)).toHaveCount(0);
        await expect(
          page.getByText(romanian("priceDashboard.history.firstVersion")),
        ).toBeVisible();
        await expect(
          restoreButton(page, only?.sequenceNumber ?? 1),
          "D8C is for an archived version only",
        ).toHaveCount(0);
        await expect(revertButtons(page)).toHaveCount(0);
        await expect(
          page.getByTestId("version-detail").locator("input"),
        ).toHaveCount(0);
        await expectNoSidewaysScroll(page, "version 1 at 1440");
        await shootForReview(page, "1440-d8b-first");
      });

      test("a version nobody holds is the framework's 404, and nothing else is reported by the page", async ({
        page,
        pageErrors,
      }) => {
        const response = await page.goto(`${PUBLISH_PATH}/${"A".repeat(21)}`);

        expect(response?.status()).toBe(404);
        await expect(page.getByTestId("version-detail")).toHaveCount(0);
        await expect(page.locator("body")).toContainText("404");
        const unexpected = pageErrors.filter(
          (error) => !isBrowsersNoteOfA404(error),
        );
        pageErrors.length = 0;
        expect(
          unexpected,
          "the browser notes the 404 itself and nothing else",
        ).toEqual([]);
      });
    });

    test.describe("Russian", () => {
      test("the pending list keeps its cabinets' Romanian names, a price is still a button, and the provisional question speaks Russian", async ({
        page,
      }) => {
        const russian = wordsOf("ru");
        await openPublish(page, RUSSIAN_PUBLISH_PATH);

        await expect(
          page.getByRole("heading", {
            level: 1,
            name: russian("priceDashboard.publish.title"),
          }),
        ).toBeVisible();
        await expect(newValueButtons(page, russian)).toHaveCount(
          EDITABLE_PRICES_IN_SEED,
        );
        // Frame D2R: cabinet names stay Romanian on the Russian route until the official translation.
        await expect(
          diffRows(page).first(),
          "the Russian page keeps a cabinet's Romanian name",
        ).toContainText(wordsOf("ro")("catalog.entries.base-cabinet"));
        await versionNameField(page, russian).fill("Ноябрьские цены");
        await publishButton(page, russian, PENDING_IN_SEED).click();
        await expect(
          dialogOf(page).getByRole("heading", {
            name: russian("priceDashboard.publish.provisionalOffTitle"),
          }),
        ).toBeVisible();
        await shootForReview(page, "1440-d7c-provisional-off-ru");
      });
    });
  });
});

/** What a row of the table must hold at this width, closed and with its field open and refused. Soft, so that every width reports. */
async function checkOneRowAtWidth(
  page: Page,
  words: Words,
  at: { row: Locator; where: string; shot: string | undefined },
): Promise<void> {
  const { row, where, shot } = at;
  if (shot !== undefined) await shootForReview(page, `${shot}-closed`);
  expect
    .soft(await wordsBrokenIn(row), `${where}: words broken in the middle`)
    .toEqual([]);
  const closed = await heightOf(row);
  const isPressable = await row
    .getByRole("button", { name: startsWithNewValue(words) })
    .click({ timeout: SHORT_WAIT_MS })
    .then(
      () => true,
      () => false,
    );
  expect
    .soft(isPressable, `${where}: the price button can be pressed`)
    .toBe(true);
  if (!isPressable) return;
  const field = newValueField(page, words);
  const isDrawn = await field.isVisible();
  expect.soft(isDrawn, `${where}: the open field is drawn`).toBe(true);
  if (!isDrawn) {
    await page.keyboard.press("Escape");
    return;
  }
  await field.fill(NOT_A_MULTIPLE_OF_TEN);
  await expect(
    pageOf(page).getByRole("alert").filter({ hasText: /\S/ }),
  ).toBeVisible();
  const open = await measureOpenField(row);
  expect
    .soft(open.rowHeight, `${where}: the row grows`)
    .toBeGreaterThan(closed);
  expect
    .soft(open.outsideItsCell, `${where}: nothing leaves its cell`)
    .toEqual([]);
  expect.soft(open.overlapsNextCell, `${where}: no overlap`).toBe(false);
  expect.soft(open.pageOverflow, `${where}: the page's width`).toBe(0);
  if (shot !== undefined) await shootForReview(page, `${shot}-open`);
  await field.press("Escape");
  expect
    .soft(await heightOf(row), `${where}: the row returns to its height`)
    .toBeCloseTo(closed, 0);
}

/** The row's active price in plain lei, read from the cell the "Activ acum" figure stands in. */
async function activeLeiOfRow(
  priceButton: ReturnType<Page["locator"]>,
): Promise<string> {
  const text = await priceButton
    .locator("xpath=ancestor::li[@data-testid='diff-row'][1]")
    .locator("[data-empty]")
    .first()
    .innerText();
  const digits = text.replace(/\s*lei.*/s, "").replace(/\D/g, "");
  expect(digits, `an amount in "${text}"`).not.toBe("");
  return digits;
}

/** Takes the provisional row back with the switch, so the plain question D7B is the one that is asked. */
async function confirmableDraft(page: Page, words: Words): Promise<void> {
  await provisionalSwitch(page).click();
  await expect(
    provisionalSwitch(page),
    "the switch follows the draft",
  ).toHaveAttribute("aria-checked", "true");
  await expect(publishButton(page, words, PENDING_IN_SEED - 1)).toBeVisible();
}

async function askAndConfirmPublish(page: Page, words: Words): Promise<void> {
  await publishButton(page, words, PENDING_IN_SEED - 1).click();
  await dialogOf(page)
    .getByRole("button", {
      name: romanian("priceDashboard.publish.confirmAction"),
      exact: true,
    })
    .click();
}

/** Tab and Shift+Tab, as often as the dialog has controls and twice more, never leave the dialog. */
async function expectFocusStaysInside(
  page: Page,
  dialog: ReturnType<Page["locator"]>,
): Promise<void> {
  for (const key of ["Tab", "Tab", "Tab", "Tab", "Shift+Tab", "Shift+Tab"]) {
    await page.keyboard.press(key);
    expect(
      await dialog.evaluate((node) => node.contains(document.activeElement)),
      `after ${key}`,
    ).toBe(true);
  }
}
