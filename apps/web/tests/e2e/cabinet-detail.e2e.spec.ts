// Wave U3 of M10 in a real browser: the cabinet's own page at /ro/staff/catalog/cabinets/<ruleId>, opened from the price
// list by a signed-in administrator on a phone (390 x 844, touch). Frames D3A to D3G, D3M1 and D3M2, D3R of the
// dashboard mockup: dimensions read-only, a price field for every amount the formula holds, the sentence and the "Nou"
// column that follow what is typed, Save to "De publicat", the hardware and the deep-kitchen switches.
//
// The 1440 cases are in cabinet-detail.desktop.e2e.spec.ts. The draft is ONE draft in the e2e server's memory (the fake
// price book), so every test starts and ends by emptying it, and two spec files that edit it must not run in two
// workers at once: CI runs one worker to a shard, a local run of the dashboard's specs wants `--workers=1`.
import {
  removeStaffFixturesForTests,
  countStaffFixturesForTests,
} from "@lemnaria/persistence";
import { chromium, expect, type Locator, type Page } from "@playwright/test";

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
  depthLabel,
  depthSwitch,
  dimensionLabel,
  detailOf,
  doorLabel,
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
  expectHydrated,
  PLUS_LABEL,
  stepsSentence,
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
  expectTargetsLargeEnough,
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

const PHONE = { width: 390, height: 844 } as const;
const TYPED_ANCHOR = "3970";
const TEN_LEI = 10;

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

