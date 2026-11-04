import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";

import { routing } from "@/i18n/routing";
import { AccessoryCreateScreen } from "@/price-dashboard/accessory-create";
import { AccessoryUnavailableScreen } from "@/price-dashboard/accessory-parts";
import { readAccessories } from "@/price-dashboard/accessory-source";

import {
  brandOnlyMetadata,
  renderCatalogPage,
} from "../../_lib/render-catalog-page";

interface AccessoryNewPageProps {
  readonly params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: AccessoryNewPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return brandOnlyMetadata(locale);
}

/**
 * The form of a new accessory. The gate is the list's: `renderCatalogPage` decides who sees it, and `readAccessories`
 * supplies the draft the creation is written beside, reading without writing; the form writes through its own client. The
 * segment `new` is this page's, so no accessory is ever reached by it. Rendered per request.
 */
export default async function AccessoryNewPage({
  params,
}: AccessoryNewPageProps) {
  await connection();
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return renderCatalogPage({
    locale,
    page: "accessories",
    signedIn: async (shell) => {
      const read = await readAccessories();
      return read.kind === "ready" ? (
        <AccessoryCreateScreen
          locale={locale}
          context={shell}
          page={read.page}
        />
      ) : (
        <AccessoryUnavailableScreen locale={locale} context={shell} />
      );
    },
  });
}
