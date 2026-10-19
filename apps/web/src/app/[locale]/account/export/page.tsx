import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { ForbiddenScreen } from "@/account/forbidden-screen";
import {
  ExportScreen,
  ExportUnavailableScreen,
} from "@/account/profile/export-screen";
import { resolveAccountExportCopy } from "@/i18n/content";
import { routing } from "@/i18n/routing";
import { readSignedInPage } from "@/lib/server/account/signed-in-page";

interface ExportPageProps {
  readonly params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: ExportPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const translate = await getTranslations({ locale });
  return { title: resolveAccountExportCopy(translate).metaTitle };
}

/**
 * The signed-in account's data export: a shell and one client screen that carries no data from the server. The server
 * gate decides who sees it (`readSignedInPage`): a person who is not signed in leaves for the login page, an account
 * whose role may not manage its own details is shown the forbidden screen, and a session store that could not be read
 * draws a notice. The screen then downloads the file through `POST /api/account/export`.
 */
export default async function ExportPage({ params }: ExportPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const read = await readSignedInPage({
    locale,
    capability: "account.manage.own",
  });
  switch (read.kind) {
    case "signed-in":
      return <ExportScreen locale={locale} />;
    case "forbidden":
      return <ForbiddenScreen locale={locale} />;
    case "unavailable":
      return <ExportUnavailableScreen locale={locale} />;
  }
}