test.describe("the cabinet's page at phone 390", () => {
  test.use({ viewport: PHONE, isMobile: true, hasTouch: true });

  test.beforeEach(({ page }) => {
    expect(page.viewportSize(), "the viewport this describe asked for").toEqual(
      PHONE,
    );
  });

  test.describe("reaching the page from the list", () => {
    test("Tab reaches the card's link with no price button on the way, and Enter opens the cabinet's page", async ({
      page,
    }) => {
      await openList(page);
      const stops = await tabStopsUntilCardLink(page);

      expect(
        stops.filter((stop) => stop.startsWith(`button:${EDIT_PRICE_NAME}`)),
        "no price button is a tab stop on a phone",
      ).toEqual([]);
      expect(stops.at(-1), "the first card's link").toBe(
        `a:${cabinetName("base-cabinet")}`,
      );
      await shootForReview(page, "390-list-link-focused");

      await page.keyboard.press("Enter");

      await expect(page).toHaveURL(new RegExp(`${cabinetPath(BASE_CABINET)}$`));
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: cabinetName("base-cabinet"),
        }),
      ).toBeVisible();
      await expectHydrated(page, "cabinet-detail");
      await shootForReview(page, "390-d3m1-base-from-list");
    });

    test("the next Tab after a card's link is the next card's link: the price between them is not a stop", async ({
      page,
    }) => {
      await openList(page);
      await tabStopsUntilCardLink(page);

      await page.keyboard.press("Tab");

      expect(await activeStop(page)).toBe(`a:${cabinetName("base-3drawer")}`);
    });

    test("a tap at the far corner of a card, away from its name, opens that cabinet", async ({
      page,
    }) => {
      await openList(page);
      const card = page
        .getByTestId("cabinet-group-base")
        .getByTestId("cabinet-row")
        .first();
      const box = await card.boundingBox();
      expect(box, "the card is on the page").not.toBeNull();

      await page.touchscreen.tap(
        (box?.x ?? 0) + (box?.width ?? 0) - 6,
        (box?.y ?? 0) + (box?.height ?? 0) - 6,
      );

      await expect(page).toHaveURL(new RegExp(`${cabinetPath(BASE_CABINET)}$`));
    });

    test("the page's back link returns to the list and the list is as it was", async ({
      page,
    }) => {
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

    test("opening the page writes nothing: no request but reads, and the draft is as it was", async ({
      page,
    }) => {
      const before = await serverState(page);
      const writes = collectWrites(page);

      await openCabinet(page, BASE_CABINET);
      await openCabinet(page, WALL_CABINET);
      await page.waitForTimeout(SETTLE_MS);

      expect(writes, "a page render is a read").toEqual([]);
      expect((await serverState(page)).draft).toEqual(before.draft);
    });
  });

  test.describe("what the page says about each shape", () => {
    test("a base cabinet: dimensions are plain text, the fields are the formula's five, and the draft is empty", async ({
      page,
    }) => {
      await openCabinet(page, BASE_CABINET);

      const about = dimensionsOf(page);
      await expectNoControls(about);
      await expect(dimension(about, dimensionLabel("defaultWidth"))).toHaveText(
        "600mm",
      );
      await expect(dimension(about, dimensionLabel("minWidth"))).toHaveText(
        "200mm",
      );
      await expect(dimension(about, dimensionLabel("maxWidth"))).toHaveText(
        "800mm",
      );
      await expect(dimension(about, "Pas")).toHaveText("50mm");
      await expect(dimension(about, dimensionLabel("bodyHeight"))).toHaveText(
        "860mm",
      );
      await expect(dimension(about, depthLabel(600))).toHaveText("620mm");
      await expect(dimension(about, depthLabel(700))).toHaveText("720mm");
      await expect(
        detailOf(page).getByText("1 · 2 de la 500 mm"),
        "the doors step from one leaf to two at 500 mm",
      ).toBeVisible();
      await expect(allPriceFields(page)).toHaveCount(4);
      for (const label of [
        anchorLabel(600),
        PLUS_LABEL,
        MINUS_LABEL,
        doorLabel(500),
      ]) {
        await expect(priceFieldOf(page, label), label).toBeVisible();
      }
      await expect(priceFieldOf(page, anchorLabel(600))).toHaveValue("3960");
      await expect(
        saveButton(page),
        "nothing typed, nothing to save",
      ).toBeDisabled();
      await expect(cancelButton(page)).toHaveCount(0);
      await expect(
        sentenceOf(page),
        "the sentence says the active figures",
      ).toContainText(baseCostSentence(600, "3 960 lei"));
      await expect(
        detailOf(page).getByText(
          romanian("priceDashboard.cabinet.hardwareLine", {
            widthMm: 600,
            quantities: "4 balamale",
            amount: "70 lei",
            className: "Standard",
          }),
        ),
        "the hardware the cabinet carries, read-only",
      ).toBeVisible();
      await shootForReview(page, "390-d3a-base");
    });

    test("a wall cabinet: finished height, the opening's maximum, a field for the height step", async ({
      page,
    }) => {
      await openCabinet(page, WALL_CABINET);

      const about = dimensionsOf(page);
      await expectNoControls(about);
      await expect(
        dimension(about, dimensionLabel("bodyHeight")),
      ).toContainText("700mm");
      await expect(dimension(about, dimensionLabel("maxHeight"))).toHaveText(
        "900mm",
      );
      await expect(dimension(about, depthLabel(600))).toHaveText("330mm");
      await expect(dimension(about, depthLabel(700))).toHaveText("400mm");
      await expect(allPriceFields(page)).toHaveCount(5);
      await expect(priceFieldOf(page, HEIGHT_LABEL)).toHaveValue("35");
      await expect(
        previewTable(page).getByRole("columnheader", {
          name: romanian("priceDashboard.cabinet.columnWallRow", {
            heightMm: 700,
          }),
        }),
        "the wall row's own column",
      ).toBeVisible();
      await expect(
        previewTable(page).getByRole("columnheader", {
          name: romanian("priceDashboard.cabinet.columnTopRow", {
            heightMm: 400,
          }),
        }),
        "the top row's own column",
      ).toBeVisible();
      await shootForReview(page, "390-d3d-wall");
    });

    test("a corner piece: one fixed width, a finished height, one price and no steps", async ({
      page,
    }) => {
      await openCabinet(page, CORNER_900);

      const about = dimensionsOf(page);
      await expectNoControls(about);
      await expect(
        dimension(about, dimensionLabel("availableWidths")),
      ).toHaveText("900mm");
      await expect(dimension(about, dimensionLabel("bodyHeight"))).toHaveText(
        "860mm",
      );
      await expect(allPriceFields(page)).toHaveCount(1);
      await expect(priceFieldOf(page, anchorLabel(900))).toHaveValue("4000");
      await expect(sentenceOf(page)).toHaveText(
        baseCostSentence(900, "4 000 lei"),
      );
      await expect(
        detailOf(page).getByText(
          romanian("priceDashboard.cabinet.structuralNote"),
        ),
      ).toBeVisible();
      await shootForReview(page, "390-d3g-corner");
    });

    test("a cabinet made in fixed sizes: one price for each size, a sentence that lists them, and no steps", async ({
      page,
    }) => {
      await openCabinet(page, TWO_SIZES_CARGO);

      await expect(
        dimension(dimensionsOf(page), dimensionLabel("availableWidths")),
      ).toHaveText("200mm300mm");
      await expect(allPriceFields(page)).toHaveCount(2);
      await expect(priceFieldOf(page, anchorLabel(200))).toHaveValue("1800");
      await expect(priceFieldOf(page, anchorLabel(300))).toHaveValue("2250");
      await expect(sentenceOf(page)).toHaveText(
        "200 mm: 1 800 lei, 300 mm: 2 250 lei.",
      );
      await expect(
        previewTable(page)
          .getByRole("row")
          .filter({ has: page.getByRole("rowheader") }),
        "a row for each size and no other",
      ).toHaveCount(2);
      await shootForReview(page, "390-d3f-fixed-sizes");
    });

    for (const { ruleId, name, frame } of [
      { ruleId: HOOD, name: "the hood", frame: "d3e-hood" },
      {
        ruleId: FREE_FRIDGE,
        name: "the free-standing fridge",
        frame: "fridge-free",
      },
    ]) {
      test(`${name} is supplied by the customer: no price field, no Save, 0 lei, and the disabled switch says the price does not change`, async ({
        page,
      }) => {
        await openCabinet(page, ruleId);

        await expect(allPriceFields(page), "nothing to type into").toHaveCount(
          0,
        );
        await expect(saveButton(page)).toHaveCount(0);
        await expect(previewTable(page), "no table of prices").toHaveCount(0);
        const depth = depthSwitch(page);
        await expect(depth).toBeDisabled();
        await expect(depth).toHaveAttribute("aria-checked", "false");
        await expect(depth).toContainText(
          romanian("priceDashboard.cabinet.depthToggleDisabled", {
            deepMm: 700,
          }),
        );
        await expect(
          detailOf(page).getByText(
            romanian("priceDashboard.chips.customerSupplied"),
            {
              exact: true,
            },
          ),
        ).not.toHaveCount(0);
        await expect(detailOf(page)).toContainText("0 lei");
        await expect(
          detailOf(page).getByText(
            romanian("priceDashboard.cabinet.customerSupplied"),
          ),
        ).toBeVisible();
        const hoodNote = detailOf(page).getByText(
          romanian("priceDashboard.cabinet.hoodNote"),
        );
        await expect(hoodNote).toHaveCount(ruleId === HOOD ? 1 : 0);
        await depth.click({ force: true });
        await expect(
          depth,
          "a click on a disabled switch changes nothing",
        ).toHaveAttribute("aria-checked", "false");
        await shootForReview(page, `390-${frame}`);
      });
    }

    test("a rule the book does not hold answers 404 and the not-found page, whatever the id looks like", async ({
      page,
      pageErrors,
    }) => {
      for (const id of [
        "cabinet.does-not-exist",
        "cabinet.base-cabinet.x",
        "CABINET.BASE-CABINET",
        "%252E%252E",
      ]) {
        const response = await page.goto(`${CABINETS_PATH}/${id}`);

        expect(response?.status(), `the status for "${id}"`).toBe(404);
        await expect(
          page.getByTestId("cabinet-detail"),
          `"${id}" draws no cabinet`,
        ).toHaveCount(0);
        await expect(page.locator("body")).toContainText("404");
      }
      await page.goto(`${CABINETS_PATH}/cabinet.does-not-exist`);
      await shootForReview(page, "390-unknown-id");
      const unexpected = pageErrors.filter(
        (error) => !isBrowsersNoteOfA404(error),
      );
      pageErrors.length = 0;
      expect(
        unexpected,
        "the browser notes the 404 itself and nothing else",
      ).toEqual([]);
    });

    test("an address that is not valid encoding is refused and draws no cabinet", async ({
      page,
      pageErrors,
    }) => {
      const response = await page.goto(`${CABINETS_PATH}/%E0%A4%A`);

      // Which refusal it is belongs to the framework, not to this page: `next dev` answers 400, `next start` answers 500
      // for a malformed address anywhere in the application (probed: /ro/%E0%A4%A, /ro/d/%E0%A4%A, staff kitchens).
      expect(
        response?.status(),
        "a malformed address is refused, never answered with a page",
      ).toBeGreaterThanOrEqual(400);
      await expect(page.getByTestId("cabinet-detail")).toHaveCount(0);
      pageErrors.length = 0;
    });
  });

  test.describe("typing, saving, cancelling", () => {
    test("typing a price moves the sentence and the Nou column at once, sends nothing, and leaves Activ alone", async ({
      page,
    }) => {
      await openCabinet(page, BASE_CABINET);
      const writes = collectWrites(page);
      const widths = await widthsOfTable(page);
      const activeBefore = await columnOf(page, widths, "active");

      await priceFieldOf(page, anchorLabel(600)).fill(TYPED_ANCHOR);

      await expect(sentenceOf(page)).toContainText(
        baseCostSentence(600, "3 970 lei"),
      );
      await expect(saveButton(page)).toBeEnabled();
      await expect(cancelButton(page)).toBeVisible();
      expect(
        await columnOf(page, widths, "next"),
        "every width is ten lei dearer: the steps are untouched",
      ).toEqual(activeBefore.map((lei) => lei + TEN_LEI));
      expect(
        await columnOf(page, widths, "active"),
        "Activ did not move",
      ).toEqual(activeBefore);
      await expect(
        previewRow(page, 600).locator('td[data-role="next"]').first(),
      ).toHaveAttribute("data-changed", "true");
      await expect(
        previewRow(page, 600).locator('td[data-role="active"]').first(),
      ).toHaveText(/3\s960\slei/);
      await shootForReview(page, "390-d3a-typed");
      await page.waitForTimeout(SETTLE_MS);
      expect(writes, "typing sends nothing").toEqual([]);
      expect(
        (await serverState(page)).draft.changes,
        "the server holds no change",
      ).toEqual([]);
    });

    test("each field moves its own part of the sentence: the steps, the door and the height", async ({
      page,
    }) => {
      await openCabinet(page, WALL_CABINET);

      await priceFieldOf(page, PLUS_LABEL).fill("160");
      await expect(sentenceOf(page)).toContainText(
        stepsSentence("160 lei", "150 lei"),
      );
      await priceFieldOf(page, MINUS_LABEL).fill("170");
      await expect(sentenceOf(page)).toContainText("scade 170 lei");
      await priceFieldOf(page, doorLabel(500)).fill("150");
      await expect(sentenceOf(page)).toContainText("−150 lei");
      await priceFieldOf(page, HEIGHT_LABEL).fill("40");
      await expect(sentenceOf(page)).toContainText("scade 40 lei");
      await shootForReview(page, "390-d3d-wall-typed");
    });

    test("Save writes exactly one change, shows the notice and the pending marks, and a reload and the list hold it with Activ unchanged", async ({
      page,
    }) => {
      await openCabinet(page, BASE_CABINET);
      const stateBefore = await serverState(page);
      const writes = collectWrites(page);
      await priceFieldOf(page, anchorLabel(600)).fill(TYPED_ANCHOR);

      const saved = page.waitForResponse(isDraftWrite);
      await saveButton(page).click();
      expect((await saved).status()).toBe(OK);

      await expect(savedNotice(page)).toHaveText(
        new RegExp(romanian("priceDashboard.common.priceSavedNotice")),
      );
      await expect(
        saveButton(page),
        "Save is replaced by the notice",
      ).toHaveCount(0);
      expect(writes, "one field changed, one write").toHaveLength(1);
      await expectPendingCount(page, 1);
      await expect(
        detailOf(page).getByText(romanian("priceDashboard.chips.pending"), {
          exact: true,
        }),
        "the cabinet is marked as awaiting publication",
      ).not.toHaveCount(0);
      await expect(priceFieldOf(page, anchorLabel(600))).toHaveValue(
        TYPED_ANCHOR,
      );
      await expect(
        previewRow(page, 600).locator('td[data-role="active"]').first(),
      ).toHaveText(/3\s960\slei/);
      await expect(
        previewRow(page, 600).locator('td[data-role="next"]').first(),
      ).toHaveText(/3\s970\slei/);
      await shootForReview(page, "390-d3b-saved");

      await page.reload();
      await expect(priceFieldOf(page, anchorLabel(600))).toHaveValue(
        TYPED_ANCHOR,
      );
      await expect(
        detailOf(page).getByText(
          romanian("priceDashboard.common.activeValue", {
            amount: "3 960 lei",
          }),
          { exact: false },
        ),
        "the hint still says what is active",
      ).toBeVisible();
      await expect(
        previewRow(page, 600).locator('td[data-role="active"]').first(),
      ).toHaveText(/3\s960\slei/);
      await expect(
        previewRow(page, 600).locator('td[data-role="next"]').first(),
      ).toHaveText(/3\s970\slei/);
      await expectPendingCount(page, 1);
      const stateAfter = await serverState(page);
      expect(stateAfter.active, "the active version is untouched").toEqual(
        stateBefore.active,
      );
      expect(
        stateAfter.draft.changes,
        "the draft holds the one change",
      ).toHaveLength(1);
      await shootForReview(page, "390-d3b-reloaded");
    });

    test("after Save the list says the row is pending with its active price beside it, reached by the page's link", async ({
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
      await expect(row.getByTestId("cabinet-price")).toContainText("3 970");
      await expectPendingCount(page, 1);
      await expectHydrated(page, "cabinet-list");
      await shootForReview(page, "390-d2b-list-after-save");
    });

    test("two fixed sizes changed together are two writes and two pending prices, and the other size's row does not move", async ({
      page,
    }) => {
      await openCabinet(page, TWO_SIZES_CARGO);
      const writes = collectWrites(page);
      const small = await leiOfCell(previewRow(page, 200), "next");

      await priceFieldOf(page, anchorLabel(300)).fill("2260");
      await expect(sentenceOf(page)).toHaveText(
        "200 mm: 1 800 lei, 300 mm: 2 260 lei.",
      );
      expect(
        await leiOfCell(previewRow(page, 200), "next"),
        "the 200 mm row did not move",
      ).toBe(small);
      expect(await leiOfCell(previewRow(page, 300), "next")).toBe(2260);
      await priceFieldOf(page, anchorLabel(200)).fill("1810");
      await saveButton(page).click();
      await expect(savedNotice(page)).toBeVisible();

      expect(writes, "one write for each changed field").toHaveLength(2);
      await expectPendingCount(page, 2);
      await shootForReview(page, "390-d3f-saved");
    });

    test("a corner's single price saves, and typing the active price back takes the change out of the draft", async ({
      page,
    }) => {
      await openCabinet(page, CORNER_900);
      const field = priceFieldOf(page, anchorLabel(900));
      await field.fill("4010");
      await expect(sentenceOf(page)).toHaveText(
        baseCostSentence(900, "4 010 lei"),
      );
      await saveButton(page).click();
      await expect(savedNotice(page)).toBeVisible();
      await expectPendingCount(page, 1);

      await field.fill("4000");
      await saveButton(page).click();

      await expect(page.getByTestId("staff-pending-prices")).toHaveCount(0);
      expect((await serverState(page)).draft.changes).toEqual([]);
    });

    test("Cancel puts the fields back to what the draft holds, sends nothing, and leaves focus on the page", async ({
      page,
    }) => {
      await openCabinet(page, BASE_CABINET);
      const writes = collectWrites(page);
      await priceFieldOf(page, anchorLabel(600)).fill(TYPED_ANCHOR);
      await priceFieldOf(page, PLUS_LABEL).fill("210");

      await cancelButton(page).focus();
      await page.keyboard.press("Enter");

      await expect(priceFieldOf(page, anchorLabel(600))).toHaveValue("3960");
      await expect(priceFieldOf(page, PLUS_LABEL)).toHaveValue("200");
      await expect(saveButton(page)).toBeDisabled();
      await expect(cancelButton(page)).toHaveCount(0);
      await expect(sentenceOf(page)).toContainText(
        baseCostSentence(600, "3 960 lei"),
      );
      await page.waitForTimeout(SETTLE_MS);
      expect(writes).toEqual([]);
      expect(
        await activeStop(page),
        "Cancel is gone with the change: focus must not be lost to the page's body",
      ).not.toBe("body");
    });

    test("after Save by keyboard the focus is on the notice that replaced Save, not on the body", async ({
      page,
    }) => {
      await openCabinet(page, BASE_CABINET);
      await priceFieldOf(page, anchorLabel(600)).fill(TYPED_ANCHOR);

      await saveButton(page).focus();
      await page.keyboard.press("Enter");

      await expect(savedNotice(page)).toBeVisible();
      await expect(savedNotice(page)).toBeFocused();
      await page.keyboard.press("Tab");
      expect(
        await activeStop(page),
        "Tab from the notice goes on to its link to the publish page",
      ).toMatch(/^a:/);
    });

    test("typing after Save brings Save back for the new value, and the notice goes", async ({
      page,
    }) => {
      await openCabinet(page, BASE_CABINET);
      await priceFieldOf(page, anchorLabel(600)).fill(TYPED_ANCHOR);
      await saveButton(page).click();
      await expect(savedNotice(page)).toBeVisible();

      await priceFieldOf(page, anchorLabel(600)).fill("3980");

      await expect(savedNotice(page)).toHaveCount(0);
      await expect(saveButton(page)).toBeEnabled();
    });
  });

  test.describe("the browser's Back button after a price is saved a page later", () => {
    test("Playwright's own Chromium, which switches the back-forward cache off: the list the Back button shows has the saved price", async ({
      page,
    }, testInfo) => {
      const back = await saveThenGoBack(page);

      testInfo.annotations.push({
        type: "what the browser's Back button did (cache switched off)",
        description: describeBack(back),
      });
      await expectListHoldsTheSavedPrice(page);
    });

    test("with the back-forward cache a real browser has, switched back on: the list the Back button shows has the saved price, whether it came back from the cache or was loaded again", async ({
      baseURL,
    }, testInfo) => {
      const browser = await chromium.launch({
        ignoreDefaultArgs: ["--disable-back-forward-cache"],
      });
      const context = await browser.newContext({
        ...(baseURL === undefined ? {} : { baseURL }),
        viewport: PHONE,
        isMobile: true,
        hasTouch: true,
      });
      try {
        await signIn(context, signedIn.administrator);
        const page = await context.newPage();

        const back = await saveThenGoBack(page);

        testInfo.annotations.push({
          type: "what the browser's Back button did (cache allowed)",
          description: describeBack(back),
        });
        await shootForReview(page, "390-d2b-list-after-back-bfcache");
        await expectListHoldsTheSavedPrice(page);
      } finally {
        await context.close();
        await browser.close();
      }
    });
  });

  test.describe("a value that cannot be saved", () => {
    test("15 is refused on the field it was typed in, with its reason; Save is off and nothing is sent", async ({
      page,
    }) => {
      await openCabinet(page, BASE_CABINET);
      const writes = collectWrites(page);
      const field = priceFieldOf(page, anchorLabel(600));

      await field.fill("15");

      await expect(field).toHaveAttribute("aria-invalid", "true");
      const reason = await refusalOf(field);
      await expect(reason).toHaveText(
        romanian("priceDashboard.errors.notMultipleOfTen", {
          step: "10",
          example: "450",
        }),
      );
      await expect(
        detailOf(page).getByRole("alert"),
        "one alert, on the one field",
      ).toHaveCount(1);
      await expect(saveButton(page)).toBeDisabled();
      await expect(
        detailOf(page).getByText(romanian("priceDashboard.errors.fixToSave")),
      ).toBeVisible();
      await expect(
        previewTable(page),
        "no table is drawn from a price that is not one",
      ).toBeVisible();
      await shootForReview(page, "390-d3c-error-15");
      await saveButton(page).click({ force: true });
      await field.press("Enter");
      await page.waitForTimeout(SETTLE_MS);
      expect(writes, "a refused value is never sent").toEqual([]);
      expect((await serverState(page)).draft.changes).toEqual([]);
    });

    for (const unsendable of [
      "",
      "abc",
      "-10",
      "10,555",
      "1e3",
      "99999999999999999999",
    ]) {
      test(`"${unsendable}" in the price field is refused with a reason and cannot be saved`, async ({
        page,
      }) => {
        await openCabinet(page, BASE_CABINET);
        const writes = collectWrites(page);
        const field = priceFieldOf(page, anchorLabel(600));

        await field.fill(unsendable);

        await expect(field).toHaveAttribute("aria-invalid", "true");
        await expect(await refusalOf(field)).toBeVisible();
        await expect(saveButton(page)).toBeDisabled();
        await saveButton(page).click({ force: true });
        await page.waitForTimeout(SETTLE_MS);
        expect(writes).toEqual([]);
      });
    }

    test("a minus step that makes the narrowest width cost nothing is refused on the minus field, at the exact step where it turns", async ({
      page,
    }) => {
      await openCabinet(page, BASE_CABINET);
      const writes = collectWrites(page);
      const minus = priceFieldOf(page, MINUS_LABEL);

      await minus.fill("470");
      await expect(
        minus,
        "3 960 - 8 x 470 - 180 is 20 lei: a price",
      ).not.toHaveAttribute("aria-invalid", "true");
      await expect(saveButton(page)).toBeEnabled();
      await minus.fill("480");

      await expect(
        minus,
        "3 960 - 8 x 480 - 180 is below zero",
      ).toHaveAttribute("aria-invalid", "true");
      const reason = await refusalOf(minus);
      await expect(reason).toHaveText(
        romanian("priceDashboard.errors.priceNotPositiveAtWidth", {
          widthMm: 200,
        }),
      );
      for (const other of [anchorLabel(600), PLUS_LABEL, doorLabel(500)]) {
        await expect(
          priceFieldOf(page, other),
          `${other} is not the field to correct`,
        ).not.toHaveAttribute("aria-invalid", "true");
      }
      await expect(saveButton(page)).toBeDisabled();
      await expect(cancelButton(page)).toBeVisible();
      await shootForReview(page, "390-d3c-error-minus");
      await saveButton(page).click({ force: true });
      await page.waitForTimeout(SETTLE_MS);
      expect(writes).toEqual([]);
      await minus.fill("200");
      await expect(minus).not.toHaveAttribute("aria-invalid", "true");
      await expect(
        saveButton(page),
        "the value is only a draft of the person",
      ).toBeDisabled();
    });

    test("while a value is refused the sentence does not state it as the price: it keeps saying what the draft holds (D3C)", async ({
      page,
    }) => {
      await openCabinet(page, BASE_CABINET);

      await priceFieldOf(page, MINUS_LABEL).fill("480");

      await expect(
        priceFieldOf(page, MINUS_LABEL),
        "the value is refused",
      ).toHaveAttribute("aria-invalid", "true");
      await expect(sentenceOf(page)).toContainText("scade 200 lei");
      await expect(
        sentenceOf(page),
        "a price nobody can save is not said as if it were one",
      ).not.toContainText("480");
    });

    test("a height step that makes the top row's smallest piece cost nothing is refused on the height field", async ({
      page,
    }) => {
      await openCabinet(page, WALL_CABINET);
      const height = priceFieldOf(page, HEIGHT_LABEL);

      await height.fill("270");
      await expect(height, "1 630 - 6 x 270 is 10 lei").not.toHaveAttribute(
        "aria-invalid",
        "true",
      );
      await height.fill("280");

      await expect(height).toHaveAttribute("aria-invalid", "true");
      await expect(await refusalOf(height)).toHaveText(
        romanian("priceDashboard.errors.priceNotPositiveAtHeight", {
          heightMm: 400,
        }),
      );
      await expect(saveButton(page)).toBeDisabled();
    });

    test("an anchor of zero is refused on the anchor, the field whose correction can fix it, and not on the minus step", async ({
      page,
    }) => {
      await openCabinet(page, BASE_CABINET);
      const anchor = priceFieldOf(page, anchorLabel(600));

      await anchor.fill("0");

      await expect(saveButton(page)).toBeDisabled();
      await expect(
        anchor,
        "a price of 0 at 600 mm cannot be mended by a smaller step: the anchor is the field to correct",
      ).toHaveAttribute("aria-invalid", "true");
      await expect(priceFieldOf(page, MINUS_LABEL)).not.toHaveAttribute(
        "aria-invalid",
        "true",
      );
    });

    test("an anchor lowered until a price is zero is refused and the Nou column draws no figure for it", async ({
      page,
    }) => {
      await openCabinet(page, BASE_CABINET);
      const anchor = priceFieldOf(page, anchorLabel(600));

      await anchor.fill("1000");

      await expect(saveButton(page)).toBeDisabled();
      await expect(
        detailOf(page).getByRole("alert"),
        "an alert says it",
      ).not.toHaveCount(0);
      await expect(
        previewRow(page, 200).locator('td[data-role="next"]').first(),
        "the narrowest width would cost below zero: no figure",
      ).toHaveText("");
    });
  });

  test.describe("the hardware and the deep-kitchen switches", () => {
    test("the hardware switch adds what the readout says to every width, and each class of hardware prices differently", async ({
      page,
    }) => {
      await openCabinet(page, BASE_CABINET);
      const row = previewRow(page, 600);
      const without = await leiOfCell(row, "active");
      await expect(hardwareSwitch(page)).toHaveAttribute(
        "aria-checked",
        "false",
      );

      await hardwareSwitch(page).click();

      await expect(hardwareSwitch(page)).toHaveAttribute(
        "aria-checked",
        "true",
      );
      expect(
        await leiOfCell(row, "active"),
        "600 mm carries four hinges of the standard class: the +70 lei the readout states",
      ).toBe(without + 70);
      const classes = detailOf(page).getByRole("radio");
      await expect(classes).toHaveCount(3);
      await expect(classes.first()).toBeChecked();
      await shootForReview(page, "390-d3a-hardware-standard");
      const figures: number[] = [await leiOfCell(row, "active")];
      for (const index of [1, 2]) {
        await classes.nth(index).check();
        figures.push(await leiOfCell(row, "active"));
      }
      expect(
        new Set(figures).size,
        `three classes, three prices: ${figures.join(", ")}`,
      ).toBe(3);
      expect(figures.every((lei) => lei > without)).toBe(true);
      await shootForReview(page, "390-d3a-hardware-premium");
      await hardwareSwitch(page).click();
      expect(await leiOfCell(row, "active")).toBe(without);
    });

    test("the hardware column follows a typed price: Nou stays ten lei above Activ with hardware on", async ({
      page,
    }) => {
      await openCabinet(page, BASE_CABINET);
      await hardwareSwitch(page).click();

      await priceFieldOf(page, anchorLabel(600)).fill(TYPED_ANCHOR);

      const row = previewRow(page, 600);
      expect(await leiOfCell(row, "next")).toBe(
        (await leiOfCell(row, "active")) + TEN_LEI,
      );
    });

    test("the deep-kitchen switch raises every figure by the percentage it names, to the nearest 10 lei", async ({
      page,
    }) => {
      await openCabinet(page, BASE_CABINET);
      const row = previewRow(page, 600);
      const shallow = await leiOfCell(row, "active");
      await expect(depthSwitch(page)).toBeEnabled();

      await depthSwitch(page).click();

      await expect(depthSwitch(page)).toHaveAttribute("aria-checked", "true");
      const percent = Number(
        /\+(\d+) %/.exec(await depthSwitch(page).innerText())?.[1],
      );
      expect(percent, "the switch names its percentage").toBeGreaterThan(0);
      const deep = await leiOfCell(row, "active");
      expect(
        Math.abs(deep - (shallow * (100 + percent)) / 100),
      ).toBeLessThanOrEqual(5);
      expect(deep % TEN_LEI, "rounded to 10 lei").toBe(0);
      await shootForReview(page, "390-d3a-deep");
      await depthSwitch(page).click();
      expect(await leiOfCell(row, "active")).toBe(shallow);
    });

    test("a wall row can be deepened too: its switch is on and its figures rise", async ({
      page,
    }) => {
      await openCabinet(page, WALL_CABINET);
      const row = previewRow(page, 600);
      const shallow = await leiOfCell(row, "active");
      await expect(depthSwitch(page)).toBeEnabled();

      await depthSwitch(page).click();

      await expect(depthSwitch(page)).toHaveAttribute("aria-checked", "true");
      expect(await leiOfCell(row, "active")).toBeGreaterThan(shallow);
    });
  });

  test.describe("a pending price in another language", () => {
    test("the Russian page of a cabinet with a pending price fits and says so", async ({
      page,
    }) => {
      await openCabinet(page, BASE_CABINET);
      await priceFieldOf(page, anchorLabel(600)).fill(TYPED_ANCHOR);
      await saveButton(page).click();
      await expect(savedNotice(page)).toBeVisible();

      await page.goto(`${RUSSIAN_CABINETS_PATH}/${BASE_CABINET}`);

      await expect(detailOf(page)).toBeVisible();
      await expect(
        page.locator("html"),
        "the page is in Russian",
      ).toHaveAttribute("lang", "ru");
      await expect(
        priceFieldOf(
          page,
          russian("priceDashboard.cabinet.fieldAnchor", { widthMm: 600 }),
        ),
      ).toHaveValue(TYPED_ANCHOR);
      await expectNoSidewaysScroll(page, "the Russian page");
      await shootForReview(page, "390-d3r-ru-saved");
    });
  });

  test.describe("the page on a phone", () => {
    test("no sideways scroll at rest, with values typed, with a refusal, with hardware and depth on", async ({
      page,
    }) => {
      await openCabinet(page, WALL_CABINET);
      await expectNoSidewaysScroll(page, "the wall cabinet at rest");
      await priceFieldOf(page, PLUS_LABEL).fill("160");
      await expectNoSidewaysScroll(page, "a value typed");
      await priceFieldOf(page, HEIGHT_LABEL).fill("280");
      await expectNoSidewaysScroll(page, "a refusal shown");
      await priceFieldOf(page, HEIGHT_LABEL).fill("30");
      await hardwareSwitch(page).click();
      await depthSwitch(page).click();
      await expectNoSidewaysScroll(page, "hardware and depth on");
      await openCabinet(page, BASE_CABINET);
      await expectNoSidewaysScroll(page, "the base cabinet");
      await openCabinet(page, HOOD);
      await expectNoSidewaysScroll(page, "the hood");
    });

    test("every control of the page is at least 44 px, at rest, in error and after Save", async ({
      page,
    }) => {
      const scope = "[data-testid=cabinet-detail]";
      await openCabinet(page, WALL_CABINET);
      await expectTargetsLargeEnough(page, scope, "the wall cabinet at rest");
      await priceFieldOf(page, HEIGHT_LABEL).fill("280");
      await expectTargetsLargeEnough(page, scope, "a refusal shown");
      await priceFieldOf(page, HEIGHT_LABEL).fill("30");
      await hardwareSwitch(page).click();
      await expectTargetsLargeEnough(page, scope, "the hardware classes shown");
      await saveButton(page).click();
      await expect(savedNotice(page)).toBeVisible();
      await expectTargetsLargeEnough(page, scope, "the notice after Save");
      await openCabinet(page, HOOD);
      await expectTargetsLargeEnough(page, scope, "the hood");
    });

    test("the sticky Save bar covers no field: each one, reached by Tab, is the thing a finger would hit", async ({
      page,
    }) => {
      await openCabinet(page, WALL_CABINET);
      await priceFieldOf(page, PLUS_LABEL).fill("160");
      const fields = await allPriceFields(page).count();
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      await priceFieldOf(page, anchorLabel(600)).focus();

      for (let index = 0; index < fields; index += 1) {
        await expect(
          allPriceFields(page).nth(index),
          `field ${String(index)} focused`,
        ).toBeFocused();
        expect(
          await coveredBySomethingElse(allPriceFields(page).nth(index)),
          `field ${String(index)} is covered once focused`,
        ).toBe(false);
        await page.keyboard.press("Tab");
      }
      await shootForReview(page, "390-d3m2-last-field-focused");
    });

    test("Tab onto a field that sits at the foot of the screen does not leave it under the sticky Save bar", async ({
      page,
    }) => {
      await openCabinet(page, WALL_CABINET);
      await priceFieldOf(page, PLUS_LABEL).fill("160");
      const last = priceFieldOf(page, HEIGHT_LABEL);

      await priceFieldOf(page, doorLabel(500)).focus();
      await last.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        window.scrollBy(0, rect.bottom - window.innerHeight + 4);
      });
      await page.keyboard.press("Tab");
      await expect(last, "Tab goes on to the height step").toBeFocused();
      await page.waitForTimeout(SETTLE_MS);

      expect(
        await coveredBySomethingElse(last),
        "the focused field is under another element",
      ).toBe(false);
      await shootForReview(page, "390-focus-under-sticky-bar");
    });

    test("at the top of the page the Save bar is pinned to the foot of the screen, with the fields above it", async ({
      page,
    }) => {
      await openCabinet(page, BASE_CABINET);
      await priceFieldOf(page, anchorLabel(600)).fill(TYPED_ANCHOR);
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      await page
        .getByRole("heading", {
          name: romanian("priceDashboard.cabinet.priceHeading"),
          exact: true,
        })
        .scrollIntoViewIfNeeded();

      await expect(saveButton(page)).toBeInViewport();
      const save = await saveButton(page).boundingBox();
      expect(
        (save?.y ?? 0) + (save?.height ?? 0),
        "Save is at the foot of the screen",
      ).toBeGreaterThan(PHONE.height - 90);
      await shootViewport(page, "390-d3m2-save-pinned");
    });

    test("the Save bar stays in view while the page is scrolled down to the table, as the mockup's D3M2 says: Save stays fixed at the bottom", async ({
      page,
    }) => {
      await openCabinet(page, BASE_CABINET);
      await priceFieldOf(page, anchorLabel(600)).fill(TYPED_ANCHOR);

      await previewRow(page, 800).scrollIntoViewIfNeeded();

      await shootViewport(page, "390-d3m2-table-scrolled-no-save");
      await expect(
        saveButton(page),
        "Save is in the window wherever the page is scrolled",
      ).toBeInViewport();
    });
  });

  test.describe("the list's inline field and a window that changes width", () => {
    test("a price field opened at 1024 and the window narrowed to 768: a tap on the field does not leave the list", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1024, height: 844 });
      await openList(page);
      const row = listRowOf(page, BASE_CABINET);
      await row.getByRole("button", { name: EDIT_PRICE_NAME }).tap();
      const field = row.getByRole("textbox");
      await expect(field).toBeVisible();
      await field.fill("3970");
      await page.setViewportSize({ width: 768, height: 844 });
      await page.waitForTimeout(SETTLE_MS);
      await shootForReview(page, "768-list-field-open");

      await expect(
        field,
        "the field is still there to be tapped",
      ).toBeVisible();
      const box = await field.boundingBox();
      expect(box, "the field has a box").not.toBeNull();
      await page.touchscreen.tap(
        (box?.x ?? 0) + (box?.width ?? 0) / 2,
        (box?.y ?? 0) + (box?.height ?? 0) / 2,
      );
      await page.waitForTimeout(SETTLE_MS);

      await expect(
        page,
        "a tap on the field is not a tap on the card's link",
      ).toHaveURL(new RegExp(`${CABINETS_PATH}$`));
    });
  });
});

