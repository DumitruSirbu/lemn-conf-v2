import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";

import { routing, type AppLocale } from "@/i18n/routing";
import { PublishUnavailableScreen } from "@/price-dashboard/publish-page";
import {
  readVersionDetail,
  type VersionDetailRead,
} from "@/price-dashboard/publish-source";
import { PublishDraftUnreadableScreen } from "@/price-dashboard/publish-unreadable";
import type { StaffShellContext } from "@/staff/staff-shell";
import { VersionDetailScreen } from "@/price-dashboard/version-detail";

import {
  brandOnlyMetadata,
  renderCatalogPage,
} from "../../_lib/render-catalog-page";

interface VersionPageProps {
  readonly params: Promise<{ locale: string; versionId: string }>;
}

export async function generateMetadata({
  params,
}: VersionPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return brandOnlyMetadata(locale);
}

/**
 * One published version, read-only. The id is judged only after the gate has let the person in, so every caller who may not
 * read prices is answered alike whatever the address says; a version the store does not hold is then the framework's
 * not-found. Rendered per request.
 */
export default async function VersionPage({ params }: VersionPageProps) {
  await connection();
  const { locale, versionId } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return renderCatalogPage({
    locale,
    page: "publish",
    signedIn: async (shell) => {
      const read = await readVersionDetail(versionId);
      if (read.kind === "not-found") notFound();
      return versionScreenOf({ read, locale, shell, versionId });
    },
  });
}

/**
 * A version the draft cannot be restored into is shown as the unreadable draft: giving it up is the one write that
 * works.
 */
function versionScreenOf({
  read,
  locale,
  shell,
  versionId,
}: {
  readonly read: Exclude<VersionDetailRead, { readonly kind: "not-found" }>;
  readonly locale: AppLocale;
  readonly shell: StaffShellContext;
  readonly versionId: string;
}) {
  switch (read.kind) {
    case "ready":
      return (
        <VersionDetailScreen
          key={versionId}
          locale={locale}
          context={shell}
          input={read.input}
        />
      );
    case "draft-unreadable":
      return (
        <PublishDraftUnreadableScreen
          locale={locale}
          context={shell}
          draftRevision={read.draftRevision}
        />
      );
    case "unavailable":
      return <PublishUnavailableScreen locale={locale} context={shell} />;
  }
}
