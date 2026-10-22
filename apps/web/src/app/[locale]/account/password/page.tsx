import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { ForbiddenScreen } from "@/account/forbidden-screen";
import {
  ChangePasswordForm,
  ChangePasswordUnavailableScreen,
} from "@/account/profile/change-password-form";
import { resolveAccountPasswordCopy } from "@/i18n/content";
import { routing } from "@/i18n/routing";
import { readSignedInPage } from "@/lib/server/account/signed-in-page";

interface PasswordPageProps {
  readonly params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: PasswordPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const translate = await getTranslations({ locale });
  return { title: resolveAccountPasswordCopy(translate).metaTitle };
}

/**
 * The signed-in account's password change: a shell and one client form that carries no data from the server. The
 * server gate decides who sees it (`readSignedInPage`): a person who is not signed in leaves for the login page, an
 * account whose role may not manage its own details is shown the forbidden screen, and a session store that could not
 * be read draws a notice. The form then changes the password through `POST /api/account/password`.
 */
export default async function PasswordPage({ params }: PasswordPageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const read = await readSignedInPage({
    locale,
    capability: "account.manage.own",
  });
  switch (read.kind) {
    case "signed-in":
      return <ChangePasswordForm locale={locale} />;
    case "forbidden":
      return <ForbiddenScreen locale={locale} />;
    case "unavailable":
      return <ChangePasswordUnavailableScreen locale={locale} />;
  }
}
