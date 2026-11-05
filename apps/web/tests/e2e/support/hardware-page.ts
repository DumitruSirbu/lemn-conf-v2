import { SAMPLE_PRICE_BOOK } from "@lemnaria/configurator-domain";
import {
  expect,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";

import { expectHydrated } from "./cabinet-detail-page";
import { SERVER_IS_PRODUCTION_BUILD, type Words } from "./publish-page";
import { STATE_ROUTE } from "./price-dashboard-session";
import { signIn, type SignedInAdministrator } from "./staff-world";

// How the hardware screens at /staff/catalog/hardware (the list, one class, a new class) are read in a browser: where they
// are and the names of their parts. The assertions stay in the specs (docs/best-practices/browser-and-visual-qa.md).
//
// WHAT EACH SERVER GIVES THESE PAGES (read from the source, then probed in a browser):
//  - The classes and the draft come from the dashboard's state, which the e2e server holds in its fake price book under
//    BOTH `next dev` and `next start`, so the list, the class page, the rate Save and a reload are the same under both.
//  - What differs is the lifecycle. A production build (CI) hands the page no saved defaults and a lifecycle
//    client that asks the server, so a switch-on is written to it, a switch-off is drawn off until the defaults can be
//    read, and a count is the server's; every deletion of
//    a class the book states is drawn off with its reason. `next dev` hands it the sample defaults, the sample counts
//    (Standard 9, Hettich 14, Blum 0) and an in-memory client, so the dialogs can be driven; nothing it does reaches the
//    server, and each page starts from its own copy.
//  - Creating a class goes to its own route under both servers, and the draft keeps it until a spec discards it.

export const HARDWARE_PATH = "/ro/staff/catalog/hardware";
export const RUSSIAN_HARDWARE_PATH = "/ru/staff/catalog/hardware";
export const NEW_CLASS_PATH = `${HARDWARE_PATH}/new`;

export const STANDARD = "hardware.standard";
export const HETTICH = "hardware.soft-close";
export const BLUM = "hardware.premium";

export const RATE_FIELDS = [
  "perHingeMinor",
  "perDrawerMinor",
  "perPushToOpenMinor",
  "perLiftMinor",
  "perPushRunnerMinor",
] as const;
export type RateField = (typeof RATE_FIELDS)[number];

/** The words that name a rate's field on the class page, and its column on the list. */
export const RATE_LABEL_KEY = {
  perHingeMinor: "priceDashboard.hardware.priceHinge",
  perDrawerMinor: "priceDashboard.hardware.priceSlide",
  perPushToOpenMinor: "priceDashboard.hardware.pricePush",
  perLiftMinor: "priceDashboard.hardware.priceLift",
  perPushRunnerMinor: "priceDashboard.hardware.pricePushRunner",
} as const satisfies Record<RateField, string>;
export const RATE_COLUMN_KEY = {
  perHingeMinor: "priceDashboard.hardware.columnHinge",
  perDrawerMinor: "priceDashboard.hardware.columnSlide",
  perPushToOpenMinor: "priceDashboard.hardware.columnPush",
  perLiftMinor: "priceDashboard.hardware.columnLift",
  perPushRunnerMinor: "priceDashboard.hardware.columnPushRunner",
} as const satisfies Record<RateField, string>;

export const DEV_ONLY_REASON =
  "The sample defaults, the sample counts of saved kitchens and the in-memory switch exist only outside a production " +
  "build, so the dialogs can be driven only on `next dev`; a production build asks the server instead, which the CI tests " +
  "of these files hold. Run it without CI set.";
export const CI_ONLY_REASON =
  "The off controls of a production build are drawn only when `CI` is set (`playwright.config.ts` starts `next start` " +
  "then); `next dev` draws the sample's working controls instead. Run it with: CI=1";
export { SERVER_IS_PRODUCTION_BUILD };

/** The active rates of the sample book, in bani, for a class. */
export function activeRatesOf(tierId: string): Record<RateField, number> {
  const tier = SAMPLE_PRICE_BOOK.hardware.tiers.find(
    (held) => held.tierId === tierId,
  );
  if (tier === undefined) throw new Error(`no class ${tierId} in the sample`);
  return {
    perHingeMinor: tier.perHingeMinor,
    perDrawerMinor: tier.perDrawerMinor,
    perPushToOpenMinor: tier.perPushToOpenMinor,
    perLiftMinor: tier.perLiftMinor,
    perPushRunnerMinor: tier.perPushRunnerMinor,
  };
}

export function classPath(tierId: string, locale: "ro" | "ru" = "ro"): string {
  return `/${locale}/staff/catalog/hardware/${encodeURIComponent(tierId)}`;
}

export function listPath(locale: "ro" | "ru"): string {
  return locale === "ro" ? HARDWARE_PATH : RUSSIAN_HARDWARE_PATH;
}

export async function openHardwareList(
  page: Page,
  locale: "ro" | "ru" = "ro",
): Promise<void> {
  await page.goto(listPath(locale));
  await expectHydrated(page, "hardware-list");
}

export async function openClass(
  page: Page,
  tierId: string,
  locale: "ro" | "ru" = "ro",
): Promise<void> {
  await page.goto(classPath(tierId, locale));
  await expectHydrated(page, "hardware-edit");
}

export async function openNewClass(
  page: Page,
  locale: "ro" | "ru" = "ro",
): Promise<void> {
  await page.goto(`/${locale}/staff/catalog/hardware/new`);
  await expectHydrated(page, "hardware-create");
}

/**
 * Compiles the three routes of the hardware screens before the first test, so `next dev`'s first compile of each is not
 * paid inside a test's own timeout. A read is all it does: no write, no draft change.
 */
export async function warmHardwareRoutes(
  browser: Browser,
  administrator: SignedInAdministrator["administrator"],
): Promise<void> {
  const port = process.env.E2E_PORT ?? "4320";
  const context = await browser.newContext({
    baseURL: `http://localhost:${port}`,
  });
  try {
    await signIn(context, administrator);
    const page = await context.newPage();
    for (const path of [
      HARDWARE_PATH,
      classPath(HETTICH),
      NEW_CLASS_PATH,
      RUSSIAN_HARDWARE_PATH,
    ]) {
      await page.goto(path);
    }
  } finally {
    await context.close();
  }
}

export function listOf(page: Page): Locator {
  return page.getByTestId("hardware-list");
}

export function rowsOf(page: Page): Locator {
  return page.getByTestId("hardware-row");
}

export function rowOf(page: Page, tierId: string): Locator {
  return page.locator(`[data-testid="hardware-row"][data-tier-id="${tierId}"]`);
}

export function rateCellOf(row: Locator, field: RateField): Locator {
  return row.locator(`[data-testid="hardware-rate"][data-field="${field}"]`);
}

export function menuButtonOf(row: Locator): Locator {
  return row.locator("button[aria-controls]");
}

export function menuOf(row: Locator): Locator {
  return row.locator("ul[id][aria-label]");
}

/** The entry of an open menu: its button, by the word it carries. */
export function menuEntryOf(
  row: Locator,
  words: Words,
  which: "switch-off" | "switch-on" | "delete",
): Locator {
  const label = {
    "switch-off": words("priceDashboard.common.deactivate"),
    "switch-on": words("priceDashboard.common.activate"),
    delete: words("priceDashboard.common.delete"),
  }[which];
  return menuOf(row).getByRole("button", { name: label, exact: true });
}

export function chipsOf(row: Locator): Locator {
  return row.getByTestId("hardware-chip");
}

export function editPageOf(page: Page): Locator {
  return page.getByTestId("hardware-edit");
}

/** The field a rate is typed into, on a class's page. */
export function rateField(page: Page, words: Words, field: RateField): Locator {
  return editPageOf(page).getByLabel(words(RATE_LABEL_KEY[field]), {
    exact: true,
  });
}

export function saveRatesButton(page: Page, words: Words): Locator {
  return editPageOf(page).getByRole("button", {
    name: words("priceDashboard.common.save"),
    exact: true,
  });
}

export function cancelRatesButton(page: Page, words: Words): Locator {
  return editPageOf(page).getByRole("button", {
    name: words("priceDashboard.common.cancel"),
    exact: true,
  });
}

/** The class page's switch: "Activă în configurator". */
export function activeSwitch(page: Page, words: Words): Locator {
  return editPageOf(page).getByRole("switch", {
    name: new RegExp(
      `^${escaped(words("priceDashboard.hardware.activeLabel"))}`,
    ),
  });
}

export function deleteClassButton(page: Page, words: Words): Locator {
  return editPageOf(page).getByRole("button", {
    name: words("priceDashboard.hardware.deleteAction"),
    exact: true,
  });
}

/** The dialog a switch or a deletion opens: the page's only alertdialog. */
export function itemDialogOf(page: Page): Locator {
  return page.getByRole("alertdialog");
}

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** What a price cell says, as bani: "17,60 lei" is 1760 and "1 500 lei" is 150000. */
export function baniOf(text: string): number {
  const digits = text.replace(/[^\d,]/g, "").replace(",", ".");
  expect(digits, `an amount in "${text}"`).not.toBe("");
  return Math.round(Number(digits) * 100);
}

/** The value a rate cell of a list row draws: its first figure, not the "activ …" line that may follow. */
export async function listedRate(
  row: Locator,
  field: RateField,
): Promise<number> {
  const figure = rateCellOf(row, field).locator("span").nth(1);
  return baniOf(await figure.innerText());
}

/** What the server holds of the draft, through the route the dashboard itself reads. */
export async function draftChanges(page: Page): Promise<
  readonly {
    address: { kind: string; tierId?: string; field?: string };
    value?: unknown;
  }[]
> {
  const answer = await page.context().request.get(STATE_ROUTE);
  expect(answer.status(), "the dashboard's state").toBe(200);
  const { draft } = (await answer.json()) as {
    draft: {
      changes: readonly {
        address: { kind: string; tierId?: string; field?: string };
        value?: unknown;
      }[];
    };
  };
  return draft.changes;
}

/** Every request the page makes to the dashboard's routes from now on, reads and writes, as "METHOD /path". */
export function collectDashboardRequests(page: Page): string[] {
  const seen: string[] = [];
  page.on("request", (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith(STATE_ROUTE)) {
      seen.push(`${request.method()} ${pathname}`);
    }
  });
  return seen;
}

