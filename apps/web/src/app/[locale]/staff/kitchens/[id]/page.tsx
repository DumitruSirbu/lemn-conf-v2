import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";

import { isDesignId } from "@lemnaria/configurator-domain";

import { ForbiddenScreen } from "@/account/forbidden-screen";
import { resolveStaffKitchenCopy } from "@/i18n/content";
import { routing } from "@/i18n/routing";
import { readStaffPage } from "@/lib/server/staff/staff-page";
import { StaffKitchenScreen } from "@/staff/staff-kitchen-page";
import { StaffKitchensUnavailableScreen } from "@/staff/staff-kitchens-states";
import { StaffForbiddenScreen } from "@/staff/staff-shell";

interface StaffKitchenPageProps {
  readonly params: Promise<{ locale: string; id: string }>;
}

/** A title that names no kitchen: the address bar, the history and a shared screen must not carry a client's name. */
export async function generateMetadata({
  params,
}: StaffKitchenPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const translate = await getTranslations({ locale });
  return { title: resolveStaffKitchenCopy(translate).metaTitle };
}

/**
 * One client's kitchen, read-only, for staff: a shell and one client screen. It stands on the same gate and the same
 * capability as the list (`readStaffPage` for "kitchens"; the page is part of the list's family and has no navigation item
 * of its own), so the answers are the list's: a person who is not signed in leaves for the login page, a staff account the
 * capability is withheld from sees the forbidden screen inside the staff frame, any other account sees the account area's,
 * and a session store that could not be read draws a notice. Each answers HTTP 200 with the screen, never `403`.
 *
 * The id's shape is judged only after the gate has let the person in, so every caller who may not read a kitchen is
 * answered alike whatever the address says; a malformed id then is the framework's not-found. The kitchen itself is read by
 * the screen from `GET /api/staff/kitchens/{id}`, which writes the audit row, so the page carries no kitchen. Rendered per
 * request: it depends on the session.
 */
export default async function StaffKitchenPage({
  params,
}: StaffKitchenPageProps) {
  await connection();
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const read = await readStaffPage({ locale, page: "kitchens" });
  switch (read.kind) {
    case "signed-in":
      if (!isDesignId(id)) notFound();
      return (
        <StaffKitchenScreen
          key={id}
          locale={locale}
          context={read.shell}
          designId={id}
        />
      );
    case "staff-forbidden":
      return (
        <StaffForbiddenScreen
          locale={locale}
          page="kitchens"
          context={read.shell}
        />
      );
    case "forbidden":
      return <ForbiddenScreen locale={locale} />;
    case "unavailable":
      return <StaffKitchensUnavailableScreen locale={locale} />;
  }
}
