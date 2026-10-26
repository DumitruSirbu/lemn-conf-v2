import { isDesignId } from "@lemnaria/configurator-domain";

// The addresses of the staff area, in one leaf module. The staff frame and the account control both write them, and the
// frame imports the control, so a path that lived in either would be imported back by the other: a cycle. This module
// imports neither.

/** The staff pages that have a screen to name in the navigation. */
export type StaffPage = "kitchens" | "audit";

/**
 * The pages of the price dashboard, which live under `/staff/catalog/`. A separate closed list and not more members of
 * `StaffPage`: the server's gate keys its capability and its navigation on `StaffPage` and a page of this family is judged
 * by `price.edit` instead (M10 plan, lane U).
 */
export const CATALOG_PAGES = [
  "cabinets",
  "hardware",
  "materials",
  "accessories",
  "defaults",
  "publish",
] as const;
export type CatalogPage = (typeof CATALOG_PAGES)[number];

/** Every page the staff frame can show as the current one. */
export type StaffAreaPage = StaffPage | CatalogPage;

const CATALOG_FAMILY_SEGMENT = "catalog";

export function isCatalogPage(page: StaffAreaPage): page is CatalogPage {
  return (CATALOG_PAGES as readonly string[]).includes(page);
}

/**
 * The address of a staff page, or of the one kitchen the "kitchens" page shows. A kitchen's id is part of the address only if
 * it has the shape of a design id and the page is the kitchens page, so nothing but a design id is ever written into a link,
 * whatever the caller was handed.
 */
export function staffPathOf(
  locale: string,
  page: StaffAreaPage,
  kitchenId?: string,
): string {
  const pagePath = isCatalogPage(page)
    ? `/${locale}/staff/${CATALOG_FAMILY_SEGMENT}/${page}`
    : `/${locale}/staff/${page}`;
  const isKitchen =
    page === "kitchens" && kitchenId !== undefined && isDesignId(kitchenId);
  return isKitchen ? `${pagePath}/${kitchenId}` : pagePath;
}