const EDIT_PRICE_NAME = romanian("priceDashboard.cabinets.editPriceAria", {
  name: "",
}).trim();

function listRowOf(page: Page, ruleId: string): Locator {
  return page.locator(`[data-rule-id="${ruleId}"]`);
}

function dimensionsOf(page: Page): Locator {
  return detailOf(page).getByRole("region", {
    name: romanian("priceDashboard.cabinet.dimensionsHeading"),
  });
}

function dimension(section: Locator, label: string): Locator {
  return section
    .locator("dl > div")
    .filter({ has: section.page().locator("dt", { hasText: label }) })
    .locator("dd")
    .first();
}

/** Nothing in the dimensions can be pressed, typed into or edited: they come from the model and are read. */
async function expectNoControls(section: Locator): Promise<void> {
  await expect(section).toBeVisible();
  await expect(
    section.locator(
      "input, button, select, textarea, a[href], [contenteditable], [role=textbox], [role=switch]",
    ),
    "the dimensions hold no control",
  ).toHaveCount(0);
}

async function widthsOfTable(page: Page): Promise<number[]> {
  const heads = await previewTable(page).getByRole("rowheader").allInnerTexts();
  return heads.map((text) => Number(/\d+/.exec(text)?.[0]));
}

/** The first column's "Activ" or "Nou" figure of every row, in the table's order. */
async function columnOf(
  page: Page,
  widths: readonly number[],
  kind: "active" | "next",
): Promise<number[]> {
  const figures: number[] = [];
  for (const widthMm of widths) {
    figures.push(await leiOfCell(previewRow(page, widthMm), kind));
  }
  return figures;
}

