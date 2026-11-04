"use client";

import { useTranslations } from "next-intl";
import { useCallback, useMemo, useRef, useState, type RefObject } from "react";

import type { PriceBook } from "@lemnaria/configurator-domain";

import { FormNotice } from "@/account/account-form-parts";
import type { AppLocale } from "@/i18n/routing";
import { isolated } from "@/staff/bidi-isolate";
import { raiseStaffSessionExpired } from "@/staff/staff-session-expiry";
import { dayOf } from "@/staff/staff-kitchen-dates";
import { StaffShell, type StaffShellContext } from "@/staff/staff-shell";

import type {
  DashboardDraftWire,
  DashboardStateWire,
} from "./price-dashboard-wire-contract";
import {
  isStateRefusal,
  readStateOrRefusal,
  type DraftStateRefusal,
  type PublishClient,
  type RestoreOutcome,
} from "./publish-client";
import { orFailed } from "./async-seams";
import { FETCHING_PUBLISH_CLIENT } from "./fetching-publish-client";
import { pendingPriceCountOf } from "./cabinet-list-model";
import { RestoreDialog, type RestoreFailure } from "./publish-dialogs";
import {
  describeVersionDiff,
  planRestore,
  type VersionDetailInput,
} from "./publish-model";
import { PublishDraftUnreadableScreen } from "./publish-unreadable";
import { historyPathOf, publishPathOf } from "./publish-paths";
import styles from "./publish.module.css";
import { DiffSections } from "./publish-rows";

// A restore adds to the pending list and publishes nothing. Customers never see a version (ADR 0072 Amendment).

export interface VersionDetailScreenProps {
  readonly locale: AppLocale;
  readonly context: StaffShellContext;
  readonly input: VersionDetailInput;
  /** What writes. Left out, the routes'. */
  readonly client?: PublishClient | undefined;
}

interface RestoreState {
  readonly draft: DashboardDraftWire;
  /** The active book the draft is read against: read again when a write found the data moved. */
  readonly activeBook: PriceBook;
  readonly isDialogOpen: boolean;
  readonly isBusy: boolean;
  readonly failure: RestoreFailure | undefined;
  /** The restore found the stored draft unreadable: the page gives way to the one that gives it up. */
  readonly unreadableRevision: string | undefined;
  /** A restore has been done: the notice says so, and where the prices went. */
  readonly isRestored: boolean;
}

export function VersionDetailScreen({
  locale,
  context,
  input,
  client: suppliedClient,
}: VersionDetailScreenProps) {
  const client = suppliedClient ?? FETCHING_PUBLISH_CLIENT;
  const restoreButtonRef = useRef<HTMLButtonElement>(null);
  const [restore, setRestore] = useState<RestoreState>({
    draft: input.draft,
    activeBook: input.active.book,
    isDialogOpen: false,
    isBusy: false,
    failure: undefined,
    unreadableRevision: undefined,
    isRestored: false,
  });
  const plan = useMemo(
    () =>
      planRestore({
        archived: input.version.book,
        active: restore.activeBook,
        draft: restore.draft.changes,
      }),
    [input.version.book, restore.activeBook, restore.draft.changes],
  );
  const differingCount = plan.differingCount;
  const confirm = useCallback(() => {
    setRestore((held) => ({ ...held, isBusy: true, failure: undefined }));
    void askToRestore({
      client,
      versionId: input.version.versionId,
      draftRevision: restore.draft.draftRevision,
    }).then((answer) => {
      if (answer.outcome.kind === "session-ended") raiseStaffSessionExpired();
      setRestore((held) => settled(held, answer));
    });
  }, [client, input.version.versionId, restore.draft.draftRevision]);
  if (restore.unreadableRevision !== undefined) {
    return (
      <PublishDraftUnreadableScreen
        locale={locale}
        context={context}
        draftRevision={restore.unreadableRevision}
        client={client}
      />
    );
  }
  const shell = {
    ...context,
    pendingPriceCount: pendingPriceCountOf(restore.draft),
  };
  return (
    <StaffShell locale={locale} page="publish" context={shell}>
      <section className={styles.page} data-testid="version-detail">
        <VersionHeading locale={locale} input={input} />
        <RestoredNotice locale={locale} isShown={restore.isRestored} />
        <div className={styles.layout}>
          <VersionChanges input={input} />
          {input.version.state === "archived" ? (
            <RestoreBlock
              buttonRef={restoreButtonRef}
              versionNumber={input.version.sequenceNumber}
              differingCount={differingCount}
              onAsk={() => {
                setRestore((held) => ({ ...held, isDialogOpen: true }));
              }}
            />
          ) : null}
        </div>
        {restore.isDialogOpen ? (
          <RestoreDialog
            returnFocusFallbackRef={restoreButtonRef}
            versionNumber={input.version.sequenceNumber}
            differingCount={differingCount}
            replacedCount={plan.replacedChangeCount}
            isBusy={restore.isBusy}
            failure={restore.failure}
            onConfirm={confirm}
            onCancel={() => {
              setRestore((held) => ({ ...held, isDialogOpen: false }));
            }}
          />
        ) : null}
      </section>
    </StaffShell>
  );
}

interface RestoreAnswer {
  readonly outcome: RestoreOutcome;
  /** The state read again after a refusal as `changed-meanwhile`, so the next press carries the revision that is current. */
  readonly fresh: DashboardStateWire | DraftStateRefusal | undefined;
}

