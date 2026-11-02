// Wave U2 of M10 in a real browser: the cabinet price list at /ro/staff/catalog/cabinets, edited by a signed-in
// administrator, at the phone's 390 x 844 and at a 1440 x 900 desktop. Inline price edit (frame D2C), the depth-rule
// card (D2E1 to D2E3, D2ER) and the bulk-% dialog (D2D), then layout (no sideways scroll, 44 px targets) and the console.
//
// The draft lives in the e2e server's memory (the fake price book), so every test starts and ends by discarding it
// through the dashboard's own routes: nothing a test writes is left for the next one. The database holds only this
// file's administrator, its session and its rate-limit counters, all removed in `afterAll`.
//
// The 1440 cases sit in this file, which only the mobile project matches, so each describe states its own viewport and
// input kind and asserts the viewport it got.
import { DEEP_CABINET_DEPTH_MM } from "@lemnaria/configurator-domain";
import {
  countStaffFixturesForTests,
  removeStaffFixturesForTests,
} from "@lemnaria/persistence";
import { expect, type Locator, type Page } from "@playwright/test";

import {
  discardDraft,
  DRAFT_ROUTE,
  expectNoSidewaysScroll,
  expectTargetsLargeEnough,
  OK,
  priceRateLimitKeysOf,
  STATE_ROUTE,
  test,
} from "./support/price-dashboard-session";
import { shootForReview } from "./support/staff-pages";
import {
  NOTHING_LEFT,
  plantSignedInAdministrator,
  romanian,
  signIn,
  type SignedInAdministrator,
} from "./support/staff-world";

const CABINETS_PATH = "/ro/staff/catalog/cabinets";
const RUSSIAN_CABINETS_PATH = "/ru/staff/catalog/cabinets";
const TEN_LEI = 10;
const DEPTH_STEP_PERCENT = 3;
const BULK_PERCENT = "10";
const TOO_BIG_DEPTH_PERCENT = "120";

const VIEWPORTS = [
  {
    label: "phone",
    size: { width: 390, height: 844 },
    isTouch: true,
  },
  {
    label: "desktop",
    size: { width: 1440, height: 900 },
    isTouch: false,
  },
] as const;

let signedIn: SignedInAdministrator;
let rateLimitKeys: readonly string[] = [];

test.beforeAll(async () => {
  test.setTimeout(120_000);
  signedIn = await plantSignedInAdministrator();
  rateLimitKeys = priceRateLimitKeysOf(signedIn);
});

