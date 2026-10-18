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
 * The registration page. A shell and nothing else: no copy, no style, one client screen. It is rendered per request
 * because the Turnstile script needs the nonce `proxy.ts` minted for this request, and `readChallengePageProps` reads
 * it from the request headers, which is what makes the route dynamic. A plain document load, never a client
 * navigation: the policy that names the challenge's frame is this document's own (`proxy.ts`, account challenge pages).
 */
export default async function RegisterPage({ params }: RegisterPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const { siteKey, nonce } = await readChallengePageProps();
  return <RegisterForm locale={locale} siteKey={siteKey} nonce={nonce} />;
}
