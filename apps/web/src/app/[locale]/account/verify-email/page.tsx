import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";

import { VerifyEmailForm } from "@/account/verify-email-form";
import { resolveAccountVerifyCopy } from "@/i18n/content";
import { routing } from "@/i18n/routing";

interface VerifyEmailPageProps {
  readonly params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: VerifyEmailPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const translate = await getTranslations({ locale });
  return { title: resolveAccountVerifyCopy(translate).metaTitle };
}

/**
 * The confirm-address page. A shell and nothing else: no copy, no style, one client screen. It always renders the form,
 * because the token is in the address fragment, which a server never sees; the client reads it and takes it out of the
 * address. It is a token page: no challenge, so it takes no site key and no widget nonce, and `proxy.ts` gives it the
 * site's policy with `no-referrer`. `connection()` renders it per request, since a prerendered page's scripts would carry
 * no nonce for that policy and could not run.
 */
export default async function VerifyEmailPage({
  params,
}: VerifyEmailPageProps) {
  await connection();
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return <VerifyEmailForm locale={locale} />;
}