test.afterAll(async () => {
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

for (const viewport of VIEWPORTS) {
  test.describe(`the price list at ${viewport.label} ${String(viewport.size.width)}`, () => {
    test.use({
      viewport: viewport.size,
      isMobile: viewport.isTouch,
      hasTouch: viewport.isTouch,
    });

    test.beforeEach(({ page }) => {
      expect(
        page.viewportSize(),
        "the viewport this describe asked for",
      ).toEqual(viewport.size);
    });

    registerSpecs(viewport.label, viewport.isTouch);
  });
}

function registerSpecs(label: string, isPhone: boolean): void {
  test("a valid price saves to the draft on Enter; the row, the group and the frame say pending, and a reload keeps it", async ({
    page,
  }) => {
    test.skip(isPhone, PHONE_HAS_NO_PRICE_BUTTON);
    await openList(page);
    const row = await editableRow(page);
    const ruleId = await ruleIdOf(row);
    const button = priceButton(row);
    const figureBefore = normalised(await button.innerText());
    await shootForReview(page, `${label}-d2a-list`);

    await button.click();
    const field = priceField(row);
    await expect(
      field,
      "the field is labelled with the price's width",
    ).toBeVisible();
    await expect(field).toBeFocused();
    await expect(
      row.getByText(romanian("priceDashboard.units.currency"), { exact: true }),
      "the unit is drawn in the field",
    ).toBeVisible();
    await expect(
      row.getByText(romanian("priceDashboard.cabinets.editHint")),
    ).toBeVisible();
    await field.fill(plusTenLei(await field.inputValue()));
    await shootForReview(page, `${label}-d2c-typed`);

    const saved = page.waitForResponse(isDraftWrite);
    await field.press("Enter");
    expect((await saved).status()).toBe(OK);

    await expect(row).toHaveAttribute("data-modified", "true");
    await expect(field, "the field closes").toHaveCount(0);
    await expect(priceButton(row), "focus returns to the price").toBeFocused();
    await expect(priceButton(row)).not.toHaveText(figureBefore);
    await expect(row.getByTestId("cabinet-price")).toContainText(
      `activ ${amountOf(figureBefore)}`,
    );
    await expect(
      row.getByText(romanian("priceDashboard.chips.modified")),
    ).toBeVisible();
    await expectPendingCount(page, 1);
    await expect(
      page
        .getByTestId("cabinet-group-base")
        .getByText(
          romanian("priceDashboard.cabinets.groupPending", { count: 1 }),
        ),
    ).toBeVisible();
    await shootForReview(page, `${label}-d2b-pending`);

    await page.reload();
    const reloaded = page.locator(`[data-rule-id="${ruleId}"]`);
    await expect(reloaded).toHaveAttribute("data-modified", "true");
    await expect(reloaded.getByTestId("cabinet-price")).toContainText(
      `activ ${amountOf(figureBefore)}`,
    );
    await expectPendingCount(page, 1);
  });

  test("pressing a price again with the same pending value saves nothing new and closes", async ({
    page,
  }) => {
    test.skip(isPhone, PHONE_HAS_NO_PRICE_BUTTON);
    await openList(page);
    const row = await editableRow(page);
    await saveNextPrice(page, row);
    const writes = collectWrites(page);

    await priceButton(row).click();
    await priceField(row).press("Enter");

    await expect(priceField(row)).toHaveCount(0);
    expect(writes, "a value already in the draft is not sent again").toEqual(
      [],
    );
    await expectPendingCount(page, 1);
  });

  test("typing the active price back takes the change out of the draft", async ({
    page,
  }) => {
    test.skip(isPhone, PHONE_HAS_NO_PRICE_BUTTON);
    await openList(page);
    const row = await editableRow(page);
    const activeValue = await openedValueOf(row);
    await priceField(row).press("Escape");
    await saveNextPrice(page, row);
    await expectPendingCount(page, 1);

    await priceButton(row).click();
    await priceField(row).fill(activeValue);
    const reverted = page.waitForResponse(isDraftWrite);
    await priceField(row).press("Enter");

    expect((await reverted).status()).toBe(OK);
    await expect(row).toHaveAttribute("data-modified", "false");
    await expect(page.getByTestId("staff-pending-prices")).toHaveCount(0);
  });

  test("Escape cancels: nothing is sent, the field closes and focus returns to the price", async ({
    page,
  }) => {
    test.skip(isPhone, PHONE_HAS_NO_PRICE_BUTTON);
    await openList(page);
    const row = await editableRow(page);
    const writes = collectWrites(page);
    await priceButton(row).click();
    const field = priceField(row);
    await field.fill(plusTenLei(await field.inputValue()));

    await field.press("Escape");

    await expect(field).toHaveCount(0);
    await expect(priceButton(row)).toBeFocused();
    await expect(row).toHaveAttribute("data-modified", "false");
    await expect(page.getByTestId("staff-pending-prices")).toHaveCount(0);
    await page.waitForTimeout(SETTLE_MS);
    expect(writes, "Escape sends nothing").toEqual([]);
    await shootForReview(page, `${label}-esc-cancelled`);
  });

  test("a price that is not a multiple of 10 lei, or not an amount, alerts, stays open and sends nothing", async ({
    page,
  }) => {
    test.skip(isPhone, PHONE_HAS_NO_PRICE_BUTTON);
    await openList(page);
    const row = await editableRow(page);
    const writes = collectWrites(page);
    const held = await openedValueOf(row);
    const field = priceField(row);

    await field.fill("15");
    const alert = row.getByRole("alert");
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(alert).toHaveText(
      romanian("priceDashboard.errors.notMultipleOfTen", {
        step: "10",
        example: "450",
      }),
    );
    await expect(field).toHaveAttribute(
      "aria-describedby",
      new RegExp((await alert.getAttribute("id")) ?? "never"),
    );
    await shootForReview(page, `${label}-d2c-error-15`);
    await field.press("Enter");

    await expect(field, "the field stays open").toBeVisible();
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(alert).toBeVisible();
    for (const unsendable of [
      "",
      "abc",
      "-10",
      "10,555",
      "1e3",
      "99999999999999999999",
    ]) {
      await field.fill(unsendable);
      await expect(field, `"${unsendable}" is marked invalid`).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      await expect(
        row.getByRole("alert"),
        `"${unsendable}" says why`,
      ).toBeVisible();
      await field.press("Enter");
      await expect(field, `"${unsendable}" keeps the field open`).toBeVisible();
    }
    await page.waitForTimeout(SETTLE_MS);
    expect(writes, "an invalid value is never sent").toEqual([]);

    await field.fill(plusTenLei(held));
    await expect(field, "a valid value clears the mark").not.toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(row.getByRole("alert")).toHaveCount(0);
  });

  test("on a phone the price is plain text with no button, and the card's link opens the cabinet's own page", async ({
    page,
  }) => {
    test.skip(!isPhone, "the table's price is a button at 1440");
    await openList(page);
    const row = page
      .getByTestId("cabinet-group-base")
      .getByTestId("cabinet-row")
      .first();
    const ruleId = await ruleIdOf(row);

    await expect(
      row.getByRole("button", { name: EDIT_PRICE_NAME }),
      "a phone has no price button to press or tab to",
    ).toHaveCount(0);
    await expect(row.getByTestId("cabinet-price")).toContainText(
      romanian("priceDashboard.units.currency"),
    );
    await row.getByTestId("cabinet-link").click();

    await expect(page).toHaveURL(
      new RegExp(`${CABINETS_PATH}/${encodeURIComponent(ruleId)}$`),
    );
  });

  test("the depth rule: an invalid percentage errors and cannot be saved; a valid one goes to the draft", async ({
    page,
  }) => {
    await openList(page);
    const card = page.getByTestId("depth-rule-card");
    const field = card.getByLabel(DEEP_KITCHEN_LABEL);
    const writes = collectWrites(page);
    await shootForReview(page, `${label}-d2e-rest`);

    await field.fill(TOO_BIG_DEPTH_PERCENT);
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(card.getByRole("alert")).toHaveText(
      romanian("priceDashboard.errors.percentTooBig", { max: "100" }),
    );
    await expect(
      saveButton(card),
      "Save is off while the value is wrong",
    ).toBeDisabled();
    await shootForReview(page, `${label}-d2e3-invalid-120`);
    for (const unsendable of ["", "abc", "-5", "1,5", "101"]) {
      await field.fill(unsendable);
      await expect(field, `"${unsendable}"`).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      await expect(card.getByRole("alert"), `"${unsendable}"`).toBeVisible();
      await expect(saveButton(card), `"${unsendable}"`).toBeDisabled();
    }
    expect(writes, "an invalid percentage is never sent").toEqual([]);

    const active = await activeDepthPercent(card);
    const wanted = String(active + DEPTH_STEP_PERCENT);
    await field.fill(wanted);
    await expect(field).not.toHaveAttribute("aria-invalid", "true");
    await expect(card.getByRole("alert")).toHaveCount(0);
    await shootForReview(page, `${label}-d2e1-edited`);
    const saved = page.waitForResponse(isDraftWrite);
    await saveButton(card).click();
    expect((await saved).status()).toBe(OK);

    await expect(card).toHaveAttribute("data-pending", "true");
    await expect(
      card.getByText(romanian("priceDashboard.chips.pending"), { exact: true }),
    ).toBeVisible();
    await expect(card.getByRole("status")).toHaveText(
      romanian("priceDashboard.rule.savedNotice"),
    );
    await expect(field).toHaveValue(wanted);
    await expectPendingCount(page, 1);
    await shootForReview(page, `${label}-d2e2-saved`);

    await page.reload();
    await expect(page.getByTestId("depth-rule-card")).toHaveAttribute(
      "data-pending",
      "true",
    );
    await expect(
      page.getByTestId("depth-rule-card").getByLabel(DEEP_KITCHEN_LABEL),
    ).toHaveValue(wanted);
    await expect(
      page.getByTestId("depth-rule-card").getByText(
        romanian("priceDashboard.rule.activeValue", {
          percent: String(active),
        }),
      ),
      "the active percentage is unchanged",
    ).toBeVisible();

    await page.goto(RUSSIAN_CABINETS_PATH);
    await expect(page.getByTestId("depth-rule-card")).toHaveAttribute(
      "data-pending",
      "true",
    );
    await shootForReview(page, `${label}-d2er-ru-saved`);
  });

  test("the depth rule: Cancel puts the field back to what the draft holds, sending nothing", async ({
    page,
  }) => {
    await openList(page);
    const card = page.getByTestId("depth-rule-card");
    const field = card.getByLabel(DEEP_KITCHEN_LABEL);
    const held = await field.inputValue();
    const writes = collectWrites(page);

    await field.fill(String(Number(held) + 1));
    await card
      .getByRole("button", { name: romanian("priceDashboard.common.cancel") })
      .click();

    await expect(field).toHaveValue(held);
    await expect(card).toHaveAttribute("data-pending", "false");
    expect(writes).toEqual([]);
  });

  test("the bulk dialog opens on the % field, previews the counts the route writes, and the rows then pending match", async ({
    page,
  }) => {
    await openList(page);
    await page
      .getByRole("button", {
        name: romanian("priceDashboard.cabinets.bulkAction"),
      })
      .click();
    const dialog = page.getByRole("dialog");
    const percent = dialog.getByLabel(
      romanian("priceDashboard.bulk.changeLabel"),
    );
    await expect(dialog).toBeVisible();
    await expect(percent, "focus starts on the percentage").toBeFocused();
    const confirm = dialog.getByRole("button", {
      name: romanian("priceDashboard.common.addToPending"),
    });
    await expect(
      confirm,
      "nothing to confirm before a percentage is typed",
    ).toBeDisabled();
    await shootForReview(page, `${label}-d2d-open`);

    await percent.fill("0");
    await expect(
      dialog.getByText(romanian("priceDashboard.bulk.errors.zero")),
    ).toBeVisible();
    await expect(confirm).toBeDisabled();
    await percent.fill("500");
    await expect(dialog.getByRole("alert")).toBeVisible();
    await expect(confirm).toBeDisabled();

    await percent.fill(BULK_PERCENT);
    const preview = previewOf(dialog);
    await expect(preview).toBeVisible();
    const { cabinetCount, priceCount } = countsOf(await preview.innerText());
    expect(cabinetCount, "the preview counts cabinets").toBeGreaterThan(0);
    expect(
      priceCount,
      "a cabinet has at least one price",
    ).toBeGreaterThanOrEqual(cabinetCount);
    await shootForReview(page, `${label}-d2d-preview`);

    const written = page.waitForResponse(isBulkWrite);
    await confirm.click();
    expect((await written).status()).toBe(OK);
    await expect(dialog).toHaveCount(0);

    const baseGroup = page.getByTestId("cabinet-group-base");
    await expect(
      baseGroup.locator('[data-testid="cabinet-row"][data-modified="true"]'),
      "the base rows now pending are the cabinets the preview counted",
    ).toHaveCount(cabinetCount);
    await expect(
      baseGroup.getByText(
        romanian("priceDashboard.cabinets.groupPending", {
          count: cabinetCount,
        }),
      ),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="cabinet-row"][data-modified="true"]'),
      "no other group changed",
    ).toHaveCount(cabinetCount);
    await expectPendingCount(page, priceCount);
    await shootForReview(page, `${label}-d2b-after-bulk`);

    await page.reload();
    await expect(
      page.locator('[data-testid="cabinet-row"][data-modified="true"]'),
    ).toHaveCount(cabinetCount);
    await expectPendingCount(page, priceCount);
  });

  test("the bulk dialog by ticked cabinets: no tick refuses, each tick is one cabinet, and Cancel writes nothing", async ({
    page,
  }) => {
    await openList(page);
    await page
      .getByRole("button", {
        name: romanian("priceDashboard.cabinets.bulkAction"),
      })
      .click();
    const dialog = page.getByRole("dialog");
    const writes = collectWrites(page);
    await dialog
      .getByLabel(romanian("priceDashboard.bulk.scopeSelected"), {
        exact: true,
      })
      .check();
    await dialog
      .getByLabel(romanian("priceDashboard.bulk.changeLabel"))
      .fill(BULK_PERCENT);
    const confirm = dialog.getByRole("button", {
      name: romanian("priceDashboard.common.addToPending"),
    });
    await expect(dialog.getByRole("alert")).toHaveText(
      romanian("priceDashboard.bulk.errors.noCabinets"),
    );
    await expect(confirm).toBeDisabled();
    await shootForReview(page, `${label}-d2d-selection-none`);

    await dialog.getByRole("checkbox").first().check();
    expect(countsOf(await previewOf(dialog).innerText()).cabinetCount).toBe(1);
    await shootForReview(page, `${label}-d2d-selection-one`);
    await dialog
      .getByRole("button", { name: romanian("priceDashboard.common.cancel") })
      .click();

    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: romanian("priceDashboard.cabinets.bulkAction"),
      }),
      "focus returns to the button that opened the dialog",
    ).toBeFocused();
    expect(writes).toEqual([]);
    await expect(page.getByTestId("staff-pending-prices")).toHaveCount(0);
  });

  test("the page never scrolls sideways, whatever is open", async ({
    page,
  }) => {
    await openList(page);
    await expectNoSidewaysScroll(page, "the list");
    if (!isPhone) {
      const row = await editableRow(page);
      await priceButton(row).click();
      await priceField(row).fill("15");
      await expectNoSidewaysScroll(page, "an invalid price open");
      await priceField(row).press("Escape");
    }
    await page
      .getByTestId("depth-rule-card")
      .getByLabel(DEEP_KITCHEN_LABEL)
      .fill(TOO_BIG_DEPTH_PERCENT);
    await expectNoSidewaysScroll(page, "the depth card in error");
    await page
      .getByRole("button", {
        name: romanian("priceDashboard.cabinets.bulkAction"),
      })
      .click();
    await page
      .getByRole("dialog")
      .getByLabel(romanian("priceDashboard.bulk.changeLabel"))
      .fill(BULK_PERCENT);
    await expectNoSidewaysScroll(page, "the bulk dialog with a preview");
  });

  if (isPhone) {
    test("every control of the list and the dialog is at least 44 px", async ({
      page,
    }) => {
      const list = "[data-testid=cabinet-list]";
      await openList(page);
      await expectTargetsLargeEnough(page, list, "the list at rest");
      await page
        .getByTestId("depth-rule-card")
        .getByLabel(DEEP_KITCHEN_LABEL)
        .fill("1");
      await expectTargetsLargeEnough(page, list, "the depth card edited");
      await page
        .getByRole("button", {
          name: romanian("priceDashboard.cabinets.bulkAction"),
        })
        .click();
      const dialog = page.getByRole("dialog");
      await expectTargetsLargeEnough(page, "[role=dialog]", "the bulk dialog");
      await dialog
        .getByLabel(romanian("priceDashboard.bulk.scopeSelected"), {
          exact: true,
        })
        .check();
      await expectTargetsLargeEnough(
        page,
        "[role=dialog]",
        "the bulk dialog by ticked cabinets",
      );
    });
  }
}

