import type { CatalogPage } from "@/staff/staff-paths";

/**
 * The catalog pages that have a screen. A page joins this list when its directory under `app/[locale]/staff/catalog`
 * exists, never before: the navigation must not link to a page that answers 404.
 */
export const BUILT_CATALOG_PAGES: readonly CatalogPage[] = ["cabinets"];
