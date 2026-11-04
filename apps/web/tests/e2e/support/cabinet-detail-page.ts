import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, type Locator, type Page } from "@playwright/test";
import { createTranslator, type Messages } from "next-intl";

import { DRAFT_ROUTE, STATE_ROUTE } from "./price-dashboard-session";
import { romanian } from "./staff-world";

// How the cabinet's own page at /staff/catalog/cabinets/<ruleId> is read in a browser: where it is, and the names of its
// parts. The assertions stay in the specs (docs/best-practices/browser-and-visual-qa.md).

const russianMessages = JSON.parse(
  readFileSync(
    new URL("../../../src/messages/ru.json", import.meta.url),
    "utf8",
  ),
) as Messages;
const russianTranslator = createTranslator({
  locale: "ru",
  messages: russianMessages,
});

/** The words of the Russian screens, from the file the app reads. */
export function russian(
  key: string,
  values?: Readonly<Record<string, string | number>>,
): string {
  const translate = russianTranslator as unknown as (
    key: string,
    values?: Readonly<Record<string, string | number>>,
  ) => string;
  return translate(key, values);
}

export const CABINETS_PATH = "/ro/staff/catalog/cabinets";
export const RUSSIAN_CABINETS_PATH = "/ru/staff/catalog/cabinets";

/** The rules of the sample book, by what each is the example of. */
export const BASE_CABINET = "cabinet.base-cabinet";
export const WALL_CABINET = "cabinet.wall-cabinet";
export const CORNER_900 = "cabinet.base-corner-x-900";
export const TWO_SIZES_CARGO = "cabinet.base-bottle-cargo";
export const HOOD = "cabinet.hood";
export const FREE_FRIDGE = "cabinet.fridge-free";

export const SETTLE_MS = 500;
const TEN_LEI = 10;

/** The catalogue's name for a body, as the list and the page title say it. */
export function cabinetName(buildId: string): string {
  return romanian(`catalog.entries.${buildId}`);
}

/** The label of one of the dimensions the page reads out. */
export function dimensionLabel(
  key:
    | "defaultWidth"
    | "minWidth"
    | "maxWidth"
    | "widthStep"
    | "availableWidths"
    | "bodyHeight"
    | "maxHeight",
): string {
  return romanian(`priceDashboard.cabinet.${key}`);
}

export function depthLabel(kitchenDepthMm: number): string {
  return romanian("priceDashboard.cabinet.depthInKitchen", { kitchenDepthMm });
}

/** The sentence's first clause: "600 mm costa 3 960 lei." */
export function baseCostSentence(widthMm: number, amount: string): string {
  return romanian("priceDashboard.cabinet.summaryBase", { widthMm, amount });
}

/** The sentence's clause about the two steps. */
export function stepsSentence(plusAmount: string, minusAmount: string): string {
  return romanian("priceDashboard.cabinet.summarySteps", {
    stepMm: 50,
    plusAmount,
    minusAmount,
  });
}

export function cabinetPath(ruleId: string): string {
  return `${CABINETS_PATH}/${encodeURIComponent(ruleId)}`;
}

export async function openCabinet(page: Page, ruleId: string): Promise<void> {
  await page.goto(cabinetPath(ruleId));
  await expectHydrated(page, "cabinet-detail");
}

export async function openList(page: Page): Promise<void> {
  await page.goto(CABINETS_PATH);
  await expectHydrated(page, "cabinet-list");
}

/**
 * The element is drawn and React has taken it over. A screenshot taken before that puts a style on the inputs that the
 * server's markup does not have, and React reports the mismatch as a console error.
 */
export async function expectHydrated(
  page: Page,
  testId: string,
): Promise<void> {
  const element = page.getByTestId(testId);
  await expect(element).toBeVisible();
  await expect
    .poll(
      () =>
        element.evaluate((node) =>
          Object.keys(node).some((key) => key.startsWith("__reactFiber$")),
        ),
      { message: `React has hydrated ${testId}` },
    )
    .toBe(true);
}

export function detailOf(page: Page): Locator {
  return page.getByTestId("cabinet-detail");
}

/** The field a price is typed into, by its label. */
export function priceFieldOf(page: Page, label: string): Locator {
  return detailOf(page).getByLabel(label, { exact: true });
}

export function anchorLabel(widthMm: number): string {
  return romanian("priceDashboard.cabinet.fieldAnchor", { widthMm });
}

export const PLUS_LABEL = romanian("priceDashboard.cabinet.fieldPlus", {
  stepMm: 50,
});
export const MINUS_LABEL = romanian("priceDashboard.cabinet.fieldMinus", {
  stepMm: 50,
});
export const HEIGHT_LABEL = romanian("priceDashboard.cabinet.fieldHeightStep", {
  stepMm: 50,
});

export function doorLabel(atMm: number): string {
  return romanian("priceDashboard.cabinet.fieldDoor", { atMm });
}

