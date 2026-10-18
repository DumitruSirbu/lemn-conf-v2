import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { ForgotPasswordForm } from "@/account/forgot-password-form";
import { resolveAccountForgotCopy } from "@/i18n/content";
import { routing } from "@/i18n/routing";
import { readChallengePageProps } from "@/lib/server/account/challenge-page-props";

interface ForgotPasswordPageProps {
  readonly params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: ForgotPasswordPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const translate = await getTranslations({ locale });
  return { title: resolveAccountForgotCopy(translate).metaTitle };
}

/**
 * The reset request page: a shell and one client screen, dynamic and a plain document load (see
 * `readChallengePageProps`).
 */
export default async function ForgotPasswordPage({
  params,
}: ForgotPasswordPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const { siteKey, nonce } = await readChallengePageProps();
  return <ForgotPasswordForm locale={locale} siteKey={siteKey} nonce={nonce} />;
}
