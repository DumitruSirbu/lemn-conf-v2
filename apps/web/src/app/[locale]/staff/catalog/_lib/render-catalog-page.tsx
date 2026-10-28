import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import type { Metadata } from "next";

import { ForbiddenScreen } from "@/account/forbidden-screen";
import type { AppLocale } from "@/i18n/routing";
import { CatalogUnavailableScreen } from "@/price-dashboard/catalog-states";
import { StaffForbiddenScreen } from "@/staff/staff-shell";
import type { StaffShellContext } from "@/staff/staff-shell";
import type { CatalogPage } from "@/staff/staff-paths";

import { readCatalogPage } from "./read-catalog-page";

// What the pages of one catalog section share: who may see it, and what each answer draws. A visitor leaves for the login
// page, an operator gets the forbidden screen inside the staff frame, any other account gets the account area's, and an
// unreadable session store draws a notice, all with HTTP 200. The screen of a person who may see the page is the caller's.

/** The brand and nothing else: the title is built before the gate runs, so it must not name the price list to someone who
 *  is then shown the forbidden screen or the notice. */
export async function brandOnlyMetadata(locale: AppLocale): Promise<Metadata> {
  const translate = await getTranslations({ locale });
  return { title: translate("brand") };
}

export async function renderCatalogPage({
  locale,
  page,
  signedIn,
}: {
  readonly locale: AppLocale;
  readonly page: CatalogPage;
  readonly signedIn: (shell: StaffShellContext) => Promise<ReactNode>;
}): Promise<ReactNode> {
  const read = await readCatalogPage({ locale, page });
  switch (read.kind) {
    case "signed-in":
      return signedIn(read.shell);
    case "staff-forbidden":
      return (
        <StaffForbiddenScreen
          locale={locale}
          page={page}
          context={read.shell}
        />
      );
    case "forbidden":
      return <ForbiddenScreen locale={locale} />;
    case "unavailable":
      return <CatalogUnavailableScreen locale={locale} />;
  }
}
