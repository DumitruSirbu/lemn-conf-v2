import "server-only";

import {
  readStaffPage,
  type StaffPageRead,
} from "@/lib/server/staff/staff-page";

// The gate of every page of the price dashboard: the staff gate, asked for a catalog page, whose capability is
// `price.edit` (only administrators hold it) and whose navigation lists the catalog pages beside the staff ones. A visitor,
// an expired session and an unreadable store leave as they do from any staff page; an operator is shown the 403 inside the
// staff frame; any other account, an unconfirmed staff address included, is shown the account area's.

export type CatalogPageRead = StaffPageRead;

export function readCatalogPage({
  locale,
}: {
  locale: string;
}): Promise<CatalogPageRead> {
  return readStaffPage({ locale, page: "cabinets" });
}
