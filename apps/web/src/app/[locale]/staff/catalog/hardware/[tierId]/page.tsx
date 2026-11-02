import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";

import { routing } from "@/i18n/routing";
import { HardwareEditScreen } from "@/price-dashboard/hardware-edit";
import { HardwareUnavailableScreen } from "@/price-dashboard/hardware-list";
import { readHardwareClass } from "@/price-dashboard/hardware-source";

import {
  brandOnlyMetadata,
  renderCatalogPage,
} from "../../_lib/render-catalog-page";

interface HardwareClassPageProps {
  readonly params: Promise<{ locale: string; tierId: string }>;
}

export async function generateMetadata({
  params,
}: HardwareClassPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return brandOnlyMetadata(locale);
}

/**
 * One class of hardware, with its rates. The id is judged only after the gate has let the person in, so every caller who
 * may not read prices is answered alike whatever the address says; a class neither the book nor the draft holds is then the
 * framework's not-found. The source reads without writing; the page writes through its own clients. Rendered per request.
 */
export default async function HardwareClassPage({
  params,
}: HardwareClassPageProps) {
  await connection();
  const { locale, tierId } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return renderCatalogPage({
    locale,
    page: "hardware",
    signedIn: async (shell) => {
      const id = decodedSegment(tierId);
      const read = await readHardwareClass(id);
      if (read.kind === "not-found") notFound();
      return read.kind === "ready" ? (
        <HardwareEditScreen
          key={id}
          locale={locale}
          context={shell}
          page={read.page}
          tierId={id}
        />
      ) : (
        <HardwareUnavailableScreen locale={locale} context={shell} />
      );
    },
  });
}

/** The framework may hand the segment encoded; one that is not valid encoding names no class. */
function decodedSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return notFound();
  }
}
