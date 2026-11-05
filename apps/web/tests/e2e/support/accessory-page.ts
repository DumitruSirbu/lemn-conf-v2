import { SAMPLE_PRICE_BOOK } from "@lemnaria/configurator-domain";
import { type Browser, type Locator, type Page } from "@playwright/test";

import { expectHydrated } from "./cabinet-detail-page";
import { type Words } from "./publish-page";
import { signIn, type SignedInAdministrator } from "./staff-world";

// How the accessory screens at /staff/catalog/accessories (the list, one accessory, a new accessory) are read in a browser:
// where they are and the names of their parts. The assertions stay in the specs
// (docs/best-practices/browser-and-visual-qa.md).
//
// WHAT EACH SERVER GIVES THESE PAGES (read from the source): - The accessories and the draft come from the dashboard's
// state, which the e2e server holds in its fake price book under BOTH `next dev` and `next start`, so the list, the
// accessory page, the price Save and a reload are the same under both. The sample book carries the two built-in accessories
// and no linked one. - What differs is the lifecycle. A production build (CI) hands the page no saved defaults and a
// lifecycle client that asks the server, so a switch-on is written to it, a switch-off of an accessory the book states is
// drawn off with its reason until the defaults can be read, and a count is the server's. `next dev` hands it the sample
// defaults, the sample counts (cover 12, rack 31) and an in-memory client, so the dialogs can be driven; nothing it does
// reaches the server, and each page starts from its own copy. - Creating an accessory goes to its own route under both
// servers; a spec that creates one empties the draft after it, so there is no linked accessory to open unless a test made it.

export const ACCESSORIES_PATH = "/ro/staff/catalog/accessories";
export const RUSSIAN_ACCESSORIES_PATH = "/ru/staff/catalog/accessories";
export const NEW_ACCESSORY_PATH = `${ACCESSORIES_PATH}/new`;

export const SINK_COVER = "sinkProtectiveCover";
export const DRYING_RACK = "dishDryingRack";
export const BUILT_IN_ACCESSORIES = [SINK_COVER, DRYING_RACK] as const;

/** The saved kitchens the sample says use each built-in accessory: what a dialog and a count say under `next dev`. */
export const DRYING_RACK_SAVED_KITCHENS = 31;

export const ACCESSORY_NAME_KEY = {
  [SINK_COVER]: SAMPLE_PRICE_BOOK.accessories.sinkProtectiveCover.nameKey,
  [DRYING_RACK]: SAMPLE_PRICE_BOOK.accessories.dishDryingRack.nameKey,
} as const;

/** The price per unit of a built-in accessory in the sample book's active version, in bani. */
export function activePriceOf(accessoryId: string): number {
  const rule =
    accessoryId === SINK_COVER
      ? SAMPLE_PRICE_BOOK.accessories.sinkProtectiveCover
      : SAMPLE_PRICE_BOOK.accessories.dishDryingRack;
  return rule.perUnitMinor;
}

export function accessoryPath(
  accessoryId: string,
  locale: "ro" | "ru" = "ro",
): string {
  return `/${locale}/staff/catalog/accessories/${encodeURIComponent(accessoryId)}`;
}

export function listPath(locale: "ro" | "ru"): string {
  return locale === "ro" ? ACCESSORIES_PATH : RUSSIAN_ACCESSORIES_PATH;
}

export async function openAccessoryList(
  page: Page,
  locale: "ro" | "ru" = "ro",
): Promise<void> {
  await page.goto(listPath(locale));
  await expectHydrated(page, "accessory-list");
}

export async function openAccessory(
  page: Page,
  accessoryId: string,
  locale: "ro" | "ru" = "ro",
): Promise<void> {
  await page.goto(accessoryPath(accessoryId, locale));
  await expectHydrated(page, "accessory-edit");
}

export async function openNewAccessory(
  page: Page,
  locale: "ro" | "ru" = "ro",
): Promise<void> {
  await page.goto(`/${locale}/staff/catalog/accessories/new`);
  await expectHydrated(page, "accessory-create");
}

/**
 * Compiles the routes of the accessory screens before the first test, so `next dev`'s first compile of each is not paid
 * inside a test's own timeout. A read is all it does: no write, no draft change.
 */
export async function warmAccessoryRoutes(
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
      ACCESSORIES_PATH,
      accessoryPath(DRYING_RACK),
      NEW_ACCESSORY_PATH,
      RUSSIAN_ACCESSORIES_PATH,
    ]) {
      await page.goto(path);
    }
  } finally {
    await context.close();
  }
}

export function listOf(page: Page): Locator {
  return page.getByTestId("accessory-list");
}

export function rowsOf(page: Page): Locator {
  return page.getByTestId("accessory-row");
}

export function rowOf(page: Page, accessoryId: string): Locator {
  return page.locator(
    `[data-testid="accessory-row"][data-accessory-id="${accessoryId}"]`,
  );
}

export function earningCellOf(row: Locator): Locator {
  return row.getByTestId("accessory-earning");
}

export function priceCellOf(row: Locator): Locator {
  return row.getByTestId("accessory-price");
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
  return row.getByTestId("accessory-chip");
}

export function editPageOf(page: Page): Locator {
  return page.getByTestId("accessory-edit");
}

export function createPageOf(page: Page): Locator {
  return page.getByTestId("accessory-create");
}

/** The field the price per unit is typed into, on an accessory's page. */
export function priceField(page: Page, words: Words): Locator {
  return editPageOf(page).getByLabel(
    words("priceDashboard.accessories.pricePerPiece"),
    { exact: true },
  );
}

export function savePriceButton(page: Page, words: Words): Locator {
  return editPageOf(page).getByRole("button", {
    name: words("priceDashboard.common.save"),
    exact: true,
  });
}

export function cancelPriceButton(page: Page, words: Words): Locator {
  return editPageOf(page).getByRole("button", {
    name: words("priceDashboard.common.cancel"),
    exact: true,
  });
}

/** The accessory page's switch: "Activ". */
export function activeSwitch(page: Page, words: Words): Locator {
  return editPageOf(page).getByRole("switch", {
    name: new RegExp(
      `^${escaped(words("priceDashboard.accessories.activeLabel"))}`,
    ),
  });
}

export function deleteAccessoryButton(page: Page, words: Words): Locator {
  return editPageOf(page).getByRole("button", {
    name: words("priceDashboard.accessories.deleteAction"),
    exact: true,
  });
}

export function createButton(page: Page, words: Words): Locator {
  return createPageOf(page).getByRole("button", {
    name: words("priceDashboard.accessories.createAction"),
    exact: true,
  });
}

/** The cabinet type the new accessory follows: a select, required. */
export function linkSelect(page: Page, words: Words): Locator {
  return createPageOf(page).getByLabel(
    words("priceDashboard.accessories.linkLabel"),
    { exact: true },
  );
}

/** The table's column titles, which a card layout does not draw. */
export function columnTitlesOf(page: Page): Locator {
  return page.locator('[data-testid="accessory-list"] > [aria-hidden="true"]');
}

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