/** The focus, named by what it is: `a:text`, `button:name`, `input:label`, or `body`. */
async function activeStop(page: Page): Promise<string> {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (active === null || active === document.body) return "body";
    const tag = active.tagName.toLowerCase();
    const name =
      active.getAttribute("aria-label") ??
      active.textContent.trim().replace(/\s+/g, " ").slice(0, 60);
    return `${tag}:${name}`;
  });
}

/** Presses Tab from the top of the page until the focus is on a link of a card; answers every stop on the way. */
async function tabStopsUntilCardLink(page: Page): Promise<string[]> {
  const stops: string[] = [];
  const limit = 80;
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  for (let press = 0; press < limit; press += 1) {
    await page.keyboard.press("Tab");
    const stop = await activeStop(page);
    stops.push(stop);
    const isCardLink = await page.evaluate(
      () =>
        document.activeElement?.getAttribute("data-testid") === "cabinet-link",
    );
    if (isCardLink) return stops;
  }
  throw new Error(
    `no card link in ${String(limit)} Tab stops: ${stops.join(" | ")}`,
  );
}

/** Whether the point at the middle of the field belongs to something other than the field. */
async function coveredBySomethingElse(field: Locator): Promise<boolean> {
  return field.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const points = [
      [rect.left + rect.width / 2, rect.top + rect.height / 2],
      [rect.left + 4, rect.top + 4],
      [rect.right - 4, rect.bottom - 4],
    ] as const;
    return points.some(([x, y]) => {
      const hit = document.elementFromPoint(x, y);
      return hit !== element;
    });
  });
}

