import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { ForbiddenScreen } from "@/account/forbidden-screen";
import {
  KitchensScreen,
  KitchensUnavailableScreen,
} from "@/account/kitchens/kitchens-screen";
import { resolveAccountKitchensCopy } from "@/i18n/content";
import { routing } from "@/i18n/routing";
import { readSignedInPage } from "@/lib/server/account/signed-in-page";
import { readActivePriceBook } from "@/lib/server/active-price-book";
import { PriceBookProvider } from "@/price/price-book-provider";

interface KitchensPageProps {
  readonly params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: KitchensPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const translate = await getTranslations({ locale });
  return { title: resolveAccountKitchensCopy(translate).metaTitle };
}

/**
 * The client's kitchens: a shell and one client screen. The server gate decides who sees it (`readSignedInPage`): a
 * person who is not signed in leaves for the login page, an account whose role does not hold `design.read.own` is shown
 * the forbidden screen, and a session store that could not be read draws a notice. The list itself is read by the screen
 * from `GET /api/account/kitchens`, so the page carries no kitchen.
 */
export default async function KitchensPage({ params }: KitchensPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const read = await readSignedInPage({
    locale,
    capability: "design.read.own",
  });
  switch (read.kind) {
    case "signed-in":
      return (
        <PriceBookProvider root={await readActivePriceBook()}>
          <KitchensScreen locale={locale} />
        </PriceBookProvider>
      );
    case "forbidden":
      return <ForbiddenScreen locale={locale} />;
    case "unavailable":
      return <KitchensUnavailableScreen locale={locale} />;
  }
}
