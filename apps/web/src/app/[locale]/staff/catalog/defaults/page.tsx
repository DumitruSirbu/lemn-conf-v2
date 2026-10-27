import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";

import { ForbiddenScreen } from "@/account/forbidden-screen";
import { routing } from "@/i18n/routing";
import { CatalogUnavailableScreen } from "@/price-dashboard/catalog-states";
import {
  KitchenDefaultsScreen,
  KitchenDefaultsUnavailableScreen,
} from "@/price-dashboard/kitchen-defaults-page";
import { readKitchenDefaults } from "@/price-dashboard/kitchen-defaults-source";
import { StaffForbiddenScreen } from "@/staff/staff-shell";

import { readCatalogPage } from "../_lib/read-catalog-page";

interface DefaultsPageProps {
  readonly params: Promise<{ locale: string }>;
}

/** The brand and nothing else: the title is built before the gate runs, so it must not name the price list to someone who
 *  is then shown the forbidden screen or the notice. */
export async function generateMetadata({
  params,
}: DefaultsPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const translate = await getTranslations({ locale });
  return { title: translate("brand") };
}

/**
 * The values a new kitchen starts with. `readCatalogPage` decides who sees it: a visitor leaves for the login page, an
 * operator gets the forbidden screen inside the staff frame, any other account gets the account area's, and an unreadable
 * session store draws a notice, all with HTTP 200. `readKitchenDefaults` supplies what the screen shows. Rendered per
 * request.
 */
export default async function DefaultsPage({ params }: DefaultsPageProps) {
  await connection();
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const read = await readCatalogPage({ locale, page: "defaults" });
  switch (read.kind) {
    case "signed-in": {
      const defaults = await readKitchenDefaults();
      return defaults.kind === "ready" ? (
        <KitchenDefaultsScreen
          locale={locale}
          context={read.shell}
          input={defaults.input}
        />
      ) : (
        <KitchenDefaultsUnavailableScreen
          locale={locale}
          context={read.shell}
        />
      );
    }
    case "staff-forbidden":
      return (
        <StaffForbiddenScreen
          locale={locale}
          page="defaults"
          context={read.shell}
        />
      );
    case "forbidden":
      return <ForbiddenScreen locale={locale} />;
    case "unavailable":
      return <CatalogUnavailableScreen locale={locale} />;
  }
}
