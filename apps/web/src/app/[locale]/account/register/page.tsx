import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { RegisterForm } from "@/account/register-form";
import { resolveAccountRegisterCopy } from "@/i18n/content";
import { routing } from "@/i18n/routing";
import { readChallengePageProps } from "@/lib/server/account/challenge-page-props";

interface RegisterPageProps {
  readonly params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: RegisterPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const translate = await getTranslations({ locale });
  return { title: resolveAccountRegisterCopy(translate).metaTitle };
}

/**
 * The registration page: a shell and one client screen, dynamic and a plain document load (see
 * `readChallengePageProps`).
 */
export default async function RegisterPage({ params }: RegisterPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const { siteKey, nonce } = await readChallengePageProps();
  return <RegisterForm locale={locale} siteKey={siteKey} nonce={nonce} />;
}
