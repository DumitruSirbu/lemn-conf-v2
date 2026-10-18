import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";

import { currentPrivacyNoticeVersion } from "@/account/privacy-notice-version";
import { PrivacyNoticeStub } from "@/account/privacy-notice-stub";
import { resolvePrivacyNoticeCopy } from "@/i18n/content";
import { routing } from "@/i18n/routing";

interface PrivacyNoticePageProps {
  readonly params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: PrivacyNoticePageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const translate = await getTranslations({ locale });
  return {
    title: resolvePrivacyNoticeCopy(translate, currentPrivacyNoticeVersion())
      .metaTitle,
  };
}

/**
 * The page the register form's notice link opens: a marked placeholder until the real notice is published. Rendered
 * per request, as the unmatched page is, because a prerendered document's scripts carry no CSP nonce and `proxy.ts`
 * mints one for every request.
 */
export default async function PrivacyNoticePage({
  params,
}: PrivacyNoticePageProps) {
  await connection();
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const translate = await getTranslations({ locale });
  const copy = resolvePrivacyNoticeCopy(
    translate,
    currentPrivacyNoticeVersion(),
  );
  return <PrivacyNoticeStub locale={locale} copy={copy} />;
}
