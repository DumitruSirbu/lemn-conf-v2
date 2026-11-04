import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";

import { routing } from "@/i18n/routing";
import { HardwareCreateScreen } from "@/price-dashboard/hardware-create";
import { ItemUnavailableScreen } from "@/price-dashboard/catalog-states";
import { readHardware } from "@/price-dashboard/hardware-source";

import {
  brandOnlyMetadata,
  renderCatalogPage,
} from "../../_lib/render-catalog-page";

interface HardwareNewPageProps {
  readonly params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: HardwareNewPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return brandOnlyMetadata(locale);
}

/**
 * The form of a new class of hardware. The gate is the list's: `renderCatalogPage` decides who sees it, and `readHardware`
 * supplies the draft the creation is written beside, reading without writing; the form writes through its own client. The
 * segment `new` is this page's, so no class is ever reached by it. Rendered per request.
 */
export default async function HardwareNewPage({
  params,
}: HardwareNewPageProps) {
  await connection();
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return renderCatalogPage({
    locale,
    page: "hardware",
    signedIn: async (shell) => {
      const read = await readHardware();
      return read.kind === "ready" ? (
        <HardwareCreateScreen
          locale={locale}
          context={shell}
          page={read.page}
        />
      ) : (
        <ItemUnavailableScreen
          locale={locale}
          context={shell}
          page="hardware"
        />
      );
    },
  });
}
