import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";

import { routing } from "@/i18n/routing";
import { readPublishPage } from "@/price-dashboard/publish-source";

import { publishScreenOf } from "../../_lib/publish-read-screen";
import {
  brandOnlyMetadata,
  renderCatalogPage,
} from "../../_lib/render-catalog-page";

interface HistoryPageProps {
  readonly params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: HistoryPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return brandOnlyMetadata(locale);
}

/**
 * The second tab of "Publicare prețuri": the versions published so far. It stands on the publish page's own capability and
 * navigation entry; only the tab differs. A static segment, so a version's address never reads as this page. Rendered per
 * request.
 */
export default async function HistoryPage({ params }: HistoryPageProps) {
  await connection();
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return renderCatalogPage({
    locale,
    page: "publish",
    signedIn: async (shell) => {
      const read = await readPublishPage(locale);
      return publishScreenOf({
        read,
        locale,
        shell,
        initialView: "history",
      });
    },
  });
}
