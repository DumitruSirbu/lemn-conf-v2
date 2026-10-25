import { isDesignId } from "@lemnaria/configurator-domain";

// The addresses of the staff area, in one leaf module. The staff frame and the account control both write them, and the
// frame imports the control, so a path that lived in either would be imported back by the other: a cycle. This module
// imports neither.

/** The staff pages that have a screen to name in the navigation. */
export type StaffPage = "kitchens" | "audit";

/**
 * The address of a staff page, or of the one kitchen the "kitchens" page shows. A kitchen's id is part of the address only if
 * it has the shape of a design id and the page is the kitchens page, so nothing but a design id is ever written into a link,
 * whatever the caller was handed.
 */
export function staffPathOf(
  locale: string,
  page: StaffPage,
  kitchenId?: string,
): string {
  const pagePath = `/${locale}/staff/${page}`;
  const isKitchen =
    page === "kitchens" && kitchenId !== undefined && isDesignId(kitchenId);
  return isKitchen ? `${pagePath}/${kitchenId}` : pagePath;
}
