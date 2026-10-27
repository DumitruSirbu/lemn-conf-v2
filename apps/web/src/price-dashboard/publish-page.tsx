"use client";

import { useTranslations } from "next-intl";
import { useRef, type ReactNode, type RefObject } from "react";

import { FormNotice } from "@/account/account-form-parts";
import type { AppLocale } from "@/i18n/routing";
import { isolated } from "@/staff/bidi-isolate";
import { StaffShell, type StaffShellContext } from "@/staff/staff-shell";

import { CatalogUnavailableNotice } from "./catalog-states";
import type { PublishClient } from "./publish-client";
import { ProvisionalOffDialog, PublishConfirmDialog } from "./publish-dialogs";
import { itemSubjectOf, type PublishPageInput } from "./publish-model";
import {
  ProvisionalSwitch,
  PublishButton,
  PublishHelp,
  VersionNameField,
} from "./publish-panel";
import { historyPathOf, publishPathOf } from "./publish-paths";
import styles from "./publish.module.css";
import { DiffSections, useRowWords } from "./publish-rows";
import {
  usePublishDesk,
  type PublishDesk,
  type PublishNotice,
  type PublishView,
} from "./use-publish-desk";
import { VersionHistory } from "./version-history";

// "Publicare prețuri" (frames D7A to D7G, D7M, and D8A as its second tab): everything prepared and not yet published, from
// every section, in one list; the version's name; the switch for the provisional figures; and the button that makes it all
// active at once. A bulk action is one row that opens to its members. The numbers in the frame's header and menu come from
// this screen's own draft while it is open, so they follow a ↺ at once.

/** How many of the latest versions the empty page offers (D7D). */
const LATEST_VERSIONS_SHOWN = 3;

export interface PublishScreenProps {
  readonly locale: AppLocale;
  readonly context: StaffShellContext;
  readonly input: PublishPageInput;
  readonly initialView: PublishView;
  /** What writes. Left out, the build's own: an in-memory one outside production, one that fails inside it. */
  readonly client?: PublishClient | undefined;
}

export function PublishScreen({
  locale,
  context,
  input,
  initialView,
  client,
}: PublishScreenProps) {
  const desk = usePublishDesk({ input, initialView, client });
  const publishButtonRef = useRef<HTMLButtonElement>(null);
  const shell = {
    ...context,
    pendingPriceCount: desk.state.draft.changes.length,
  };
  return (
    <StaffShell locale={locale} page="publish" context={shell}>
      <section className={styles.page} data-testid="publish-page">
        <PublishHeading locale={locale} desk={desk} />
        <PublishNoticeBanner desk={desk} />
        {desk.view === "history" ? (
          <VersionHistory
            locale={locale}
            versions={desk.versions}
            pendingCount={desk.state.draft.changes.length}
          />
        ) : (
          <PendingPrices
            locale={locale}
            desk={desk}
            publishButtonRef={publishButtonRef}
          />
        )}
        <PublishDialogs desk={desk} returnFocusFallbackRef={publishButtonRef} />
      </section>
    </StaffShell>
  );
}

/** The prices could not be read: the frame stays, and the notice stands in the page's place. */
export function PublishUnavailableScreen({
  locale,
  context,
}: {
  readonly locale: AppLocale;
  readonly context: StaffShellContext;
}) {
  return (
    <StaffShell locale={locale} page="publish" context={context}>
      <CatalogUnavailableNotice />
    </StaffShell>
  );
}

function PublishHeading({
  locale,
  desk,
}: {
  readonly locale: AppLocale;
  readonly desk: PublishDesk;
}) {
  const translate = useTranslations();
  const pendingCount = desk.state.draft.changes.length;
  return (
    <div className={styles.heading}>
      <h1 className={styles.title}>
        {translate("priceDashboard.publish.title")}
      </h1>
      <p className={styles.subtitleOnDesktop}>
        {desk.view === "history"
          ? translate("priceDashboard.history.subtitle")
          : translate("priceDashboard.publish.subtitle")}
      </p>
      <p className={styles.subtitleOnPhone}>
        {desk.view === "history"
          ? translate("priceDashboard.history.subtitle")
          : translate("priceDashboard.publish.subtitleMobile", {
              count: pendingCount,
            })}
      </p>
      <nav
        className={styles.tabs}
        aria-label={translate("priceDashboard.publish.title")}
      >
        <a
          className={styles.tab}
          href={publishPathOf(locale)}
          aria-current={desk.view === "pending" ? "page" : undefined}
        >
          {translate("priceDashboard.publish.tabPending")}
          {pendingCount === 0 ? null : (
            <span className={styles.tabCount}>{pendingCount}</span>
          )}
        </a>
        <a
          className={styles.tab}
          href={historyPathOf(locale)}
          aria-current={desk.view === "history" ? "page" : undefined}
        >
          {translate("priceDashboard.publish.tabHistory")}
        </a>
      </nav>
    </div>
  );
}

