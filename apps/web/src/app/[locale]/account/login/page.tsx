import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { LoginForm } from "@/account/login-form";
import { loginArrivalOf } from "@/account/login-arrival";
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
 * The sign-in page. A shell and nothing else: no copy, no style, one client screen. It is rendered per request because
 * the Turnstile script needs the nonce `proxy.ts` minted for this request, and `readChallengePageProps` reads it from
 * the request headers, which is what makes the route dynamic. A plain document load, never a client navigation: the
 * policy that names the challenge's frame is this document's own (`proxy.ts`, account challenge pages). The only query
 * it reads is `reason`, matched against a closed list; no value the person typed is ever put in an address.
 */
export default async function LoginPage({
  params,
  searchParams,
}: LoginPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const { reason } = await searchParams;
  const { siteKey, nonce } = await readChallengePageProps();
  return (
    <LoginForm
      locale={locale}
      siteKey={siteKey}
      nonce={nonce}
      arrival={loginArrivalOf(reason)}
    />
  );
}
