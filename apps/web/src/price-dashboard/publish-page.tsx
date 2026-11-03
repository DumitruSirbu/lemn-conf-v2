"use client";

import { useTranslations } from "next-intl";
import { useRef, type RefObject } from "react";

import type { AppLocale } from "@/i18n/routing";
import { isolated } from "@/staff/bidi-isolate";
import { StaffShell, type StaffShellContext } from "@/staff/staff-shell";

import { pendingPriceCountOf } from "./cabinet-list-model";
import { CatalogUnavailableNotice } from "./catalog-states";
import { DiscardNotice } from "./publish-discard-notice";
import type { PublishClient } from "./publish-client";
import {
  DiscardDraftDialog,
  ProvisionalOffDialog,
  PublishConfirmDialog,
} from "./publish-dialogs";
import type { PublishPageInput } from "./publish-model";
import {
  ProvisionalSwitch,
  PublishButton,
  PublishHelp,
  VersionNameField,
} from "./publish-panel";
import { historyPathOf, publishPathOf } from "./publish-paths";
import styles from "./publish.module.css";
import { NoticeBody } from "./publish-notices";
import { StaleDraft } from "./publish-stale-draft";
import { DiffSections } from "./publish-rows";
import { UnsentAmountsContext } from "./unsent-amounts";
import { useFocusAfterRevert } from "./use-focus-after-revert";
import { useFocusWhenLost } from "./use-focus-when-lost";
import {
  usePublishDesk,
  type PublishDesk,
  type PublishNotice,
  type PublishView,
} from "./use-publish-desk";
import { VersionHistory } from "./version-history";

// The frame's pending count follows this screen's own draft while it is open.

/** How many of the latest versions the empty page offers (D7D). */
const LATEST_VERSIONS_SHOWN = 3;

export interface PublishScreenProps {
  readonly locale: AppLocale;
  readonly context: StaffShellContext;
  readonly input: PublishPageInput;
  readonly initialView: PublishView;
  /** What writes. Left out, the routes'. */
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
  const discardButtonRef = useRef<HTMLButtonElement>(null);
  const pageRef = useRef<HTMLElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const { rememberRevertPosition, rememberEditPosition, emptyHeadingRef } =
    useFocusAfterRevert(pageRef, desk.state.draft);
  useFocusWhenLost(noticeRef, noticeThatReplacesTheQuestion(desk.notice));
  const shell = {
    ...context,
    pendingPriceCount: pendingPriceCountOf(desk.state.draft),
  };
  return (
    <StaffShell locale={locale} page="publish" context={shell}>
      <section
        ref={pageRef}
        className={styles.page}
        data-testid="publish-page"
        onClickCapture={rememberRevertPosition}
        onKeyDownCapture={rememberEditPosition}
      >
        <PublishHeading locale={locale} desk={desk} />
        <PublishNoticeBanner
          desk={desk}
          cabinetNames={input.cabinetNames}
          noticeRef={noticeRef}
        />
        {desk.view === "history" ? (
          <VersionHistory
            locale={locale}
            versions={desk.history.list.versions}
            pendingCount={pendingPriceCountOf(desk.state.draft)}
            paging={{
              list: desk.history.list,
              status: desk.history.status,
              onGoToPage: desk.history.goToPage,
            }}
          />
        ) : (
          <UnsentAmountsContext.Provider value={desk.reportUnsentAmount}>
            <PendingPrices
              locale={locale}
              desk={desk}
              publishButtonRef={publishButtonRef}
              discardButtonRef={discardButtonRef}
              emptyHeadingRef={emptyHeadingRef}
            />
          </UnsentAmountsContext.Provider>
        )}
        <PublishDialogs
          desk={desk}
          returnFocusFallbackRef={publishButtonRef}
          discardFocusFallbackRef={discardButtonRef}
        />
      </section>
    </StaffShell>
  );
}

/** The notices that leave the control which asked the question out of the page: the version is published, the draft is
 *  gone, or it moved and was read again. Every other notice leaves the control in place, and focus returns to it. */
