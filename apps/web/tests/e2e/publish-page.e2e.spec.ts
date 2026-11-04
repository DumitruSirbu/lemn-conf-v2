// Waves U5b and U5c of M10 on a phone, 390 x 844 with real touch: the publish page "Publicare prețuri", its history tab
// and one version's page, against frame D7M and the phone's share of D7B to D8C (docs/design/mockups/Lemnaria
// Dashboard.dc.html).
//
// WHICH SERVER THIS FILE HOLDS ON. Both a development server and the production build CI serves: the pages read the
// server's own draft and history, and each test that needs a pending draft seeds it through the routes. No test
// publishes or restores, because that moves the active version for every other spec; see the desktop file for what is
// covered elsewhere.
import {
  countStaffFixturesForTests,
  removeStaffFixturesForTests,
} from "@lemnaria/persistence";
import { expect, type Locator, type Page } from "@playwright/test";

import { expectPendingCount } from "./support/cabinet-detail-page";
import {
  discardDraft,
  expectNoSidewaysScroll,
  expectTargetsLargeEnough,
  priceRateLimitKeysOf,
  test,
} from "./support/price-dashboard-session";
import { holdPriceDraft, releasePriceDraft } from "./support/price-draft-lock";
import {
  describeFocus,
  dialogOf,
  diffRows,
  HISTORY_PATH,
  newValueButtons,
  nouCellOf,
  noticeOf,
  openPublish,
  openVersion,
  pageOf,
  provisionalSwitch,
  publishButton,
  PUBLISH_PATH,
  RUSSIAN_PUBLISH_PATH,
  revertButtons,
  PENDING_IN_SEED,
  readVersions,
  seedPendingDraft,
  stickingOut,
  versionNameField,
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
const VERSION_NAME = "Autumn prices";
const PUBLISH_PAGE = '[data-testid="publish-page"]';

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

test.describe("the publish page on a phone, 390 x 844", () => {
  test.beforeEach(({ page }) => {
    expect(page.viewportSize(), "the viewport this project asked for").toEqual(
      PHONE,
    );
  });

  test.describe("over the dashboard's routes", () => {
    const words = wordsOf("ro");

    test.beforeEach(async ({ context }) => {
      await seedPendingDraft(context);
    });

    test.describe("D7M: the pending list", () => {
      test("a price is plain text: no field, no button and no pencil on any figure, and a tap on it opens nothing; RO and RU", async ({
        page,
      }) => {
        for (const locale of LOCALES) {
          const localised = wordsOf(locale);
          await openPublish(
            page,
            locale === "ro" ? PUBLISH_PATH : RUSSIAN_PUBLISH_PATH,
          );

          await expect(diffRows(page), locale).toHaveCount(PENDING_IN_SEED);
          await expect(
            newValueButtons(page, localised),
            `${locale}: no button opens a field`,
          ).toHaveCount(0);
          await expect(
            page.getByTestId("diff-table").locator("input"),
            `${locale}: no field in the table`,
          ).toHaveCount(0);
          const figure = nouCellOf(diffRows(page).first())
            .getByText(/4\s020/)
            .locator("visible=true");
          await expect(figure, `${locale}: the figure is drawn`).toBeVisible();
          await figure.tap();
          await expect(
            page.getByTestId("diff-table").locator("input"),
            `${locale}: a tap on the figure opens nothing`,
          ).toHaveCount(0);
          await expect(
            page.getByTestId("diff-table").locator("[class*='pencil']:visible"),
            `${locale}: no pencil is drawn`,
          ).toHaveCount(0);
          await shootForReview(page, `390-d7m-pending-${locale}`);
        }
      });

      test("nothing is wider than the screen, in RO and RU, with the list as it is and with the bulk group hidden", async ({
        page,
      }) => {
        for (const locale of LOCALES) {
          await openPublish(
            page,
            locale === "ro" ? PUBLISH_PATH : RUSSIAN_PUBLISH_PATH,
          );

          await expectNoSidewaysScroll(page, `${locale} pending`);
          expect(await stickingOut(page), `${locale} pending`).toEqual([]);
          await pageOf(page)
            .getByRole("button", {
              name: wordsOf(locale)("priceDashboard.publish.bulkRowHide"),
            })
            .tap();
          await expectNoSidewaysScroll(page, `${locale} group hidden`);
        }
      });

      test("every control on the page is at least 44 px either way, in RO and RU", async ({
        page,
      }) => {
        for (const locale of LOCALES) {
          await openPublish(
            page,
            locale === "ro" ? PUBLISH_PATH : RUSSIAN_PUBLISH_PATH,
          );

          await expectTargetsLargeEnough(
            page,
            PUBLISH_PAGE,
            `${locale} pending`,
          );
        }
      });

      test("the publish button is on the screen from the top of the page, pinned at its foot as D7M draws it, and at the end of the list no row is behind it", async ({
        page,
      }) => {
        await openPublish(page);
        const button = publishButton(page, words, PENDING_IN_SEED);

        const atTop = await button.boundingBox();

        expect
          .soft(
            (atTop?.y ?? Number.POSITIVE_INFINITY) + (atTop?.height ?? 0),
            "D7M: the button stands at the foot of the first screen",
          )
          .toBeLessThanOrEqual(PHONE.height);
        await diffRows(page)
          .last()
          .evaluate((row) => {
            row.scrollIntoView({ block: "end" });
          });
        const lastRow = await diffRows(page).last().boundingBox();
        const barTop = await barTopOf(page, words);
        expect(
          (lastRow?.y ?? 0) + (lastRow?.height ?? 0),
          "the last row ends above the bar that holds the button",
        ).toBeLessThanOrEqual(barTop);
        await shootForReview(page, "390-d7m-end-of-list");
      });

      test("↺ by touch takes a row back, the frame's count follows, and focus goes on to the arrow that stood after it", async ({
        page,
      }) => {
        await openPublish(page);
        const arrows = revertButtons(page);
        const successor = await arrows.nth(1).getAttribute("aria-label");

        await arrows.first().tap();

        await expect(diffRows(page)).toHaveCount(PENDING_IN_SEED - 1);
        await expectPendingCount(page, PENDING_IN_SEED - 1);
        expect(
          await page.evaluate(
            () => document.activeElement?.getAttribute("aria-label") ?? null,
          ),
          `focus is on ${await describeFocus(page)}`,
        ).toBe(successor);
      });
    });

    test.describe("publishing from a phone", () => {
      test("an empty name is refused with no question; with a name the provisional question fits the screen, its buttons are 44 px, and Cancel leaves everything as it was", async ({
        page,
      }) => {
        await openPublish(page);
        await publishButton(page, words, PENDING_IN_SEED).tap();
        await expect(
          pageOf(page)
            .getByRole("alert")
            .filter({
              hasText: romanian("priceDashboard.publish.versionNameEmpty"),
            }),
        ).toBeVisible();
        await expect(dialogOf(page)).toHaveCount(0);

        await versionNameField(page, words).fill(VERSION_NAME);
        await publishButton(page, words, PENDING_IN_SEED).tap();

        const dialog = dialogOf(page);
        await expect(dialog).toBeVisible();
        await expectDialogFitsScreen(dialog);
        await expectNoSidewaysScroll(page, "the D7C question");
        await expectTargetsLargeEnough(
          page,
          '[role="alertdialog"]',
          "the D7C question",
        );
        await shootForReview(page, "390-d7c-provisional-off");
        await dialog.getByRole("checkbox").tap();
        await expect(
          dialog.getByRole("button", {
            name: romanian("priceDashboard.publish.provisionalOffConfirm"),
          }),
        ).not.toHaveAttribute("aria-disabled", "true");
        await dialog
          .getByRole("button", {
            name: romanian("priceDashboard.common.cancel"),
          })
          .tap();

        await expect(dialog).toHaveCount(0);
        await expect(noticeOf(page)).toHaveCount(0);
        await expectPendingCount(page, PENDING_IN_SEED);
      });

      test("the plain question D7B opens on Cancel, and a tap on it closes it with nothing sent", async ({
        page,
      }) => {
        await openPublish(page);
        await provisionalSwitch(page).tap();
        await versionNameField(page, words).fill(VERSION_NAME);
        const count = PENDING_IN_SEED - 1;

        await publishButton(page, words, count).tap();

        const dialog = dialogOf(page);
        const cancel = dialog.getByRole("button", {
          name: romanian("priceDashboard.common.cancel"),
        });
        await expect(cancel).toBeFocused();
        await expectDialogFitsScreen(dialog);
        await shootForReview(page, "390-d7b-confirm");
        await cancel.tap();

        await expect(dialog).toHaveCount(0);
        await expect(diffRows(page)).toHaveCount(count);
        await expectPendingCount(page, count);
        await expect(noticeOf(page)).toHaveCount(0);
      });

      test("taking back every row leaves the empty page: its words, the latest three versions, and a frame with no count", async ({
        page,
        context,
      }) => {
        const held = await readVersions(context);
        await openPublish(page);

        for (let left = PENDING_IN_SEED; left > 0; left -= 1) {
          const arrows = await revertButtons(page).count();
          if (arrows === 0) break;
          await revertButtons(page).first().tap();
          await expect(
            revertButtons(page),
            "the write is answered before the next row is taken back",
          ).toHaveCount(arrows - 1);
        }

        await expect(page.getByTestId("publish-empty")).toBeVisible();
        await expect(page.getByTestId("version-row")).toHaveCount(
          Math.min(3, held.length),
        );
        await expect(page.getByTestId("staff-pending-prices")).toHaveCount(0);
        await expectNoSidewaysScroll(page, "the empty page");
        await shootForReview(page, "390-d7d-empty");
      });
    });

    test.describe("the history and one version", () => {
      test("the history lists the versions with no pager for one page, nothing is wider than the screen, targets are 44 px; RO and RU", async ({
        page,
        context,
      }) => {
        const held = await readVersions(context);
        for (const locale of LOCALES) {
          await openPublish(
            page,
            locale === "ro"
              ? HISTORY_PATH
              : HISTORY_PATH.replace("/ro/", "/ru/"),
          );

          await expect(page.getByTestId("version-row")).toHaveCount(
            held.length,
          );
          await expect(page.getByTestId("version-pager")).toHaveCount(0);
          await expectNoSidewaysScroll(page, `${locale} history`);
          await expectTargetsLargeEnough(
            page,
            PUBLISH_PAGE,
            `${locale} history`,
          );
          await shootForReview(page, `390-d8a-history-${locale}`);
        }
      });

      test("the first version, which is the active one, has no field, no arrow and no restore; RO and RU fit", async ({
        page,
        context,
      }) => {
        const [only] = await readVersions(context);
        for (const locale of LOCALES) {
          await openVersion(page, only?.versionId ?? "", locale);

          await expect(
            page.getByText(
              wordsOf(locale)("priceDashboard.history.firstVersion"),
            ),
          ).toBeVisible();
          await expect(
            page.getByTestId("version-detail").locator("input"),
          ).toHaveCount(0);
          await expect(revertButtons(page)).toHaveCount(0);
          await expect(
            page.getByRole("button", {
              name: wordsOf(locale)("priceDashboard.history.restoreAction", {
                versionId: String(only?.sequenceNumber),
              }),
            }),
          ).toHaveCount(0);
          await expectNoSidewaysScroll(page, `${locale} version 1`);
          await expectTargetsLargeEnough(
            page,
            '[data-testid="version-detail"]',
            `${locale} version 1`,
          );
          await shootForReview(page, `390-d8b-first-${locale}`);
        }
      });
    });
  });
});

/** The dialog lies wholly inside the screen: a phone's sheet is not taller than the screen nor wider. */
async function expectDialogFitsScreen(dialog: Locator): Promise<void> {
  const box = await dialog.boundingBox();
  expect(box, "the dialog is drawn").not.toBeNull();
  expect(box?.x ?? -1, "left").toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0), "right").toBeLessThanOrEqual(
    PHONE.width,
  );
  expect(box?.y ?? -1, "top").toBeGreaterThanOrEqual(0);
  expect((box?.y ?? 0) + (box?.height ?? 0), "bottom").toBeLessThanOrEqual(
    PHONE.height,
  );
}

/** The top edge of the box that holds the publish button: the bar that is pinned to the foot of the screen. */
async function barTopOf(page: Page, words: Words): Promise<number> {
  const bar = publishButton(page, words, PENDING_IN_SEED).locator("xpath=..");
  const box = await bar.boundingBox();
  return box?.y ?? Number.POSITIVE_INFINITY;
}
