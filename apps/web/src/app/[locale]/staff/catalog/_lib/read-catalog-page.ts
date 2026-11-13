import "server-only";

import {
  readStaffPage,
  type StaffPageRead,
} from "@/lib/server/staff/staff-page";
import type { CatalogPage } from "@/staff/staff-paths";

/** The staff gate, asked for a page of the price dashboard (which needs `price.edit`). */
export function readCatalogPage({
  locale,
  page,
}: {
  locale: string;
  page: CatalogPage;
}): Promise<StaffPageRead> {
  return readStaffPage({ locale, page });
}
