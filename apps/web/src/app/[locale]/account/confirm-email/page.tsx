import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";

import { ConfirmEmailForm } from "@/account/profile/confirm-email-form";
import { EMAIL_CHANGE_ENABLED } from "@/account/profile/email-change-enabled";
import { resolveAccountEmailChangeCopy } from "@/i18n/content";
import { routing } from "@/i18n/routing";

interface ConfirmEmailPageProps {
  readonly params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: ConfirmEmailPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale) || !EMAIL_CHANGE_ENABLED) notFound();
  const translate = await getTranslations({ locale });
  return { title: resolveAccountEmailChangeCopy(translate).metaTitle };
}

/**
 * The confirm-new-address page. A shell and nothing else: no copy, no style, one client screen. It always renders the
 * form, because the token is in the address fragment, which a server never sees; the client reads it, takes it out of
 * the address and sends it only when the person presses "Confirmă". It is a token page: no challenge and no session,
 * and `proxy.ts` gives it the site's policy with `no-referrer`. `connection()` renders it per request, since a
 * prerendered page's scripts would carry no nonce for that policy and could not run. While the e-mail change is off
 * (`EMAIL_CHANGE_ENABLED`) the address is the account area's not-found page.
 */
export default async function ConfirmEmailPage({
  params,
}: ConfirmEmailPageProps) {
  await connection();
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale) || !EMAIL_CHANGE_ENABLED) notFound();
  return <ConfirmEmailForm locale={locale} />;
}
