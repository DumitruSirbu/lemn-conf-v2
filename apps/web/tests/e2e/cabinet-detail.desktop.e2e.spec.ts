// Wave U3 of M10 at 1440 x 900 with a pointer: the cabinet's page reached from the price list by its name link and by the
// chevron at the row's end, then the page's two columns, the table of prices as a table, and the same edit, refusal and
// switch journeys as on the phone (cabinet-detail.e2e.spec.ts) where the desktop line differs: the price is a button in
// the list, Save is not pinned to the foot of the screen, the table is a table.
//
// The draft is ONE draft in the e2e server's memory, so every test starts and ends by emptying it, and the dashboard's
// spec files must not run in two workers at once (see cabinet-detail.e2e.spec.ts).
import {
  countStaffFixturesForTests,
  removeStaffFixturesForTests,
} from "@lemnaria/persistence";
import { expect, type Locator, type Page } from "@playwright/test";

import {
  allPriceFields,
  anchorLabel,
  BASE_CABINET,
  baseCostSentence,
  cabinetName,
  cabinetPath,
  CABINETS_PATH,
  cancelButton,
  collectWrites,
  CORNER_900,
  depthSwitch,
  detailOf,
  doorLabel,
  expectHydrated,
  expectPendingCount,
  FREE_FRIDGE,
  hardwareSwitch,
  HEIGHT_LABEL,
  HOOD,
  isBrowsersNoteOfA404,
  isDraftWrite,
  leiOfCell,
  MINUS_LABEL,
  openCabinet,
  openList,
  PLUS_LABEL,
  previewRow,
  previewTable,
  priceFieldOf,
  refusalOf,
  russian,
  RUSSIAN_CABINETS_PATH,
  saveButton,
  savedNotice,
  sentenceOf,
  serverState,
  shootViewport,
  SETTLE_MS,
  TWO_SIZES_CARGO,
  WALL_CABINET,
} from "./support/cabinet-detail-page";
import {
  discardDraft,
  expectNoSidewaysScroll,
  OK,
  priceRateLimitKeysOf,
  test,
} from "./support/price-dashboard-session";
import { holdPriceDraft, releasePriceDraft } from "./support/price-draft-lock";
import { shootForReview } from "./support/staff-pages";
import {
  NOTHING_LEFT,
  plantSignedInAdministrator,
  romanian,
  signIn,
  type SignedInAdministrator,
} from "./support/staff-world";

const DESKTOP = { width: 1440, height: 900 } as const;
const TYPED_ANCHOR = "3970";
const TEN_LEI = 10;
const WIDTHS_OF_THE_DESKTOP_LINE = [
  900, 960, 1024, 1180, 1280, 1366, 1440, 1680, 1920,
];

/** A spec file waits here for the files that hold the one price draft before it, and each takes under two minutes. */
const FILES_TAKE_TURNS_MS = 600_000;

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

