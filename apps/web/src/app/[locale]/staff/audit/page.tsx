import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";

import { ForbiddenScreen } from "@/account/forbidden-screen";
import { routing } from "@/i18n/routing";
import { readStaffPage } from "@/lib/server/staff/staff-page";
import {
  StaffAuditScreen,
  StaffAuditUnavailableScreen,
} from "@/staff/staff-audit-page";
import { StaffForbiddenScreen } from "@/staff/staff-shell";

interface StaffAuditPageProps {
  readonly params: Promise<{ locale: string }>;
}

/** The brand and nothing else: the title is built before the gate runs, so it must not name the audit log to someone who
 *  is then shown the forbidden screen or the notice. */
export async function generateMetadata({
  params,
}: StaffAuditPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const translate = await getTranslations({ locale });
  return { title: translate("brand") };
}

/**
 * The audit log, for an administrator: a shell and one client screen. The server gate decides who sees it
 * (`readStaffPage`): a person who is not signed in leaves for the login page, a staff account without `audit.read` (an
 * operator) sees the forbidden screen inside the staff frame, any other account sees the account area's forbidden
 * screen, and a session store that could not be read draws a notice. Each of those answers HTTP 200 with the screen,
 * never `403`. The log itself is read by the screen from `GET /api/staff/audit`, so the page carries no row. Rendered per
 * request: it depends on the session.
 */
export default async function StaffAuditPage({ params }: StaffAuditPageProps) {
  await connection();
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const read = await readStaffPage({ locale, page: "audit" });
  switch (read.kind) {
    case "signed-in":
      return <StaffAuditScreen locale={locale} context={read.shell} />;
    case "staff-forbidden":
      return (
        <StaffForbiddenScreen
          locale={locale}
          page="audit"
          context={read.shell}
        />
      );
    case "forbidden":
      return <ForbiddenScreen locale={locale} />;
    case "unavailable":
      return <StaffAuditUnavailableScreen locale={locale} />;
  }
}
