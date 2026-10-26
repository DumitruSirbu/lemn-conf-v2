import type { CatalogPage } from "@/staff/staff-paths";

// Which pages of the price dashboard the staff navigation may link to.

/**
 * The pages that have a screen. A page joins this list when its directory under `app/[locale]/staff/catalog` exists, never
 * before: the navigation must not link to a page that answers 404 (the same rule as `BUILT_STAFF_PAGES`). Each wave of
 * lane U adds its own.
 */
export const BUILT_CATALOG_PAGES: readonly CatalogPage[] = ["cabinets"];

/** The catalog pages the navigation lists for a person: the built ones, and only to someone who holds `price.edit`. */
export function catalogPagesOpenTo({
  canEditPrices,
  builtPages = BUILT_CATALOG_PAGES,
}: {
  readonly canEditPrices: boolean;
  readonly builtPages?: readonly CatalogPage[];
}): readonly CatalogPage[] {
  return canEditPrices ? builtPages : [];
}