/** The element that has focus, named for a failure message. */
export function focusedName(page: Page): Promise<string> {
  return page.evaluate(() => {
    const focused = document.activeElement;
    if (focused === null || focused === document.body) return "body";
    const label = focused.getAttribute("aria-label") ?? "";
    return `${focused.tagName.toLowerCase()} ${label || focused.textContent.trim().slice(0, 40)}`;
  });
}

/** The rates a list row draws, in bani, for every field. */
export async function listedRatesOf(
  row: Locator,
): Promise<Record<RateField, number>> {
  const entries = await Promise.all(
    RATE_FIELDS.map(
      async (field) => [field, await listedRate(row, field)] as const,
    ),
  );
  return Object.fromEntries(entries) as Record<RateField, number>;
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Where an element is drawn; an element that is not drawn is a failure of the test, not a zero box. */
export async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("the element is not drawn");
  return box;
}

/** The table's column titles, which a card layout does not draw. */
export function columnTitlesOf(page: Page): Locator {
  return page.locator('[data-testid="hardware-list"] > [aria-hidden="true"]');
}

// Negative claims about wording: what a production build's page, or a switch's dialog, must not say. No catalogue leaf can
// supply a word the page must not hold, so they are written out here, once.
/* eslint-disable no-restricted-syntax -- a negative claim about the wording: no catalogue leaf can supply a word that must be absent. */
/** Any sentence that counts or names the saved kitchens that use a class. */
export const SAYS_SAVED_KITCHENS_USE_IT =
  /bucătării salvate|bucătărie salvată|folosesc|folosește/;
/** Any promise that a change waits for publication. */
export const PROMISES_PUBLICATION = /publici|publicare/i;
/* eslint-enable no-restricted-syntax */

/** The elements of the list, outside the table's titles, whose text is wider than their own box, named. Another item
 *  screen's list is named by its test id. */
export function overflowingBoxes(
  page: Page,
  listTestId = "hardware-list",
): Promise<string[]> {
  return page.evaluate((testId) => {
    const found: string[] = [];
    const scope = document.querySelector(`[data-testid="${testId}"]`);
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
  }, listTestId);
}
