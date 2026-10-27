"use client";

import { useTranslations } from "next-intl";

import type { AppLocale } from "@/i18n/routing";
import { isolated } from "@/staff/bidi-isolate";
import { dayOf } from "@/staff/staff-kitchen-dates";

import type { PriceVersionSummaryWire } from "./price-dashboard-wire-contract";
import { publishPathOf, versionPathOf } from "./publish-paths";
import styles from "./publish.module.css";

// Customers never see a version (ADR 0072 Amendment).

export interface VersionHistoryProps {
  readonly locale: AppLocale;
  readonly versions: readonly PriceVersionSummaryWire[];
  /** How many changes are waiting, or nothing when none are: the "În pregătire" row is then not drawn. */
  readonly pendingCount: number;
}

export function VersionHistory({
  locale,
  versions,
  pendingCount,
}: VersionHistoryProps) {
  const translate = useTranslations();
  return (
    <div className={styles.main} data-testid="version-history">
      <div className={styles.versionHeads} aria-hidden="true">
        <span>{translate("priceDashboard.history.columnVersion")}</span>
        <span>{translate("priceDashboard.history.columnName")}</span>
        <span>{translate("priceDashboard.history.columnPublishedAt")}</span>
        <span>{translate("priceDashboard.history.columnChanges")}</span>
        <span />
      </div>
      <ul className={styles.versions}>
        {pendingCount === 0 ? null : (
          <PendingRow locale={locale} changeCount={pendingCount} />
        )}
        {versions.map((version) => (
          <VersionRow
            key={version.versionId}
            locale={locale}
            version={version}
          />
        ))}
      </ul>
    </div>
  );
}

function PendingRow({
  locale,
  changeCount,
}: {
  readonly locale: AppLocale;
  readonly changeCount: number;
}) {
  const translate = useTranslations();
  return (
    <li>
      <a
        className={styles.version}
        href={publishPathOf(locale)}
        data-state="preparing"
        data-testid="version-row-pending"
      >
        <span className={styles.versionNumber}>
          {translate("priceDashboard.history.notPublished")}
        </span>
        <span className={styles.name}>
          {translate("priceDashboard.history.pendingRowName")}
        </span>
        <span />
        <span>
          {translate("priceDashboard.publish.changeCount", {
            count: changeCount,
          })}
        </span>
        <span className={styles.chip} data-tone="warm">
          {translate("priceDashboard.history.statePreparing")}
        </span>
      </a>
    </li>
  );
}

function VersionRow({
  locale,
  version,
}: {
  readonly locale: AppLocale;
  readonly version: PriceVersionSummaryWire;
}) {
  const translate = useTranslations();
  const isActive = version.state === "active";
  return (
    <li>
      <a
        className={styles.version}
        href={versionPathOf(locale, version.versionId)}
        data-state={version.state}
        data-testid="version-row"
        data-version-id={version.versionId}
      >
        <span className={styles.versionNumber}>
          {String(version.sequenceNumber)}
        </span>
        <span className={styles.name}>{isolated(version.label)}</span>
        <span>{dayOf(version.publishedAt, locale)}</span>
        <span>
          {translate("priceDashboard.publish.changeCount", {
            count: version.changeCount,
          })}
        </span>
        <span className={styles.chip} data-tone={isActive ? "active" : "plain"}>
          {isActive
            ? translate("priceDashboard.history.stateActive")
            : translate("priceDashboard.history.stateArchived")}
        </span>
      </a>
    </li>
  );
}
