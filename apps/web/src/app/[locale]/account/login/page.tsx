import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { LoginForm } from "@/account/login-form";
import { loginArrivalOf } from "@/account/login-arrival";
import { returnPathOf } from "@/account/return-path";
import { resolveAccountLoginCopy } from "@/i18n/content";
import { routing } from "@/i18n/routing";
import { readChallengePageProps } from "@/lib/server/account/challenge-page-props";

interface LoginPageProps {
  readonly params: Promise<{ locale: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
}: LoginPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const translate = await getTranslations({ locale });
  return { title: resolveAccountLoginCopy(translate).metaTitle };
}

/**
 * The sign-in page: a shell and one client screen, dynamic and a plain document load for the reasons given at
 * `readChallengePageProps`. It reads two queries: `reason`, matched against a closed list, and `returnTo`, parsed
 * against the closed list of a design's own address (`returnPathOf`), where anything else is no value. No value the
 * person typed is ever put in an address.
 */
export default async function LoginPage({
  params,
  searchParams,
}: LoginPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const { reason, returnTo } = await searchParams;
  const { siteKey, nonce } = await readChallengePageProps();
  return (
    <LoginForm
      locale={locale}
      siteKey={siteKey}
      nonce={nonce}
      arrival={loginArrivalOf(reason)}
      returnPath={returnPathOf(returnTo)}
    />
  );
}
