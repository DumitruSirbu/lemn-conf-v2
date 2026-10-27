"use client";

import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";

import { FormNotice } from "@/account/account-form-parts";
import type { AppLocale } from "@/i18n/routing";
import { isolated } from "@/staff/bidi-isolate";
import { dayOf } from "@/staff/staff-kitchen-dates";
import { StaffShell, type StaffShellContext } from "@/staff/staff-shell";

import type { DashboardDraftWire } from "./price-dashboard-wire-contract";
import {
  defaultPublishClient,
  type PublishClient,
  type RestoreOutcome,
} from "./publish-client";
import { RestoreDialog } from "./publish-dialogs";
import {
  describeVersionDiff,
  planRestore,
  type VersionDetailInput,
} from "./publish-model";
import { historyPathOf, publishPathOf } from "./publish-paths";
import styles from "./publish.module.css";
import { DiffSections } from "./publish-rows";

// One version, read-only (frames D8B, D8C): what it changed against the version before it, and the one thing that can be done
// with it, restoring its prices into "De publicat". A restore adds to the pending list and publishes nothing, so the
// clients' prices do not move until the person publishes as usual. Customers never see a version (ADR 0072 Amendment).

export interface VersionDetailScreenProps {
  readonly locale: AppLocale;
  readonly context: StaffShellContext;
  readonly input: VersionDetailInput;
  /** What writes. Left out, the build's own: an in-memory one outside production, one that fails inside it. */
  readonly client?: PublishClient | undefined;
}

type RestoreFailure = "save-failed" | "conflict";

interface RestoreState {
  readonly draft: DashboardDraftWire;
  readonly isDialogOpen: boolean;
  readonly isBusy: boolean;
  readonly failure: RestoreFailure | undefined;
  /** A restore has been done: the notice says so, and where the prices went. */
  readonly isRestored: boolean;
}

export function VersionDetailScreen({
  locale,
  context,
  input,
  client: suppliedClient,
}: VersionDetailScreenProps) {
  const client = useMemo(
    () => suppliedClient ?? defaultClientFor(input),
    [suppliedClient, input],
  );
  const [restore, setRestore] = useState<RestoreState>({
    draft: input.draft,
    isDialogOpen: false,
    isBusy: false,
    failure: undefined,
    isRestored: false,
  });
  const differingCount = useMemo(
    () =>
      planRestore({
        archived: input.version.book,
        active: input.active.book,
        draft: restore.draft.changes,
      }).differingCount,
    [input, restore.draft.changes],
  );
  const confirm = useCallback(() => {
    setRestore((held) => ({ ...held, isBusy: true, failure: undefined }));
    void client
      .restore(input.version.versionId, {
        expectedDraftRevision: restore.draft.draftRevision,
      })
      .then((outcome) => {
        setRestore((held) => settled(held, outcome));
      });
  }, [client, input.version.versionId, restore.draft.draftRevision]);
  const shell = {
    ...context,
    pendingPriceCount: restore.draft.changes.length,
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
            versionNumber={input.version.sequenceNumber}
            differingCount={differingCount}
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

function settled(held: RestoreState, outcome: RestoreOutcome): RestoreState {
  const idle = { ...held, isBusy: false };
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
      return { ...idle, failure: "conflict" };
    case "failed":
      return { ...idle, failure: "save-failed" };
  }
}

function defaultClientFor(input: VersionDetailInput): PublishClient {
  return defaultPublishClient({
    state: {
      active: {
        versionId: "",
        book: input.active.book,
        availability: { revision: "0", disabled: [] },
        sequenceNumber: input.active.sequenceNumber,
        label: "",
        publishedAt: "",
      },
      draft: input.draft,
    },
    archived: new Map([[input.version.versionId, input.version.book]]),
  });
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
          isBusy={false}
        />
      )}
    </div>
  );
}

function RestoreBlock({
  versionNumber,
  differingCount,
  onAsk,
}: {
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
