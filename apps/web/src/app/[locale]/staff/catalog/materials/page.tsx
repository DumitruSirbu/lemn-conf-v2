import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";

import { routing } from "@/i18n/routing";
import { MaterialListScreen } from "@/price-dashboard/material-list";
import { MaterialUnavailableScreen } from "@/price-dashboard/material-parts";
import { readMaterials } from "@/price-dashboard/material-source";

import {
  brandOnlyMetadata,
  renderCatalogPage,
} from "../_lib/render-catalog-page";

interface MaterialsPageProps {
  readonly params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: MaterialsPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return brandOnlyMetadata(locale);
}

/**
 * The materials. `renderCatalogPage` decides who sees it: a visitor leaves for the login page, an operator gets the
 * forbidden screen inside the staff frame, any other account gets the account area's, and an unreadable session store
 * draws a notice, all with HTTP 200. `readMaterials` supplies what the list shows once that gate has admitted the
 * reader, and reads without writing; the list writes through its own clients. Rendered per request.
 */
export default async function MaterialsPage({ params }: MaterialsPageProps) {
  await connection();
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return renderCatalogPage({
    locale,
    page: "materials",
    signedIn: async (shell) => {
      const read = await readMaterials();
      return read.kind === "ready" ? (
        <MaterialListScreen locale={locale} context={shell} page={read.page} />
      ) : (
        <MaterialUnavailableScreen locale={locale} context={shell} />
      );
    },
  });
}
