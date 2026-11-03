import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";

import { routing } from "@/i18n/routing";
import { MaterialEditScreen } from "@/price-dashboard/material-edit";
import { MaterialUnavailableScreen } from "@/price-dashboard/material-parts";
import { readMaterial } from "@/price-dashboard/material-source";

import {
  brandOnlyMetadata,
  renderCatalogPage,
} from "../../_lib/render-catalog-page";

interface MaterialPageProps {
  readonly params: Promise<{ locale: string; tierId: string }>;
}

export async function generateMetadata({
  params,
}: MaterialPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return brandOnlyMetadata(locale);
}

/**
 * One material, with its surcharge. The id is judged only after the gate has let the person in, so every caller who may
 * not read prices is answered alike whatever the address says; a material the book does not hold is then the
 * framework's not-found. The source reads without writing; the page writes through its own clients. Rendered per
 * request.
 */
export default async function MaterialPage({ params }: MaterialPageProps) {
  await connection();
  const { locale, tierId } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return renderCatalogPage({
    locale,
    page: "materials",
    signedIn: async (shell) => {
      const id = decodedSegment(tierId);
      const read = await readMaterial(id);
      if (read.kind === "not-found") notFound();
      return read.kind === "ready" ? (
        <MaterialEditScreen
          key={id}
          locale={locale}
          context={shell}
          page={read.page}
          tierId={id}
        />
      ) : (
        <MaterialUnavailableScreen locale={locale} context={shell} />
      );
    },
  });
}

/** The framework may hand the segment encoded; one that is not valid encoding names no material. */
function decodedSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return notFound();
  }
}
