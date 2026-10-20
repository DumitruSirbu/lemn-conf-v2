import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";

import { RevertEmailForm } from "@/account/profile/revert-email-form";
import { resolveAccountRevertEmailCopy } from "@/i18n/content";
import { routing } from "@/i18n/routing";

interface RevertEmailPageProps {
  readonly params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: RevertEmailPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const translate = await getTranslations({ locale });
  return { title: resolveAccountRevertEmailCopy(translate).metaTitle };
}

/**
 * The undo page of an address change. A shell and nothing else: no copy, no style, one client screen. It always renders
 * the form, because the token is in the address fragment, which a server never sees; the client reads it, takes it out
 * of the address and sends it only when the person presses the button. It is a token page: no challenge and no session,
 * and `proxy.ts` gives it the site's policy with `no-referrer`. `connection()` renders it per request, since a
 * prerendered page's scripts would carry no nonce for that policy and could not run. Unlike the confirmation page it is
 * **not** behind `EMAIL_CHANGE_ENABLED`: switching the feature off must not strand a link already mailed (R-13).
 */
export default async function RevertEmailPage({
  params,
}: RevertEmailPageProps) {
  await connection();
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return <RevertEmailForm locale={locale} />;
}