interface WhatBackDid {
  readonly isSameDocument: boolean;
  readonly persisted: readonly boolean[];
  readonly navigationType: string;
  readonly notRestoredReasons: string;
  readonly listCacheControl: string;
}

/** Marks the list's document, saves a price on the cabinet's page reached from it, presses Back, and says what came. */
async function saveThenGoBack(page: Page): Promise<WhatBackDid> {
  await page.addInitScript(() => {
    const marks = window as unknown as Record<string, unknown>;
    marks.__documentToken = Math.random();
    marks.__pageshowPersisted = [] as boolean[];
    window.addEventListener("pageshow", (event) => {
      (marks.__pageshowPersisted as boolean[]).push(event.persisted);
    });
  });
  const listAnswer = page.waitForResponse(
    (response) => new URL(response.url()).pathname === CABINETS_PATH,
  );
  await openList(page);
  const listCacheControl =
    (await (await listAnswer).headerValue("cache-control")) ?? "(none)";
  await expect(listRowOf(page, BASE_CABINET)).toHaveAttribute(
    "data-modified",
    "false",
  );
  const listToken = await page.evaluate(
    () => (window as unknown as Record<string, unknown>).__documentToken,
  );
  await listRowOf(page, BASE_CABINET).getByTestId("cabinet-link").click();
  await expect(page).toHaveURL(new RegExp(`${cabinetPath(BASE_CABINET)}$`));
  await expectHydrated(page, "cabinet-detail");
  await priceFieldOf(page, anchorLabel(600)).fill(TYPED_ANCHOR);
  await saveButton(page).click();
  await expect(savedNotice(page)).toBeVisible();

  await page.goBack();

  await expect(page).toHaveURL(new RegExp(`${CABINETS_PATH}$`));
  await expect(page.getByTestId("cabinet-list")).toBeVisible();
  const afterBack = await page.evaluate(() => {
    const marks = window as unknown as Record<string, unknown>;
    const entry = performance.getEntriesByType(
      "navigation",
    )[0] as PerformanceNavigationTiming & { notRestoredReasons?: unknown };
    return {
      token: marks.__documentToken,
      persisted: marks.__pageshowPersisted as boolean[],
      navigationType: entry.type,
      notRestoredReasons: JSON.stringify(entry.notRestoredReasons ?? null),
    };
  });
  return {
    isSameDocument: afterBack.token === listToken,
    persisted: afterBack.persisted,
    navigationType: afterBack.navigationType,
    notRestoredReasons: afterBack.notRestoredReasons,
    listCacheControl,
  };
}

function describeBack(back: WhatBackDid): string {
  return `the very document that was left: ${String(back.isSameDocument)}; pageshow persisted: ${JSON.stringify(back.persisted)}; navigation type: ${back.navigationType}; not restored reasons: ${back.notRestoredReasons}; the list's Cache-Control: ${back.listCacheControl}`;
}

async function expectListHoldsTheSavedPrice(page: Page): Promise<void> {
  await expectHydrated(page, "cabinet-list");
  await expect(
    listRowOf(page, BASE_CABINET),
    "the list the Back button shows holds the price that was saved a page later",
  ).toHaveAttribute("data-modified", "true");
  await expectPendingCount(page, 1);
}
