import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";

import { routing } from "@/i18n/routing";
import {
  PublishScreen,
  PublishUnavailableScreen,
} from "@/price-dashboard/publish-page";
import { readPublishPage } from "@/price-dashboard/publish-source";

import {
  brandOnlyMetadata,
  renderCatalogPage,
} from "../_lib/render-catalog-page";

interface PublishPageProps {
  readonly params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: PublishPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return brandOnlyMetadata(locale);
}

/**
 * "Publicare prețuri": the prices prepared and not yet published, with the button that publishes them. The gate and its
 * answers are `renderCatalogPage`'s; `readPublishPage` supplies what the page shows, and the screen writes through its own
 * client. Rendered per request.
 */
export default async function PublishPage({ params }: PublishPageProps) {
  await connection();
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return renderCatalogPage({
    locale,
    page: "publish",
    signedIn: async (shell) => {
      const read = await readPublishPage();
      return read.kind === "ready" ? (
        <PublishScreen
          locale={locale}
          context={shell}
          input={read.input}
          initialView="pending"
        />
      ) : (
        <PublishUnavailableScreen locale={locale} context={shell} />
      );
    },
  });
}