const SETTLE_MS = 500;
const PHONE_HAS_NO_PRICE_BUTTON =
  "below 900 px the price is plain text and is changed on the cabinet's own page";
const DEEP_KITCHEN_LABEL = romanian("priceDashboard.rule.deepKitchenLabel", {
  depthMm: DEEP_CABINET_DEPTH_MM,
});

async function openList(page: Page): Promise<void> {
  await page.goto(CABINETS_PATH);
  await expect(page.getByTestId("cabinet-list")).toBeVisible();
  await expect(page.getByTestId("depth-rule-card")).toBeVisible();
}

/**
 * The first priced row of the base group (it starts open; the corner group starts closed), found once and then held
 * by its rule id: while its field is open the row has no price button, so a locator built on the button would lose it.
 */
async function editableRow(page: Page): Promise<Locator> {
  const first = page
    .getByTestId("cabinet-group-base")
    .getByTestId("cabinet-row")
    .filter({ has: page.getByRole("button", { name: EDIT_PRICE_NAME }) })
    .first();
  return page.locator(`[data-rule-id="${await ruleIdOf(first)}"]`);
}

const EDIT_PRICE_NAME = romanian("priceDashboard.cabinets.editPriceAria", {
  name: "",
}).trim();

function priceButton(row: Locator): Locator {
  return row.getByRole("button", { name: EDIT_PRICE_NAME });
}

