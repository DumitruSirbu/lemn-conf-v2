import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";

import { routing } from "@/i18n/routing";
import { CabinetDetailEditor } from "@/price-dashboard/cabinet-detail";
import { CabinetListUnavailableScreen } from "@/price-dashboard/cabinet-list";
import { readCabinetDetail } from "@/price-dashboard/cabinet-list-source";

import {
  brandOnlyMetadata,
  renderCatalogPage,
} from "../../_lib/render-catalog-page";

interface CabinetPageProps {
  readonly params: Promise<{ locale: string; ruleId: string }>;
}

export async function generateMetadata({
  params,
}: CabinetPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return brandOnlyMetadata(locale);
}

/**
 * One cabinet type, with its price. The id is judged only after the gate has let the person in, so every caller who may
 * not read prices is answered alike whatever the address says; a rule the book does not hold is then the framework's
 * not-found. The source reads without writing; the page writes through its own client. Rendered per request.
 */
export default async function CabinetPage({ params }: CabinetPageProps) {
  await connection();
  const { locale, ruleId } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return renderCatalogPage({
    locale,
    page: "cabinets",
    signedIn: async (shell) => {
      const id = decodedSegment(ruleId);
      const read = await readCabinetDetail(id);
      if (read.kind === "not-found") notFound();
      return read.kind === "ready" ? (
        <CabinetDetailEditor
          key={id}
          locale={locale}
          context={shell}
          page={read.page}
          ruleId={id}
        />
      ) : (
        <CabinetListUnavailableScreen locale={locale} context={shell} />
      );
    },
  });
}

/** The framework may hand the segment encoded; one that is not valid encoding names no rule. */
function decodedSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return notFound();
  }
}
