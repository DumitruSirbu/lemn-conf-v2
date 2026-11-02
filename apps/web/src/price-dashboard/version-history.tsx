"use client";

import { useTranslations } from "next-intl";

import { FormNotice } from "@/account/account-form-parts";
import { useStaffKitchensCopy } from "@/i18n/use-content";
import type { AppLocale } from "@/i18n/routing";
import { isolated } from "@/staff/bidi-isolate";
import { dayOf } from "@/staff/staff-kitchen-dates";
import { PageNumbers } from "@/staff/staff-pagination";
import { pageCountOf } from "@/staff/use-staff-kitchens";

import type {
  PriceVersionListWire,
  PriceVersionSummaryWire,
} from "./price-dashboard-wire-contract";
import { publishPathOf, versionPathOf } from "./publish-paths";
import styles from "./publish.module.css";
import type { HistoryStatus } from "./use-version-history";

// Customers never see a version (ADR 0072 Amendment).

/** The pager a history that holds more than one page is given. */
export interface VersionPaging {
  readonly list: PriceVersionListWire;
  readonly status: HistoryStatus;
  readonly onGoToPage: (page: number) => void;
}

export interface VersionHistoryProps {
  readonly locale: AppLocale;
  readonly versions: readonly PriceVersionSummaryWire[];
  /** How many changes are waiting, or nothing when none are: the "În pregătire" row is then not drawn. */
  readonly pendingCount: number;
  /** Absent, the versions are all there is to show and no pager is drawn. */
  readonly paging?: VersionPaging | undefined;
}

export function VersionHistory({
  locale,
  versions,
  pendingCount,
  paging,
}: VersionHistoryProps) {
  const translate = useTranslations();
  return (
    <div
      className={styles.main}
      data-testid="version-history"
      aria-busy={paging?.status === "loading" ? true : undefined}
    >
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
      {paging === undefined ? null : <VersionPager paging={paging} />}
    </div>
  );
}

/** "Se afișează a–b din n" and the pages, which wrap on a phone; a page that could not be read leaves the one on screen. */
function VersionPager({ paging }: { readonly paging: VersionPaging }) {
  const translate = useTranslations();
  const copy = useStaffKitchensCopy().pagination;
  const { list, status, onGoToPage } = paging;
  const pageCount = pageCountOf(list.total, list.pageSize);
  if (pageCount < 2 && status !== "failed") return null;
  const from = (list.page - 1) * list.pageSize + 1;
  const to = from + list.versions.length - 1;
  return (
    <div className={styles.pager} data-testid="version-pager">
      {status === "failed" ? (
        <FormNotice tone="error">
          {translate("priceDashboard.history.pageFailed")}
        </FormNotice>
      ) : null}
      {list.versions.length === 0 ? null : (
        <p className={styles.showing}>
          {copy.showing({ from, to, total: list.total })}
        </p>
      )}
      <PageNumbers
        current={list.page}
        pageCount={pageCount}
        onGoToPage={onGoToPage}
      />
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
