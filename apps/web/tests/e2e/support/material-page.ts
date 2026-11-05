import {
  MATERIALS,
  paletteEntriesOf,
  SAMPLE_PRICE_BOOK,
} from "@lemnaria/configurator-domain";
import {
  expect,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";

import { expectHydrated } from "./cabinet-detail-page";
import { type Words } from "./publish-page";
import { signIn, type SignedInAdministrator } from "./staff-world";

// How the materials screens at /staff/catalog/materials (the list and one material) are read in a browser: where they
// are and the names of their parts. The assertions stay in the specs (docs/best-practices/browser-and-visual-qa.md).
//
// WHAT EACH SERVER GIVES THESE PAGES (read from the source): - The materials and the draft come from the dashboard's
// state, which the e2e server holds in its fake price book under BOTH `next dev` and `next start`, so the list, the
// material page, the surcharge Save and a reload are the same under both. - What differs is the lifecycle. A production
// build (CI) hands the page no saved defaults and a lifecycle client that asks the server, so a switch-on is written to
// it, a switch-off and a deletion of a material the book states are drawn off with their reason until the defaults can
// be read, and a count is the server's. `next dev` hands it the sample defaults (PAL is the saved default), the sample counts (PAL
// 31, MDF 23, veneer 0) and an in-memory client, so the dialogs can be driven; nothing it does reaches the server, and
// each page starts from its own copy.

export const MATERIALS_PATH = "/ro/staff/catalog/materials";
export const RUSSIAN_MATERIALS_PATH = "/ru/staff/catalog/materials";

export const PAL = "material.melamine";
export const MDF = "material.painted-mdf";
export const VENEER = "material.veneer";

/** The saved kitchens the sample says use each material: what a dialog and a chip say under `next dev`. */
export const MDF_SAVED_KITCHENS = 23;

export const MATERIAL_NAME_KEY = {
  [PAL]: "priceBook.material.melamine.name",
  [MDF]: "priceBook.material.painted-mdf.name",
  [VENEER]: "priceBook.material.veneer.name",
} as const;

/** The surcharge of a material in the sample book's active version, in whole percent. */
export function activePercentOf(tierId: string): number {
  const tier = SAMPLE_PRICE_BOOK.material.tiers.find(
    (held) => held.tierId === tierId,
  );
  if (tier === undefined)
    throw new Error(`no material ${tierId} in the sample`);
  return tier.percentOfCabinets;
}

/**
 * How many colours the code declares for a material that offers a list; none for painted MDF, which offers a picker.
 */
export function listedColoursOf(tierId: string): number | undefined {
  const declared = MATERIALS.find(({ materialId }) => materialId === tierId);
  if (declared === undefined || declared.colourControl.shape === "ral-picker") {
    return undefined;
  }
  return paletteEntriesOf(declared).length;
}

export function materialPath(
  tierId: string,
  locale: "ro" | "ru" = "ro",
): string {
  return `/${locale}/staff/catalog/materials/${encodeURIComponent(tierId)}`;
}

export function listPath(locale: "ro" | "ru"): string {
  return locale === "ro" ? MATERIALS_PATH : RUSSIAN_MATERIALS_PATH;
}

export async function openMaterialList(
  page: Page,
  locale: "ro" | "ru" = "ro",
): Promise<void> {
  await page.goto(listPath(locale));
  await expectHydrated(page, "material-list");
}

export async function openMaterial(
  page: Page,
  tierId: string,
  locale: "ro" | "ru" = "ro",
): Promise<void> {
  await page.goto(materialPath(tierId, locale));
  await expectHydrated(page, "material-edit");
}

/**
 * Compiles the routes of the materials screens before the first test, so `next dev`'s first compile of each is not paid
 * inside a test's own timeout. A read is all it does: no write, no draft change.
 */
export async function warmMaterialRoutes(
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
      MATERIALS_PATH,
      materialPath(MDF),
      RUSSIAN_MATERIALS_PATH,
    ]) {
      await page.goto(path);
    }
  } finally {
    await context.close();
  }
}

export function listOf(page: Page): Locator {
  return page.getByTestId("material-list");
}

export function rowsOf(page: Page): Locator {
  return page.getByTestId("material-row");
}

export function rowOf(page: Page, tierId: string): Locator {
  return page.locator(`[data-testid="material-row"][data-tier-id="${tierId}"]`);
}

export function surchargeCellOf(row: Locator): Locator {
  return row.getByTestId("material-surcharge");
}

export function coloursCellOf(row: Locator): Locator {
  return row.getByTestId("material-colours");
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
  return row.getByTestId("material-chip");
}

export function editPageOf(page: Page): Locator {
  return page.getByTestId("material-edit");
}

/** The field the surcharge is typed into, on a material's page. */
export function surchargeField(page: Page, words: Words): Locator {
  return editPageOf(page).getByLabel(
    words("priceDashboard.materials.columnSurcharge"),
    { exact: true },
  );
}

export function saveSurchargeButton(page: Page, words: Words): Locator {
  return editPageOf(page).getByRole("button", {
    name: words("priceDashboard.common.save"),
    exact: true,
  });
}

export function cancelSurchargeButton(page: Page, words: Words): Locator {
  return editPageOf(page).getByRole("button", {
    name: words("priceDashboard.common.cancel"),
    exact: true,
  });
}

/** The material page's switch: "Activ în configurator". */
export function activeSwitch(page: Page, words: Words): Locator {
  return editPageOf(page).getByRole("switch", {
    name: new RegExp(
      `^${escaped(words("priceDashboard.materials.activeLabel"))}`,
    ),
  });
}

export function deleteMaterialButton(page: Page, words: Words): Locator {
  return editPageOf(page).getByRole("button", {
    name: words("priceDashboard.materials.deleteAction"),
    exact: true,
  });
}

export function exampleOf(page: Page): Locator {
  return page.getByTestId("material-example");
}

/** The banner of a switched-off material, which says what that does to the saved kitchens that still use it. */
export function inactiveBannerOf(page: Page): Locator {
  return page.getByTestId("material-banner");
}

/** The table's column titles, which a card layout does not draw. */
export function columnTitlesOf(page: Page): Locator {
  return page.locator('[data-testid="material-list"] > [aria-hidden="true"]');
}

/** The two figures of an example line, in bani: the cabinet in PAL, then in the material. */
export async function examplePricesOf(
  line: Locator,
): Promise<{ readonly reference: number; readonly material: number }> {
  const text = await line.innerText();
  const [before = "", after = ""] = text.split("→");
  const reference = amountIn(before);
  const material = amountIn(after);
  expect(reference, `the figure before the arrow in "${text}"`).toBeGreaterThan(
    0,
  );
  return { reference, material };
}

function amountIn(text: string): number {
  const digits = text.replace(/[^\d]/g, "");
  return digits === "" ? 0 : Number(digits) * 100;
}

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
