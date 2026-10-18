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
 * The reset request page. A shell and nothing else: no copy, no style, one client screen. It is rendered per request
 * because the Turnstile script needs the nonce `proxy.ts` minted for this request, and `readChallengePageProps` reads
 * it from the request headers, which is what makes the route dynamic. A plain document load, never a client
 * navigation: the policy that names the challenge's frame is this document's own (`proxy.ts`, account challenge pages).
 */
export default async function ForgotPasswordPage({
  params,
}: ForgotPasswordPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const { siteKey, nonce } = await readChallengePageProps();
  return <ForgotPasswordForm locale={locale} siteKey={siteKey} nonce={nonce} />;
}