/** Every field a price is typed into, in the order the page lists them. */
export function allPriceFields(page: Page): Locator {
  return detailOf(page).locator("input[type=text]");
}

export function saveButton(page: Page): Locator {
  return detailOf(page).getByRole("button", {
    name: romanian("priceDashboard.common.save"),
    exact: true,
  });
}

export function cancelButton(page: Page): Locator {
  return detailOf(page).getByRole("button", {
    name: romanian("priceDashboard.common.cancel"),
    exact: true,
  });
}

export function savedNotice(page: Page): Locator {
  return detailOf(page).getByRole("status");
}

export function sentenceOf(page: Page): Locator {
  return page.getByTestId("cabinet-price-sentence");
}

/** The sentence under a field that says why it is refused: the one the field itself names in `aria-describedby`. */
export async function refusalOf(field: Locator): Promise<Locator> {
  const describedBy = (await field.getAttribute("aria-describedby")) ?? "";
  const ids = describedBy.split(" ").filter((id) => id !== "");
  const page = field.page();
  return page
    .locator(ids.map((id) => `[id="${id}"][role="alert"]`).join(", ") || "none")
    .first();
}

export function depthSwitch(page: Page): Locator {
  return detailOf(page).getByRole("switch", {
    name: new RegExp(
      `^${romanian("priceDashboard.cabinet.depthToggle", { shallowMm: 600, deepMm: 700 })}`,
    ),
  });
}

export function hardwareSwitch(page: Page): Locator {
  return detailOf(page).getByRole("switch", {
    name: new RegExp(`^${romanian("priceDashboard.cabinet.withHardware")}`),
  });
}

export function previewTable(page: Page): Locator {
  return page.getByTestId("cabinet-preview");
}

/** The row of the table for a width. */
export function previewRow(page: Page, widthMm: number): Locator {
  return previewTable(page)
    .getByRole("row")
    .filter({
      has: page.getByRole("rowheader", {
        name: romanian("priceDashboard.cabinet.previewWidth", { widthMm }),
        exact: true,
      }),
    });
}

/** What the "Activ" or "Nou" cell of a column of a row says, as whole lei. */
export async function leiOfCell(
  row: Locator,
  kind: "active" | "next",
  column = 0,
): Promise<number> {
  const text = await row
    .locator(`td[data-role="${kind}"]`)
    .nth(column)
    .innerText();
  return leiOf(text);
}

/** "3 960 lei" is 3960. */
export function leiOf(text: string): number {
  const digits = text.replace(/lei/, "").replace(/[^\d]/g, "");
  expect(digits, `an amount in "${text}"`).not.toBe("");
  return Number(digits);
}

export function plusTenLei(held: string): string {
  return String(Number(held.replace(",", ".")) + TEN_LEI);
}

export function normalised(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** The sentence with its spaces made plain, so "3 960 lei" is spelt the way a test writes it. */
export async function sentenceText(page: Page): Promise<string> {
  return normalised(await sentenceOf(page).innerText());
}

/** Every write the page makes to the dashboard's routes from now on. */
export function collectWrites(page: Page): string[] {
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

export function isDraftWrite(response: {
  url(): string;
  request(): { method(): string };
}): boolean {
  return (
    new URL(response.url()).pathname === DRAFT_ROUTE &&
    response.request().method() !== "GET"
  );
}

/** What the server holds, read through the route the dashboard itself uses. */
export async function serverState(page: Page): Promise<{
  active: unknown;
  draft: { draftRevision: string; changes: readonly unknown[] };
}> {
  const answer = await page.context().request.get(STATE_ROUTE);
  expect(answer.status(), "the dashboard's state").toBe(200);
  return (await answer.json()) as {
    active: unknown;
    draft: { draftRevision: string; changes: readonly unknown[] };
  };
}

/** The header's "N prețuri de publicat" link: absent while nothing is pending. */
export async function expectPendingCount(
  page: Page,
  count: number,
): Promise<void> {
  const chip = page.getByTestId("staff-pending-prices");
  await expect(chip).toBeVisible();
  await expect(chip).toContainText(
    romanian("priceDashboard.nav.pendingChip", { count }),
  );
}

/** What the screen shows right now, for a reviewer, where `shootForReview`'s whole page would hide a pinned bar. Written
 *  only when `STAFF_E2E_SHOTS_DIR` names a directory outside the repository. */
export async function shootViewport(page: Page, name: string): Promise<void> {
  const directory = process.env.STAFF_E2E_SHOTS_DIR;
  if (directory === undefined || directory === "") return;
  mkdirSync(directory, { recursive: true });
  await page.screenshot({ path: join(directory, `${name}.png`) });
}

/** The one console error a page that answers 404 gives, which the browser writes itself. */
export function isBrowsersNoteOfA404(consoleError: string): boolean {
  return consoleError.startsWith(
    "console: Failed to load resource: the server responded with a status of 404",
  );
}