test.describe("the cabinet's page at desktop 1440", () => {
  test.beforeEach(({ page }) => {
    expect(page.viewportSize(), "the viewport this project asked for").toEqual(
      DESKTOP,
    );
  });

  test.describe("reaching the page from the list", () => {
    test("the name link opens the cabinet's page", async ({ page }) => {
      await openList(page);

      await listRowOf(page, BASE_CABINET).getByTestId("cabinet-link").click();

      await expect(page).toHaveURL(new RegExp(`${cabinetPath(BASE_CABINET)}$`));
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: cabinetName("base-cabinet"),
        }),
      ).toBeVisible();
      await expectHydrated(page, "cabinet-detail");
      await shootForReview(page, "1440-d3a-base-from-name-link");
    });

    test("the chevron at the row's end opens the cabinet's page", async ({
      page,
    }) => {
      await openList(page);
      const chevron = listRowOf(page, BASE_CABINET).locator(
        '[class*="chevron"]',
      );
      const box = await chevron.boundingBox();
      expect(box, "the chevron is drawn").not.toBeNull();

      await page.mouse.click(
        (box?.x ?? 0) + (box?.width ?? 0) / 2,
        (box?.y ?? 0) + (box?.height ?? 0) / 2,
      );

      await expect(page).toHaveURL(new RegExp(`${cabinetPath(BASE_CABINET)}$`));
    });

    test("the keyboard reaches the name link, and Enter opens the page; the price button is a stop of its own", async ({
      page,
    }) => {
      await openList(page);
      const link = listRowOf(page, BASE_CABINET).getByTestId("cabinet-link");

      await link.focus();
      await page.keyboard.press("Tab");

      await expect(
        listRowOf(page, BASE_CABINET).getByRole("button", {
          name: EDIT_PRICE_NAME,
        }),
        "from the name, the next stop is the row's price",
      ).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(link).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(new RegExp(`${cabinetPath(BASE_CABINET)}$`));
    });

    test("the page's back link returns to the list", async ({ page }) => {
      await openCabinet(page, BASE_CABINET);

      await page
        .getByRole("link", {
          name: romanian("priceDashboard.cabinets.title"),
          exact: true,
        })
        .first()
        .click();

      await expect(page).toHaveURL(new RegExp(`${CABINETS_PATH}$`));
      await expect(page.getByTestId("cabinet-list")).toBeVisible();
    });
  });

  test.describe("the layout", () => {
    test("the dimensions stand in a column of their own beside the price, and the table is a table", async ({
      page,
    }) => {
      await openCabinet(page, WALL_CABINET);

      const about = await detailOf(page)
        .getByRole("region", {
          name: romanian("priceDashboard.cabinet.dimensionsHeading"),
        })
        .boundingBox();
      const price = await priceFieldOf(page, anchorLabel(600)).boundingBox();
      expect(about, "the dimensions are drawn").not.toBeNull();
      expect(price, "the price field is drawn").not.toBeNull();
      expect(
        (about?.x ?? 0) + (about?.width ?? 0),
        "the dimensions end before the price begins",
      ).toBeLessThanOrEqual(price?.x ?? 0);
      await expect(previewTable(page)).toHaveCSS("display", "table");
      await expect(
        previewTable(page).getByRole("columnheader", {
          name: romanian("priceDashboard.cabinet.columnNew"),
        }),
        "a Nou column under each price column",
      ).toHaveCount(2);
      await expectNoSidewaysScroll(page, "the wall cabinet at 1440");
      await shootForReview(page, "1440-d3d-wall");
    });

    test("Save stays in the flow of the page at 1440: it is not a bar pinned over the table", async ({
      page,
    }) => {
      await openCabinet(page, BASE_CABINET);

      await expect(
        saveButton(page).locator(".."),
        "the bar around Save",
      ).not.toHaveCSS("position", "sticky");
    });
  });

  test.describe("every width of the desktop line, in both languages", () => {
    test("the page never scrolls sideways at any width of the desktop line, from 900 to 1920", async ({
      page,
    }) => {
      const overflowing: string[] = [];
      for (const locale of ["ro", "ru"]) {
        for (const ruleId of [BASE_CABINET, WALL_CABINET, TWO_SIZES_CARGO]) {
          await page.setViewportSize({ width: 1440, height: DESKTOP.height });
          await page.goto(`/${locale}/staff/catalog/cabinets/${ruleId}`);
          await expectHydrated(page, "cabinet-detail");
          for (const width of WIDTHS_OF_THE_DESKTOP_LINE) {
            await page.setViewportSize({ width, height: DESKTOP.height });
            const overflow = await sidewaysOverflowOf(page);
            if (locale === "ro" && ruleId === BASE_CABINET && width === 1024) {
              await shootViewport(page, "1024-d3a-base-sideways");
            }
            if (overflow.page !== 0) {
              overflowing.push(
                `${locale} ${ruleId} at ${String(width)}: page ${String(overflow.page)} px, table ${String(overflow.table)} px past its column`,
              );
            }
          }
        }
      }
      expect(overflowing, "layouts that overflow").toEqual([]);
    });
  });

  test.describe("what the page says about each shape", () => {
    for (const { ruleId, frame } of [
      { ruleId: BASE_CABINET, frame: "d3a-base" },
      { ruleId: CORNER_900, frame: "d3g-corner" },
      { ruleId: TWO_SIZES_CARGO, frame: "d3f-fixed-sizes" },
    ]) {
      test(`${ruleId}: its fields, its sentence and the table it is drawn from`, async ({
        page,
      }) => {
        await openCabinet(page, ruleId);

        const expected = {
          [BASE_CABINET]: {
            fields: 4,
            sentence: baseCostSentence(600, "3 960 lei"),
          },
          [CORNER_900]: {
            fields: 1,
            sentence: baseCostSentence(900, "4 000 lei"),
          },
          [TWO_SIZES_CARGO]: {
            fields: 2,
            sentence: "200 mm: 1 800 lei, 300 mm: 2 250 lei.",
          },
        }[ruleId];
        await expect(allPriceFields(page)).toHaveCount(expected?.fields ?? 0);
        await expect(sentenceOf(page)).toContainText(expected?.sentence ?? "");
        await expect(saveButton(page)).toBeDisabled();
        await shootForReview(page, `1440-${frame}`);
      });
    }

    for (const { ruleId, frame } of [
      { ruleId: HOOD, frame: "d3e-hood" },
      { ruleId: FREE_FRIDGE, frame: "fridge-free" },
    ]) {
      test(`${ruleId}: supplied by the customer, no price field, and the switch is disabled and says the price does not change`, async ({
        page,
      }) => {
        await openCabinet(page, ruleId);

        await expect(allPriceFields(page)).toHaveCount(0);
        await expect(saveButton(page)).toHaveCount(0);
        await expect(depthSwitch(page)).toBeDisabled();
        await expect(depthSwitch(page)).toContainText(
          romanian("priceDashboard.cabinet.depthToggleDisabled", {
            deepMm: 700,
          }),
        );
        await expect(detailOf(page)).toContainText("0 lei");
        await shootForReview(page, `1440-${frame}`);
      });
    }

    test("a rule the book does not hold answers 404", async ({
      page,
      pageErrors,
    }) => {
      const response = await page.goto(
        `${CABINETS_PATH}/cabinet.does-not-exist`,
      );

      expect(response?.status()).toBe(404);
      await expect(page.getByTestId("cabinet-detail")).toHaveCount(0);
      await shootForReview(page, "1440-unknown-id");
      const unexpected = pageErrors.filter(
        (error) => !isBrowsersNoteOfA404(error),
      );
      pageErrors.length = 0;
      expect(unexpected).toEqual([]);
    });
  });

  test.describe("typing, saving, cancelling", () => {
    test("typing moves the sentence and the Nou column at once and sends nothing; Save writes one change; a reload holds it with Activ unchanged", async ({
      page,
    }) => {
      await openCabinet(page, BASE_CABINET);
      const writes = collectWrites(page);
      const stateBefore = await serverState(page);
      const row = previewRow(page, 600);
      const activeBefore = await leiOfCell(row, "active");

      await priceFieldOf(page, anchorLabel(600)).fill(TYPED_ANCHOR);

      await expect(sentenceOf(page)).toContainText(
        baseCostSentence(600, "3 970 lei"),
      );
      expect(await leiOfCell(row, "next")).toBe(activeBefore + TEN_LEI);
      expect(await leiOfCell(row, "active")).toBe(activeBefore);
      await shootForReview(page, "1440-d3a-typed");
      await page.waitForTimeout(SETTLE_MS);
      expect(writes, "typing sends nothing").toEqual([]);
      const saved = page.waitForResponse(isDraftWrite);
      await saveButton(page).click();
      expect((await saved).status()).toBe(OK);

      await expect(savedNotice(page)).toBeVisible();
      await expect(savedNotice(page)).toBeFocused();
      expect(writes).toHaveLength(1);
      await expectPendingCount(page, 1);
      await shootForReview(page, "1440-d3b-saved");
      await page.reload();
      await expect(priceFieldOf(page, anchorLabel(600))).toHaveValue(
        TYPED_ANCHOR,
      );
      expect(await leiOfCell(row, "active")).toBe(activeBefore);
      expect(await leiOfCell(row, "next")).toBe(activeBefore + TEN_LEI);
      const stateAfter = await serverState(page);
      expect(stateAfter.active, "the active version is untouched").toEqual(
        stateBefore.active,
      );
      expect(stateAfter.draft.changes).toHaveLength(1);
    });

    test("after Save the list says the row is pending with its active price beside it, by the name link's way back", async ({
      page,
    }) => {
      await openCabinet(page, BASE_CABINET);
      await priceFieldOf(page, anchorLabel(600)).fill(TYPED_ANCHOR);
      await saveButton(page).click();
      await expect(savedNotice(page)).toBeVisible();

      await page
        .getByRole("link", {
          name: romanian("priceDashboard.cabinets.title"),
          exact: true,
        })
        .first()
        .click();

      const row = listRowOf(page, BASE_CABINET);
      await expect(row).toHaveAttribute("data-modified", "true");
      await expect(row.getByTestId("cabinet-price")).toContainText(
        "activ 3 960",
      );
      await expectPendingCount(page, 1);
    });

    test("what the list shows after the browser's Back button from a page whose price was saved", async ({
      page,
    }, testInfo) => {
      await page.addInitScript(() => {
        const marks = window as unknown as Record<string, unknown>;
        marks.__documentToken = Math.random();
        marks.__pageshowPersisted = [] as boolean[];
        window.addEventListener("pageshow", (event) => {
          (marks.__pageshowPersisted as boolean[]).push(event.persisted);
        });
      });
      await openList(page);
      const listToken = await page.evaluate(
        () => (window as unknown as Record<string, unknown>).__documentToken,
      );
      await listRowOf(page, BASE_CABINET).getByTestId("cabinet-link").click();
      await expect(page).toHaveURL(new RegExp(`${cabinetPath(BASE_CABINET)}$`));
      await priceFieldOf(page, anchorLabel(600)).fill(TYPED_ANCHOR);
      await saveButton(page).click();
      await expect(savedNotice(page)).toBeVisible();

      await page.goBack();

      await expect(page).toHaveURL(new RegExp(`${CABINETS_PATH}$`));
      await expect(page.getByTestId("cabinet-list")).toBeVisible();
      const afterBack = await page.evaluate(() => {
        const marks = window as unknown as Record<string, unknown>;
        return {
          token: marks.__documentToken,
          persisted: marks.__pageshowPersisted,
        };
      });
      testInfo.annotations.push({
        type: "what the browser's Back button did",
        description: `same document as before: ${String(afterBack.token === listToken)}; pageshow persisted: ${JSON.stringify(afterBack.persisted)}`,
      });
      await expectHydrated(page, "cabinet-list");
      await shootForReview(page, "1440-d2b-list-after-back");
      await expect(
        listRowOf(page, BASE_CABINET),
        "the list the Back button shows holds the price that was saved a page later",
      ).toHaveAttribute("data-modified", "true");
    });

    test("Cancel puts the fields back and sends nothing", async ({ page }) => {
      await openCabinet(page, BASE_CABINET);
      const writes = collectWrites(page);
      await priceFieldOf(page, anchorLabel(600)).fill(TYPED_ANCHOR);

      await cancelButton(page).click();

      await expect(priceFieldOf(page, anchorLabel(600))).toHaveValue("3960");
      await expect(saveButton(page)).toBeDisabled();
      await page.waitForTimeout(SETTLE_MS);
      expect(writes).toEqual([]);
    });
  });

  test.describe("a value that cannot be saved", () => {
    test("15 is refused on its field, Save is off and nothing is sent", async ({
      page,
    }) => {
      await openCabinet(page, BASE_CABINET);
      const writes = collectWrites(page);
      const field = priceFieldOf(page, anchorLabel(600));

      await field.fill("15");

      await expect(field).toHaveAttribute("aria-invalid", "true");
      await expect(await refusalOf(field)).toHaveText(
        romanian("priceDashboard.errors.notMultipleOfTen", {
          step: "10",
          example: "450",
        }),
      );
      await expect(saveButton(page)).toBeDisabled();
      await shootForReview(page, "1440-d3c-error-15");
      await field.press("Enter");
      await page.waitForTimeout(SETTLE_MS);
      expect(writes).toEqual([]);
    });

    test("a minus step that makes the narrowest width cost nothing is refused on the minus field, where it turns", async ({
      page,
    }) => {
      await openCabinet(page, BASE_CABINET);
      const writes = collectWrites(page);
      const minus = priceFieldOf(page, MINUS_LABEL);

      await minus.fill("470");
      await expect(minus).not.toHaveAttribute("aria-invalid", "true");
      await minus.fill("480");

      await expect(minus).toHaveAttribute("aria-invalid", "true");
      await expect(await refusalOf(minus)).toHaveText(
        romanian("priceDashboard.errors.priceNotPositiveAtWidth", {
          widthMm: 200,
        }),
      );
      for (const other of [anchorLabel(600), PLUS_LABEL, doorLabel(500)]) {
        await expect(priceFieldOf(page, other)).not.toHaveAttribute(
          "aria-invalid",
          "true",
        );
      }
      await expect(saveButton(page)).toBeDisabled();
      await saveButton(page).click({ force: true });
      await page.waitForTimeout(SETTLE_MS);
      expect(writes).toEqual([]);
      await shootForReview(page, "1440-d3c-error-minus");
    });

    test("a height step that makes the top row's smallest piece cost nothing is refused on the height field", async ({
      page,
    }) => {
      await openCabinet(page, WALL_CABINET);
      const height = priceFieldOf(page, HEIGHT_LABEL);

      await height.fill("270");
      await expect(height).not.toHaveAttribute("aria-invalid", "true");
      await height.fill("280");

      await expect(height).toHaveAttribute("aria-invalid", "true");
      await expect(await refusalOf(height)).toHaveText(
        romanian("priceDashboard.errors.priceNotPositiveAtHeight", {
          heightMm: 400,
        }),
      );
    });
  });

  test.describe("the hardware and the deep-kitchen switches", () => {
    test("the hardware switch and its classes change the table; the deep switch raises it; a wall row deepens", async ({
      page,
    }) => {
      await openCabinet(page, BASE_CABINET);
      const row = previewRow(page, 600);
      const plain = await leiOfCell(row, "active");

      await hardwareSwitch(page).click();
      expect(await leiOfCell(row, "active")).toBe(plain + 70);
      await detailOf(page).getByRole("radio").nth(2).check();
      expect(await leiOfCell(row, "active")).toBeGreaterThan(plain + 70);
      await shootForReview(page, "1440-d3a-hardware");
      await hardwareSwitch(page).click();
      await depthSwitch(page).click();
      expect(await leiOfCell(row, "active")).toBeGreaterThan(plain);
      await shootForReview(page, "1440-d3a-deep");

      await openCabinet(page, WALL_CABINET);
      const wall = previewRow(page, 600);
      const wallShallow = await leiOfCell(wall, "active");
      await expect(depthSwitch(page)).toBeEnabled();
      await depthSwitch(page).click();
      expect(await leiOfCell(wall, "active")).toBeGreaterThan(wallShallow);
    });
  });

  test.describe("the Russian page", () => {
    test("a cabinet with a pending price in Russian fits and keeps its value", async ({
      page,
    }) => {
      await openCabinet(page, BASE_CABINET);
      await priceFieldOf(page, anchorLabel(600)).fill(TYPED_ANCHOR);
      await saveButton(page).click();
      await expect(savedNotice(page)).toBeVisible();

      await page.goto(`${RUSSIAN_CABINETS_PATH}/${BASE_CABINET}`);

      await expect(
        priceFieldOf(
          page,
          russian("priceDashboard.cabinet.fieldAnchor", { widthMm: 600 }),
        ),
      ).toHaveValue(TYPED_ANCHOR);
      await shootForReview(page, "1440-d3r-ru-saved");
      await expectNoSidewaysScroll(page, "the Russian page at 1440");
    });
  });
});

const EDIT_PRICE_NAME = romanian("priceDashboard.cabinets.editPriceAria", {
  name: "",
}).trim();

function listRowOf(page: Page, ruleId: string): Locator {
  return page.locator(`[data-rule-id="${ruleId}"]`);
}

/** How far the page and the price table go past the window and past the column the table is in, in px. */
function sidewaysOverflowOf(
  page: Page,
): Promise<{ page: number; table: number }> {
  return page.evaluate(() => {
    const table = document.querySelector("[data-testid=cabinet-preview]");
    const column = table?.closest("section")?.parentElement;
    const tableRight = table?.getBoundingClientRect().right ?? 0;
    const columnRight = column?.getBoundingClientRect().right ?? 0;
    return {
      page:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      table: Math.max(0, Math.round(tableRight - columnRight)),
    };
  });
}
