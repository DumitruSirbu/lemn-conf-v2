import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";

import { ForbiddenScreen } from "@/account/forbidden-screen";
import { routing } from "@/i18n/routing";
import { readStaffPage } from "@/lib/server/staff/staff-page";
import { StaffKitchensScreen } from "@/staff/staff-kitchens-list";
import { StaffKitchensUnavailableScreen } from "@/staff/staff-kitchens-states";
import { StaffForbiddenScreen } from "@/staff/staff-shell";

interface StaffKitchensPageProps {
  readonly params: Promise<{ locale: string }>;
}

/** The brand and nothing else: the title is built before the gate runs, so it must not name the staff area or a kitchen to
 *  someone who is then shown the forbidden screen or the notice. */
export async function generateMetadata({
  params,
}: StaffKitchensPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const translate = await getTranslations({ locale });
  return { title: translate("brand") };
}

/**
 * Every client's kitchens, for staff: a shell and one client screen. The server gate decides who sees it
 * (`readStaffPage`): a person who is not signed in leaves for the login page, a staff account the page's capability is
 * withheld from sees the forbidden screen inside the staff frame, any other account sees the account area's forbidden
 * screen, and a session store that could not be read draws a notice. Each of those answers HTTP 200 with the screen, never
 * `403`. The list itself is read by the screen from `GET /api/staff/kitchens`, so the page carries no kitchen. Rendered
 * per request: it depends on the session.
 */
export default async function StaffKitchensPage({
  params,
}: StaffKitchensPageProps) {
  await connection();
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const read = await readStaffPage({ locale, page: "kitchens" });
  switch (read.kind) {
    case "signed-in":
      return <StaffKitchensScreen locale={locale} context={read.shell} />;
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
