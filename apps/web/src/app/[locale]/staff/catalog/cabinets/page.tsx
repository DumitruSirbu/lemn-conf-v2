import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";

import { ForbiddenScreen } from "@/account/forbidden-screen";
import { routing } from "@/i18n/routing";
import {
  CabinetListScreen,
  CabinetListUnavailableScreen,
} from "@/price-dashboard/cabinet-list";
import { readCabinetList } from "@/price-dashboard/cabinet-list-source";
import { CatalogUnavailableScreen } from "@/price-dashboard/catalog-states";
import { StaffForbiddenScreen } from "@/staff/staff-shell";

import { readCatalogPage } from "../_lib/read-catalog-page";

interface CabinetsPageProps {
  readonly params: Promise<{ locale: string }>;
}

/** The brand and nothing else: the title is built before the gate runs, so it must not name the price list to someone who
 *  is then shown the forbidden screen or the notice. */
export async function generateMetadata({
  params,
}: CabinetsPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const translate = await getTranslations({ locale });
  return { title: translate("brand") };
}

/**
 * The list of cabinet types. `readCatalogPage` decides who sees it: a visitor leaves for the login page, an operator gets
 * the forbidden screen inside the staff frame, any other account gets the account area's, and an unreadable session store
 * draws a notice, all with HTTP 200. `readCabinetList` supplies what the list shows. Rendered per request.
 */
export default async function CabinetsPage({ params }: CabinetsPageProps) {
  await connection();
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const read = await readCatalogPage({ locale, page: "cabinets" });
  switch (read.kind) {
    case "signed-in": {
      const list = await readCabinetList();
      return list.kind === "ready" ? (
        <CabinetListScreen
          locale={locale}
          context={read.shell}
          input={list.input}
        />
      ) : (
        <CabinetListUnavailableScreen locale={locale} context={read.shell} />
      );
    }
    case "staff-forbidden":
      return (
        <StaffForbiddenScreen
          locale={locale}
          page="cabinets"
          context={read.shell}
        />
      );
    case "forbidden":
      return <ForbiddenScreen locale={locale} />;
    case "unavailable":
      return <CatalogUnavailableScreen locale={locale} />;
  }
}
