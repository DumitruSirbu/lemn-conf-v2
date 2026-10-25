"use client";

// The share control: the settings surface's last section; the pill's ladder does not count it (ADR 0104
// decision 1). Owner-only: it renders nothing until the design holds the write credential and has been saved once
// (`hasPersistedSuccessfully`, ADR 0002 decision 17), which also keeps it off the share view, where
// `SharedDesignView` hydrates with `canWrite: false`.
// The link is shown once and lives only in `useShareLink`'s state: never the store, Web Storage, the URL or a
// log. It is a read-only text field, never an anchor, so nothing can prefetch it or record it in history.
import { type FocusEvent, type RefObject } from "react";
import type { DesignId } from "@lemnaria/configurator-domain";

import type { Content } from "@/i18n/content";
import { useContent } from "@/i18n/use-content";
import { useConfiguratorStore } from "@/store/configurator-store";

import { absoluteShareAddress } from "./absolute-share-address";
import styles from "./share-design.module.css";
import {
  useShareLink,
  type FailedShareOperation,
  type ShareControlState,
} from "./use-share-link";

export function ShareDesign() {
  const shareContent = useContent().share;
  const canWrite = useConfiguratorStore((state) => state.canWrite);
  const hasPersistedSuccessfully = useConfiguratorStore(
    (state) => state.hasPersistedSuccessfully,
  );
  const designId = useConfiguratorStore((state) => state.designId);

  if (canWrite !== true || !hasPersistedSuccessfully || designId === null)
    return null;
  return <ShareDesignControl designId={designId} content={shareContent} />;
}

/** Split from `ShareDesign` so the state machine exists only once the gate has answered; a nullable `designId`
 *  would leak into every branch below. */
function ShareDesignControl({
  designId,
  content,
}: {
  readonly designId: DesignId;
  readonly content: Content["share"];
}) {
  const { state, linkFieldRef, create, revoke, retryFailedOperation, copy } =
    useShareLink(designId);

  return (
    <section className={styles.section} data-testid="share-design">
      <h3 className={styles.heading}>{content.title}</h3>
      <p className={styles.description}>{content.description}</p>
      <ShareDesignBody
        state={state}
        content={content}
        linkFieldRef={linkFieldRef}
        onCreate={create}
        onRevoke={revoke}
        onRetry={retryFailedOperation}
        onCopy={copy}
      />
    </section>
  );
}

function ShareDesignBody({
  state,
  content,
  linkFieldRef,
  onCreate,
  onRevoke,
  onRetry,
  onCopy,
}: {
  readonly state: ShareControlState;
  readonly content: Content["share"];
  readonly linkFieldRef: RefObject<HTMLInputElement | null>;
  readonly onCreate: () => void;
  readonly onRevoke: () => void;
  readonly onRetry: () => void;
  readonly onCopy: (path: string) => void;
}) {
  switch (state.kind) {
    case "checking":
      // No skeleton: the sheet has just opened or an action is in flight, and every other state
      // below is reached from this one within one round trip.
      return null;
    case "none":
      return (
        <>
          {state.justRevoked ? (
            <p className={styles.status} data-testid="share-design-revoked">
              {content.revoked}
            </p>
          ) : null}
          <button
            type="button"
            className={styles.primary}
            data-testid="share-design-create"
            onClick={onCreate}
          >
            {content.create}
          </button>
        </>
      );
    case "active":
      return (
        <>
          <p className={styles.status} data-testid="share-design-status">
            {content.active}
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              data-testid="share-design-reissue"
              onClick={onCreate}
            >
              {content.reissue}
            </button>
            <button
              type="button"
              className={styles.revoke}
              data-testid="share-design-revoke"
              onClick={onRevoke}
            >
              {content.revoke}
            </button>
          </div>
          {/* A caption beside the button, not a modal step. */}
          <p
            className={styles.caption}
            data-testid="share-design-reissue-warning"
          >
            {content.reissueWarning}
          </p>
        </>
      );
    case "just-issued":
      return (
        <>
          <div className={styles.linkRow}>
            <input
              ref={linkFieldRef}
              type="text"
              readOnly
              className={styles.linkField}
              value={absoluteShareAddress(state.path)}
              data-testid="share-design-link"
              onFocus={selectFieldContents}
            />
            <button
              type="button"
              className={styles.copy}
              data-testid="share-design-copy"
              onClick={() => {
                onCopy(state.path);
              }}
            >
              {state.copied ? content.copied : content.copy}
            </button>
          </div>
          <p className={styles.caption} data-testid="share-design-shown-once">
            {content.shownOnce}
          </p>
        </>
      );
    case "error":
      return (
        <>
          <p className={styles.error} data-testid="share-design-error">
            {content.error}
          </p>
          <button
            type="button"
            className={styles.primary}
            data-testid="share-design-retry"
            onClick={onRetry}
          >
            {retryLabelFor(state.failedOperation, content)}
          </button>
        </>
      );
  }
}

/** Labelled by the operation `retryFailedOperation` is about to repeat: `create` after a failed create (re-issue is
 *  the same request), `revoke` after a failed revoke, and `retry` after a failed status read, which has no label of
 *  its own. */
function retryLabelFor(
  failedOperation: FailedShareOperation,
  content: Content["share"],
): string {
  if (failedOperation === "revoke") return content.revoke;
  if (failedOperation === "create") return content.create;
  return content.retry;
}

function selectFieldContents(event: FocusEvent<HTMLInputElement>): void {
  event.currentTarget.select();
}
