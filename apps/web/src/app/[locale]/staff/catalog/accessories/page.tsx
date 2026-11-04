import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";

import { routing } from "@/i18n/routing";
import { AccessoryListScreen } from "@/price-dashboard/accessory-list";
import { AccessoryUnavailableScreen } from "@/price-dashboard/accessory-parts";
import { readAccessories } from "@/price-dashboard/accessory-source";

import {
  brandOnlyMetadata,
  renderCatalogPage,
} from "../_lib/render-catalog-page";

interface AccessoriesPageProps {
  readonly params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: AccessoriesPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return brandOnlyMetadata(locale);
}

/**
 * The accessories. `renderCatalogPage` decides who sees it: a visitor leaves for the login page, an operator gets
 * the forbidden screen inside the staff frame, any other account gets the account area's, and an unreadable session store
 * draws a notice, all with HTTP 200. `readAccessories` supplies what the list shows once that gate has admitted the reader, and
 * reads without writing; the list writes through its own clients. Rendered per request.
 */
export default async function AccessoriesPage({
  params,
}: AccessoriesPageProps) {
  await connection();
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return renderCatalogPage({
    locale,
    page: "accessories",
    signedIn: async (shell) => {
      const read = await readAccessories();
      return read.kind === "ready" ? (
        <AccessoryListScreen locale={locale} context={shell} page={read.page} />
      ) : (
        <AccessoryUnavailableScreen locale={locale} context={shell} />
      );
    },
  });
}