function priceField(row: Locator): Locator {
  return row.getByRole("textbox");
}

function saveButton(card: Locator): Locator {
  return card.getByRole("button", {
    name: romanian("priceDashboard.common.save"),
    exact: true,
  });
}

async function ruleIdOf(row: Locator): Promise<string> {
  const ruleId = await row.getAttribute("data-rule-id");
  expect(ruleId, "a row names its rule").not.toBeNull();
  return ruleId ?? "";
}

/** Opens the row's field and answers the figure it holds, as the field shows it (plain digits). */
async function openedValueOf(row: Locator): Promise<string> {
  await priceButton(row).click();
  return priceField(row).inputValue();
}

/** Opens the field, types the held price plus ten lei and presses Enter; waits for the route's answer. */
async function saveNextPrice(page: Page, row: Locator): Promise<void> {
  const held = await openedValueOf(row);
  await priceField(row).fill(plusTenLei(held));
  const saved = page.waitForResponse(isDraftWrite);
  await priceField(row).press("Enter");
  expect((await saved).status()).toBe(OK);
  await expect(priceField(row)).toHaveCount(0);
}

function plusTenLei(held: string): string {
  return String(Number(held.replace(",", ".")) + TEN_LEI);
}

function normalised(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** "1 250 lei" is "1 250": the figure without its unit, as the basis line writes the active price. */
function amountOf(figure: string): string {
  return figure.replace(/ lei$/, "");
}

async function activeDepthPercent(card: Locator): Promise<number> {
  const describedBy =
    (await card
      .getByLabel(DEEP_KITCHEN_LABEL)
      .getAttribute("aria-describedby")) ?? "";
  const hint = await card
    .locator(`[id="${describedBy.split(" ")[0] ?? ""}"]`)
    .innerText();
  return Number(/\d+/.exec(hint)?.[0]);
}

/** The two figures the preview's first sentence states, in its order: cabinets, then prices. */
function countsOf(text: string): { cabinetCount: number; priceCount: number } {
  const [firstSentence = ""] = normalised(text).split(". ");
  const figures = firstSentence.match(/\d+/g) ?? [];
  expect(figures, `a preview that states its counts: "${text}"`).toHaveLength(
    2,
  );
  return { cabinetCount: Number(figures[0]), priceCount: Number(figures[1]) };
}

function previewOf(dialog: Locator): Locator {
  return dialog
    .getByText(romanian("priceDashboard.bulk.previewTitle"))
    .locator("..");
}

/** The header's "N prețuri de publicat" link: absent while nothing is pending. */
async function expectPendingCount(page: Page, count: number): Promise<void> {
  const chip = page.getByTestId("staff-pending-prices");
  await expect(chip).toBeVisible();
  await expect(chip).toContainText(
    romanian("priceDashboard.nav.pendingChip", { count }),
  );
}

function isDraftWrite(response: {
  url(): string;
  request(): { method(): string };
}): boolean {
  return (
    new URL(response.url()).pathname === DRAFT_ROUTE &&
    response.request().method() !== "GET"
  );
}

function isBulkWrite(response: {
  url(): string;
  request(): { method(): string };
}): boolean {
  return (
    new URL(response.url()).pathname === "/api/staff/prices/bulk" &&
    response.request().method() === "POST"
  );
}

/** Every write the page makes to the dashboard's routes from now on. */
function collectWrites(page: Page): string[] {
  const writes: string[] = [];
  page.on("request", (request) => {
    const { pathname } = new URL(request.url());
    const isWrite = request.method() !== "GET" && request.method() !== "HEAD";
    if (isWrite && pathname.startsWith(STATE_ROUTE)) {
      writes.push(`${request.method()} ${pathname}`);
    }
  });
  return writes;
}
