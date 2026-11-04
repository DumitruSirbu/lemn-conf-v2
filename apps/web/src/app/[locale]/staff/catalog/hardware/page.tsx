import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";

import { routing } from "@/i18n/routing";
import { HardwareListScreen } from "@/price-dashboard/hardware-list";
import { ItemUnavailableScreen } from "@/price-dashboard/catalog-states";
import { readHardware } from "@/price-dashboard/hardware-source";

import {
  brandOnlyMetadata,
  renderCatalogPage,
} from "../_lib/render-catalog-page";

interface HardwarePageProps {
  readonly params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: HardwarePageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return brandOnlyMetadata(locale);
}

/**
 * The classes of hardware. `renderCatalogPage` decides who sees it: a visitor leaves for the login page, an operator gets
 * the forbidden screen inside the staff frame, any other account gets the account area's, and an unreadable session store
 * draws a notice, all with HTTP 200. `readHardware` supplies what the list shows once that gate has admitted the reader, and
 * reads without writing; the list writes through its own clients. Rendered per request.
 */
export default async function HardwarePage({ params }: HardwarePageProps) {
  await connection();
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return renderCatalogPage({
    locale,
    page: "hardware",
    signedIn: async (shell) => {
      const read = await readHardware();
      return read.kind === "ready" ? (
        <HardwareListScreen locale={locale} context={shell} page={read.page} />
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