/** Asks the client to restore; a client that rejects has failed, and a refusal as changed-meanwhile reads the state again. */
async function askToRestore(request: {
  readonly client: PublishClient;
  readonly versionId: string;
  readonly draftRevision: string;
}): Promise<RestoreAnswer> {
  const { client, versionId, draftRevision } = request;
  const outcome = await orFailed<RestoreOutcome>(
    () => client.restore(versionId, { expectedDraftRevision: draftRevision }),
    { kind: "failed" },
  );
  if (outcome.kind !== "conflict") return { outcome, fresh: undefined };
  const fresh = await orFailed(() => readStateOrRefusal(client), undefined);
  return { outcome, fresh };
}

function settled(held: RestoreState, answer: RestoreAnswer): RestoreState {
  const { outcome } = answer;
  const idle = { ...held, isBusy: false };
  if (outcome.kind === "conflict" && isStateRefusal(answer.fresh)) {
    return settledByRefusal(idle, answer.fresh);
  }
  const fresh = isStateRefusal(answer.fresh) ? undefined : answer.fresh;
  switch (outcome.kind) {
    case "restored":
      return {
        ...idle,
        draft: outcome.draft,
        isDialogOpen: false,
        isRestored: true,
      };
    case "nothing-differs":
      return { ...idle, isDialogOpen: false };
    case "conflict":
      return {
        ...idle,
        failure: "conflict",
        draft: fresh?.draft ?? held.draft,
        activeBook: fresh?.active.book ?? held.activeBook,
      };
    case "version-not-found":
      return { ...idle, failure: "not-found" };
    case "candidate-refused":
      return { ...idle, failure: "candidate-refused" };
    case "draft-unreadable":
      return { ...idle, unreadableRevision: outcome.draftRevision };
    case "no-active-version":
      return { ...idle, failure: "no-active-version" };
    case "session-ended":
    case "failed":
      return { ...idle, failure: "save-failed" };
  }
}

function settledByRefusal(
  idle: RestoreState,
  refusal: DraftStateRefusal,
): RestoreState {
  return refusal.kind === "draft-unreadable"
    ? { ...idle, unreadableRevision: refusal.draftRevision }
    : { ...idle, failure: "no-active-version" };
}

function VersionHeading({
  locale,
  input,
}: {
  readonly locale: AppLocale;
  readonly input: VersionDetailInput;
}) {
  const translate = useTranslations();
  const { version, predecessor } = input;
  return (
    <div className={styles.heading}>
      <a className={styles.back} href={historyPathOf(locale)}>
        {translate("priceDashboard.publish.tabHistory")}
      </a>
      <h1 className={styles.title}>
        <span>{`${String(version.sequenceNumber)} · ${isolated(version.label)}`}</span>
        <span
          className={styles.chip}
          data-tone={version.state === "active" ? "active" : "plain"}
        >
          {version.state === "active"
            ? translate("priceDashboard.history.stateActive")
            : translate("priceDashboard.history.stateArchivedReadOnly")}
        </span>
      </h1>
      <p className={styles.subtitle}>
        {predecessor === undefined
          ? translate("priceDashboard.history.firstVersion")
          : translate("priceDashboard.history.detailSubtitle", {
              date: dayOf(version.publishedAt, locale),
              count: version.changes.length,
              previousId: String(predecessor.sequenceNumber),
            })}
      </p>
    </div>
  );
}

function VersionChanges({ input }: { readonly input: VersionDetailInput }) {
  const translate = useTranslations();
  const { version, predecessor } = input;
  const sections = useMemo(
    () =>
      predecessor === undefined
        ? []
        : describeVersionDiff({
            before: predecessor.book,
            after: version.book,
            changes: version.changes,
            cabinetNames: input.cabinetNames,
          }),
    [input, version, predecessor],
  );
  return (
    <div className={styles.main}>
      {predecessor === undefined ? null : (
        <DiffSections
          sections={sections}
          columns={{
            before: translate("priceDashboard.history.columnInVersion", {
              versionId: String(predecessor.sequenceNumber),
            }),
            after: translate("priceDashboard.history.columnInVersion", {
              versionId: String(version.sequenceNumber),
            }),
          }}
          onRevert={undefined}
          onSaveAmount={undefined}
          isBusy={false}
        />
      )}
    </div>
  );
}

function RestoreBlock({
  buttonRef,
  versionNumber,
  differingCount,
  onAsk,
}: {
  readonly buttonRef: RefObject<HTMLButtonElement | null>;
  readonly versionNumber: number;
  readonly differingCount: number;
  readonly onAsk: () => void;
}) {
  const translate = useTranslations();
  const isOff = differingCount === 0;
  return (
    <div className={styles.aside}>
      <div className={styles.restoreBlock}>
        <h2 className={styles.restoreTitle}>
          {translate("priceDashboard.history.restoreHeading")}
        </h2>
        <p className={styles.hint}>
          {translate("priceDashboard.history.restoreBody", {
            versionId: String(versionNumber),
          })}
        </p>
        <button
          ref={buttonRef}
          type="button"
          className={styles.secondary}
          aria-disabled={isOff ? true : undefined}
          onClick={isOff ? undefined : onAsk}
        >
          {translate("priceDashboard.history.restoreAction", {
            versionId: String(versionNumber),
          })}
        </button>
        {isOff ? (
          <p className={styles.hint}>
            {translate("priceDashboard.history.nothingToRestore", {
              versionId: String(versionNumber),
            })}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function RestoredNotice({
  locale,
  isShown,
}: {
  readonly locale: AppLocale;
  readonly isShown: boolean;
}) {
  const translate = useTranslations();
  if (!isShown) return null;
  return (
    <div data-testid="restore-notice">
      <FormNotice tone="success">
        {translate("priceDashboard.history.restoredNotice")}
        <span className={styles.noticeActions}>
          <a className={styles.inlineLink} href={publishPathOf(locale)}>
            {translate("priceDashboard.publish.tabPending")}
          </a>
        </span>
      </FormNotice>
    </div>
  );
}
