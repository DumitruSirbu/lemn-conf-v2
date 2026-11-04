"use client";

import { useTranslations } from "next-intl";
import { useRef, useState, type RefObject } from "react";

import { FormNotice } from "@/account/account-form-parts";
import type { AppLocale } from "@/i18n/routing";
import { StaffShell, type StaffShellContext } from "@/staff/staff-shell";

import { FETCHING_PUBLISH_CLIENT } from "./fetching-publish-client";
import { DiscardDraftDialog } from "./publish-dialogs";
import { DiscardNotice } from "./publish-discard-notice";
import type { PublishClient } from "./publish-client";
import { publishPathOf } from "./publish-paths";
import styles from "./publish.module.css";
import { useDiscardDraft } from "./use-discard-draft";
import { useFocusWhenLost } from "./use-focus-when-lost";

// The stored draft cannot be read, so neither it nor the active prices can be shown, and the one write that works is
// giving it up. The frame keeps no count of pending prices: an unreadable draft is not an empty one.

type Resolution = "discarded" | "changed-meanwhile";

export interface PublishDraftUnreadableScreenProps {
  readonly locale: AppLocale;
  readonly context: StaffShellContext;
  /** The revision the read named: what the discard is made at. */
  readonly draftRevision: string;
  /** What writes. Left out, the routes'. */
  readonly client?: PublishClient | undefined;
}

export function PublishDraftUnreadableScreen({
  locale,
  context,
  draftRevision,
  client: suppliedClient,
}: PublishDraftUnreadableScreenProps) {
  const translate = useTranslations();
  const client = suppliedClient ?? FETCHING_PUBLISH_CLIENT;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const resolvedRef = useRef<HTMLDivElement>(null);
  const [resolution, setResolution] = useState<Resolution | undefined>(
    undefined,
  );
  const discard = useDiscardDraft({
    client,
    draftRevision,
    isOffered: true,
    onDiscarded: () => {
      setResolution("discarded");
    },
    onConflict: () => {
      setResolution("changed-meanwhile");
    },
  });
  useFocusWhenLost(resolvedRef, resolution);
  return (
    <StaffShell locale={locale} page="publish" context={context}>
      <section className={styles.page} data-testid="publish-unreadable">
        <h1 className={styles.title}>
          {translate("priceDashboard.publish.title")}
        </h1>
        {resolution === undefined ? (
          <DiscardNotice
            title={translate("priceDashboard.publish.unreadableTitle")}
            body={translate("priceDashboard.publish.unreadableBody")}
            buttonRef={buttonRef}
            onDiscard={discard.ask}
          />
        ) : null}
        <Resolved
          locale={locale}
          resolution={resolution}
          resolvedRef={resolvedRef}
        />
        {discard.phase === "idle" ? null : (
          <DiscardDraftDialog
            returnFocusFallbackRef={buttonRef}
            isBusy={discard.phase === "discarding"}
            failure={discard.failure}
            canConfirm={discard.canConfirm}
            onConfirm={discard.confirm}
            onCancel={discard.cancel}
          />
        )}
      </section>
    </StaffShell>
  );
}

function Resolved({
  locale,
  resolution,
  resolvedRef,
}: {
  readonly locale: AppLocale;
  readonly resolution: Resolution | undefined;
  readonly resolvedRef: RefObject<HTMLDivElement | null>;
}) {
  const translate = useTranslations();
  if (resolution === undefined) return null;
  return (
    <div
      ref={resolvedRef}
      tabIndex={-1}
      data-testid="publish-unreadable-resolved"
    >
      <FormNotice tone={resolution === "discarded" ? "success" : "warning"}>
        {resolution === "discarded"
          ? translate("priceDashboard.publish.discardedBody")
          : translate("priceDashboard.publish.discardChangedMeanwhile")}
        <span className={styles.noticeActions}>
          <a className={styles.inlineLink} href={publishPathOf(locale)}>
            {translate("priceDashboard.publish.tabPending")}
          </a>
        </span>
      </FormNotice>
    </div>
  );
}
