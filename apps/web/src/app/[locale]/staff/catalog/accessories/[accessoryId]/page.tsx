import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";

import { routing } from "@/i18n/routing";
import { AccessoryEditScreen } from "@/price-dashboard/accessory-edit";
import { ItemUnavailableScreen } from "@/price-dashboard/catalog-states";
import { readAccessory } from "@/price-dashboard/accessory-source";

import {
  brandOnlyMetadata,
  renderCatalogPage,
} from "../../_lib/render-catalog-page";

interface AccessoryPageProps {
  readonly params: Promise<{ locale: string; accessoryId: string }>;
}

export async function generateMetadata({
  params,
}: AccessoryPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return brandOnlyMetadata(locale);
}

/**
 * One accessory, with its price. The id is judged only after the gate has let the person in, so every caller who may
 * not read prices is answered alike whatever the address says; an accessory neither the book nor the draft holds is
 * then the framework's not-found. The source reads without writing; the page writes through its own clients. Rendered
 * per request.
 */
export default async function AccessoryPage({ params }: AccessoryPageProps) {
  await connection();
  const { locale, accessoryId } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return renderCatalogPage({
    locale,
    page: "accessories",
    signedIn: async (shell) => {
      const id = decodedSegment(accessoryId);
      const read = await readAccessory(id);
      if (read.kind === "not-found") notFound();
      return read.kind === "ready" ? (
        <AccessoryEditScreen
          key={id}
          locale={locale}
          context={shell}
          page={read.page}
          accessoryId={id}
        />
      ) : (
        <ItemUnavailableScreen
          locale={locale}
          context={shell}
          page="accessories"
        />
      );
    },
  });
}

/** The framework may hand the segment encoded; one that is not valid encoding names no accessory. */
function decodedSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return notFound();
  }
}