function noticeThatReplacesTheQuestion(
  notice: PublishNotice | undefined,
): PublishNotice | undefined {
  const replacesControls =
    notice?.kind === "published" ||
    notice?.kind === "discarded" ||
    notice?.kind === "conflict";
  return replacesControls ? notice : undefined;
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
  const pendingCount = pendingPriceCountOf(desk.state.draft);
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
  discardButtonRef,
  emptyHeadingRef,
}: {
  readonly locale: AppLocale;
  readonly desk: PublishDesk;
  readonly publishButtonRef: RefObject<HTMLButtonElement | null>;
  readonly discardButtonRef: RefObject<HTMLButtonElement | null>;
  readonly emptyHeadingRef: RefObject<HTMLElement | null>;
}) {
  const translate = useTranslations();
  const { reading } = desk;
  if (reading.kind === "candidate-refused") {
    return (
      <StaleDraft
        changes={desk.staleChanges}
        isBusy={desk.isLocked}
        onRevert={desk.revert}
        buttonRef={discardButtonRef}
        onDiscard={desk.discard.ask}
      />
    );
  }
  if (reading.kind === "empty") {
    return (
      <NothingToPublish
        locale={locale}
        desk={desk}
        headingRef={emptyHeadingRef}
      />
    );
  }
  const { view } = reading;
  if (!view.hasRows) {
    return (
      <UnchangedDraftNotice
        buttonRef={discardButtonRef}
        onDiscard={desk.discard.ask}
      />
    );
  }
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
          onSaveAmount={desk.saveAmount}
          isBusy={desk.isLocked}
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
          isBusy={desk.isLocked}
          onToggle={desk.toggleProvisional}
        />
        <PublishHelp />
        <PublishButton
          buttonRef={publishButtonRef}
          changeCount={view.changeCount}
          canPublish={view.canPublish}
          hasUnsentAmount={desk.hasUnsentAmount}
          cannotJudgeDeletions={desk.deletion.kind === "cannot-judge"}
          isBusy={desk.isBusy}
          onPress={desk.requestPublish}
        />
      </div>
    </div>
  );
}

/** The pending changes cancel each other out: there is no row to list and nothing to publish, but they are still stored. */
function UnchangedDraftNotice({
  buttonRef,
  onDiscard,
}: {
  readonly buttonRef: RefObject<HTMLButtonElement | null>;
  readonly onDiscard: () => void;
}) {
  const translate = useTranslations();
  return (
    <DiscardNotice
      title={translate("priceDashboard.publish.unchangedDraftTitle")}
      body={translate("priceDashboard.publish.unchangedDraftBody")}
      buttonRef={buttonRef}
      onDiscard={onDiscard}
    />
  );
}

/** D7D: nothing waits, and the page says what the clients see now and shows the latest versions. The switch stays, because
 *  turning the provisional figures off is a draft change and would otherwise need an unrelated price first. */
function NothingToPublish({
  locale,
  desk,
  headingRef,
}: {
  readonly locale: AppLocale;
  readonly desk: PublishDesk;
  readonly headingRef: RefObject<HTMLElement | null>;
}) {
  const translate = useTranslations();
  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        <div className={styles.empty} data-testid="publish-empty">
          <p
            ref={headingRef as RefObject<HTMLParagraphElement | null>}
            tabIndex={-1}
            className={styles.emptyTitle}
          >
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
          versions={desk.history.list.versions.slice(0, LATEST_VERSIONS_SHOWN)}
          pendingCount={0}
        />
      </div>
      <div className={styles.aside}>
        <ProvisionalSwitch
          isProvisional={desk.isProvisional}
          isChanged={false}
          isBusy={desk.isLocked}
          onToggle={desk.toggleProvisional}
        />
      </div>
    </div>
  );
}

function PublishNoticeBanner({
  desk,
  cabinetNames,
  noticeRef,
}: {
  readonly desk: PublishDesk;
  readonly cabinetNames: Readonly<Record<string, string>>;
  readonly noticeRef: RefObject<HTMLDivElement | null>;
}) {
  const { notice } = desk;
  if (notice === undefined) return null;
  return (
    <div ref={noticeRef} tabIndex={-1} data-testid="publish-notice">
      <NoticeBody notice={notice} desk={desk} cabinetNames={cabinetNames} />
    </div>
  );
}

/** The question the phase asks, if it asks one: the provisional one in place of the plain one whenever the draft turns the
 *  figures off. */
function PublishDialogs({
  desk,
  returnFocusFallbackRef,
  discardFocusFallbackRef,
}: {
  readonly desk: PublishDesk;
  readonly returnFocusFallbackRef: RefObject<HTMLElement | null>;
  readonly discardFocusFallbackRef: RefObject<HTMLElement | null>;
}) {
  const { discard } = desk;
  return (
    <>
      <PublishQuestion
        desk={desk}
        returnFocusFallbackRef={returnFocusFallbackRef}
      />
      {discard.phase === "idle" ? null : (
        <DiscardDraftDialog
          returnFocusFallbackRef={discardFocusFallbackRef}
          isBusy={discard.phase === "discarding"}
          failure={discard.failure}
          canConfirm={discard.canConfirm}
          onConfirm={discard.confirm}
          onCancel={discard.cancel}
        />
      )}
    </>
  );
}

function PublishQuestion({
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
