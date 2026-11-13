import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";

import {
  isDesignId,
  isKitchenViewed3dVersion,
  type KitchenViewed3dVersion,
} from "@lemnaria/configurator-domain";

import { ForbiddenScreen } from "@/account/forbidden-screen";
import { routing } from "@/i18n/routing";
import { withActivePriceBook } from "@/lib/server/with-active-price-book";
import { readStaffPage } from "@/lib/server/staff/staff-page";
import { StaffKitchen3dScreen } from "@/staff/staff-kitchen-3d-screen";
import { StaffKitchensUnavailableScreen } from "@/staff/staff-kitchens-states";
import { StaffForbiddenScreen } from "@/staff/staff-shell";

interface StaffKitchen3dPageProps {
  readonly params: Promise<{ locale: string; id: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** The brand and nothing else: the title is built before the gate, so it names neither the staff area nor a kitchen. */
export async function generateMetadata({
  params,
}: StaffKitchen3dPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const translate = await getTranslations({ locale });
  return { title: translate("brand") };
}

/**
 * One client's kitchen in 3D, read-only, for staff (ADR 0180). The same gate and page key as the kitchen's own page, so
 * every refusal is that page's answer for the same session; the id's shape is judged only after the gate. The page
 * reads no kitchen and writes no row: its screen reads `GET /api/staff/kitchens/{id}/3d`, which does. `version` is the
 * copy the link names; a value that is not `sent` or `current` (unknown, empty, repeated) is dropped without a word
 * and the page shows the default copy, so the endpoint's `400` is never asked for.
 */
export default async function StaffKitchen3dPage({
  params,
  searchParams,
}: StaffKitchen3dPageProps) {
  await connection();
  const { locale, id } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const read = await readStaffPage({ locale, page: "kitchens" });
  switch (read.kind) {
    case "signed-in": {
      if (!isDesignId(id)) notFound();
      const version = requestedVersionOf((await searchParams).version);
      return withActivePriceBook(
        <StaffKitchen3dScreen
          key={`${id}:${version ?? ""}`}
          locale={locale}
          context={read.shell}
          designId={id}
          version={version}
        />,
      );
    }
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

function requestedVersionOf(
  raw: string | string[] | undefined,
): KitchenViewed3dVersion | undefined {
  return typeof raw === "string" && isKitchenViewed3dVersion(raw)
    ? raw
    : undefined;
}
