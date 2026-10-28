import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";

import { routing } from "@/i18n/routing";
import { PublishUnavailableScreen } from "@/price-dashboard/publish-page";
import { readVersionDetail } from "@/price-dashboard/publish-source";
import { VersionDetailScreen } from "@/price-dashboard/version-detail";

import {
  brandOnlyMetadata,
  renderCatalogPage,
} from "../../_lib/render-catalog-page";

interface VersionPageProps {
  readonly params: Promise<{ locale: string; versionId: string }>;
}

export async function generateMetadata({
  params,
}: VersionPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return brandOnlyMetadata(locale);
}

/**
 * One published version, read-only. The id is judged only after the gate has let the person in, so every caller who may not
 * read prices is answered alike whatever the address says; a version the store does not hold is then the framework's
 * not-found. Rendered per request.
 */
export default async function VersionPage({ params }: VersionPageProps) {
  await connection();
  const { locale, versionId } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return renderCatalogPage({
    locale,
    page: "publish",
    signedIn: async (shell) => {
      const read = await readVersionDetail(versionId);
      if (read.kind === "not-found") notFound();
      return read.kind === "ready" ? (
        <VersionDetailScreen
          key={versionId}
          locale={locale}
          context={shell}
          input={read.input}
        />
      ) : (
        <PublishUnavailableScreen locale={locale} context={shell} />
      );
    },
  });
}