function PendingPrices({
  locale,
  desk,
  publishButtonRef,
}: {
  readonly locale: AppLocale;
  readonly desk: PublishDesk;
  readonly publishButtonRef: RefObject<HTMLButtonElement | null>;
}) {
  const translate = useTranslations();
  const { reading } = desk;
  if (reading.kind === "candidate-refused") return <CatalogUnavailableNotice />;
  if (reading.kind === "empty") {
    return <NothingToPublish locale={locale} desk={desk} />;
  }
  const { view } = reading;
  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        <DiffSections
          sections={view.sections}
          columns={{
            before: translate("priceDashboard.publish.columnActive"),
            after: translate("priceDashboard.publish.columnNew"),
          }}
          onRevert={desk.revert}
          isBusy={desk.isBusy}
        />
      </div>
      <div className={styles.aside}>
        <VersionNameField
          name={desk.versionName}
          refusal={desk.nameRefusal}
          onChange={desk.setVersionName}
        />
        <ProvisionalSwitch
          isProvisional={desk.isProvisional}
          isChanged={
            desk.isProvisional !== desk.state.active.book.amountsProvisional
          }
          isBusy={desk.isBusy}
          onToggle={desk.toggleProvisional}
        />
        <PublishHelp />
        <PublishButton
          buttonRef={publishButtonRef}
          changeCount={view.changeCount}
          canPublish={view.canPublish}
          isBusy={desk.isBusy}
          onPress={desk.requestPublish}
        />
      </div>
    </div>
  );
}

/** D7D: nothing waits, and the page says what the clients see now and shows the latest versions. The switch stays, because
 *  turning the provisional figures off is a draft change and would otherwise need an unrelated price first. */
function NothingToPublish({
  locale,
  desk,
}: {
  readonly locale: AppLocale;
  readonly desk: PublishDesk;
}) {
  const translate = useTranslations();
  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        <div className={styles.empty} data-testid="publish-empty">
          <p className={styles.emptyTitle}>
            {translate("priceDashboard.publish.emptyTitle")}
          </p>
          <p className={styles.emptyBody}>
            {translate("priceDashboard.publish.emptyBody", {
              versionId: String(desk.state.active.sequenceNumber),
            })}
          </p>
        </div>
        <h2 className={styles.listHeading}>
          {translate("priceDashboard.publish.latestVersions")}
        </h2>
        <VersionHistory
          locale={locale}
          versions={desk.versions.slice(0, LATEST_VERSIONS_SHOWN)}
          pendingCount={0}
        />
      </div>
      <div className={styles.aside}>
        <ProvisionalSwitch
          isProvisional={desk.isProvisional}
          isChanged={false}
          isBusy={desk.isBusy}
          onToggle={desk.toggleProvisional}
        />
      </div>
    </div>
  );
}

function PublishNoticeBanner({ desk }: { readonly desk: PublishDesk }) {
  const { notice } = desk;
  if (notice === undefined) return null;
  return (
    <div data-testid="publish-notice">
      <NoticeBody notice={notice} desk={desk} />
    </div>
  );
}

function NoticeBody({
  notice,
  desk,
}: {
  readonly notice: PublishNotice;
  readonly desk: PublishDesk;
}): ReactNode {
  const translate = useTranslations();
  const words = useRowWords();
  switch (notice.kind) {
    case "published":
      return (
        <FormNotice
          tone="success"
          title={translate("priceDashboard.publish.publishedTitle", {
            versionId: String(notice.sequenceNumber),
            versionName: isolated(notice.label),
          })}
        >
          {translate("priceDashboard.publish.publishedBody")}
        </FormNotice>
      );
    case "failed":
      return (
        <FormNotice
          tone="error"
          title={translate("priceDashboard.publish.failedTitle")}
        >
          {translate("priceDashboard.publish.failedBody")}
          <span className={styles.noticeActions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={desk.requestPublish}
            >
              {translate("priceDashboard.publish.retry")}
            </button>
          </span>
        </FormNotice>
      );
    case "conflict":
      return (
        <FormNotice tone="warning">
          {translate("priceDashboard.errors.changedMeanwhile")}
        </FormNotice>
      );
    case "save-failed":
      return (
        <FormNotice tone="error">
          {translate("priceDashboard.errors.saveFailed")}
        </FormNotice>
      );
    case "blocked": {
      const item =
        notice.block.kind === "in-use"
          ? notice.block.items[0]
          : notice.block.item;
      const name =
        item === undefined
          ? ""
          : words.subject(itemSubjectOf(item, desk.state.active.book));
      return (
        <FormNotice tone="error">
          {notice.block.kind === "in-use"
            ? translate("priceDashboard.publish.blockedInUse", { name })
            : translate("priceDashboard.publish.blockedIsDefault", { name })}
        </FormNotice>
      );
    }
  }
}

/** The question the phase asks, if it asks one: the provisional one in place of the plain one whenever the draft turns the
 *  figures off. */
function PublishDialogs({
  desk,
  returnFocusFallbackRef,
}: {
  readonly desk: PublishDesk;
  readonly returnFocusFallbackRef: RefObject<HTMLElement | null>;
}) {
  const { phase, reading } = desk;
  if (phase.kind === "idle" || reading.kind !== "ready") return null;
  const isAskingAboutProvisional = reading.view.holdsProvisionalOff;
  if (isAskingAboutProvisional) {
    return (
      <ProvisionalOffDialog
        returnFocusFallbackRef={returnFocusFallbackRef}
        isChecked={
          phase.kind === "confirming-provisional-off" ? phase.isChecked : true
        }
        isBusy={desk.isBusy}
        onCheckedChange={desk.confirmProvisionalOff}
        onConfirm={desk.confirmPublish}
        onCancel={desk.cancelPublish}
      />
    );
  }
  return (
    <PublishConfirmDialog
      returnFocusFallbackRef={returnFocusFallbackRef}
      versionName={isolated(desk.versionName.trim())}
      changeCount={reading.view.changeCount}
      isBusy={desk.isBusy}
      onConfirm={desk.confirmPublish}
      onCancel={desk.cancelPublish}
    />
  );
}
