import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { ForbiddenScreen } from "@/account/forbidden-screen";
import {
  ProfileForm,
  ProfileUnavailableScreen,
} from "@/account/profile/profile-form";
import { resolveAccountProfileCopy } from "@/i18n/content";
import { routing } from "@/i18n/routing";
import { readProfilePage } from "@/lib/server/account/profile-page";

interface ProfilePageProps {
  readonly params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: ProfilePageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const translate = await getTranslations({ locale });
  return { title: resolveAccountProfileCopy(translate).metaTitle };
}

/**
 * The account's own details: a shell and one client form, drawn filled. The server gate decides who sees it
 * (`readProfilePage`): a person who is not signed in leaves for the login page, an account whose role may not manage its
 * own details is shown the forbidden screen, and a store that could not be read draws a notice. The details are read on the server, which a render may do since it writes nothing; the form then
 * saves through `PATCH /api/account/profile`.
 */
export default async function ProfilePage({ params }: ProfilePageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const read = await readProfilePage(locale);
  switch (read.kind) {
    case "signed-in":
      return (
        <ProfileForm
          locale={locale}
          email={read.email}
          profile={read.profile}
        />
      );
    case "forbidden":
      return <ForbiddenScreen locale={locale} />;
    case "unavailable":
      return <ProfileUnavailableScreen locale={locale} />;
  }
}
