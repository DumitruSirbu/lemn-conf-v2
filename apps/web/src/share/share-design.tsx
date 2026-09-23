"use client";

// D10's share control — the settings surface's last section (ADR 0104 decision 1: no invented
// chrome slot; the pill's ladder does not count it). Owner-only: it renders nothing until the
// design both holds the write credential and has been saved at least once
// (`hasPersistedSuccessfully`, write-path decision 17 — a design that has never been written has no
// row for a link to point at). That gate alone is what keeps this control off the share view too:
// `SharedDesignView` hydrates with `canWrite: false`, so `ShareDesign` renders nothing there without
// any variant-specific code of its own.
//
// **The link is shown once and lives only in this component's state** (D10): never the store, never
// Web Storage, never the URL, never a log. It is rendered as a read-only text field, never as an
// anchor — no navigation, no prefetch, nothing a crawler or a browser history could pick up.
import { useEffect, useRef, useState, type FocusEvent } from "react";
import type { DesignId } from "@lemnaria/configurator-domain";

import type { Content } from "@/i18n/content";
import { useContent } from "@/i18n/use-content";
import {
  issueShareLink,
  revokeShareLink,
  shareLinkStatus,
} from "@/persistence/share-link-client";
import { useConfiguratorStore } from "@/store/configurator-store";

import styles from "./share-design.module.css";

/** How long *Copiat* / *Copiat* replaces *Copiază* before reverting — long enough to read, short
 *  enough that a second copy a minute later shows the real button again rather than a stale one. */
const COPY_FEEDBACK_MS = 2000;

type ShareControlState =
  | { readonly kind: "checking" }
  | { readonly kind: "none"; readonly justRevoked: boolean }
  | { readonly kind: "active" }
  | {
      readonly kind: "just-issued";
      readonly path: string;
      readonly copied: boolean;
    }
  | { readonly kind: "error" };

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

/** Split from `ShareDesign` so its state machine only ever exists once the gate above has already
 *  answered — a `designId` that can be `null` would leak into every branch below as a case nothing
 *  can act on. */
function ShareDesignControl({
  designId,
  content,
}: {
  readonly designId: DesignId;
  readonly content: Content["share"];
}) {
  const [state, setState] = useState<ShareControlState>({ kind: "checking" });
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  // The sheet's own open is the one moment this reads the status (D10) — not on a schedule, and not
  // re-read while the sheet stays open, so a revoke or re-issue this component itself performed is
  // never second-guessed by a stale poll landing after it.
  useEffect(() => {
    let isCurrent = true;
    shareLinkStatus(designId)
      .then((active) => {
        if (isCurrent)
          setState({ kind: active ? "active" : "none", justRevoked: false });
      })
      .catch(() => {
        if (isCurrent) setState({ kind: "error" });
      });
    return () => {
      isCurrent = false;
    };
  }, [designId]);

  useEffect(
    () => () => {
      if (copyTimeout.current !== undefined) clearTimeout(copyTimeout.current);
    },
    [],
  );

  function create(): void {
    setState({ kind: "checking" });
    issueShareLink(designId)
      .then((path) => {
        setState({ kind: "just-issued", path, copied: false });
      })
      .catch(() => {
        setState({ kind: "error" });
      });
  }

  function revoke(): void {
    setState({ kind: "checking" });
    revokeShareLink(designId)
      .then(() => {
        setState({ kind: "none", justRevoked: true });
      })
      .catch(() => {
        setState({ kind: "error" });
      });
  }

  function copy(path: string): void {
    void navigator.clipboard.writeText(`${location.origin}${path}`);
    setState((current) =>
      current.kind === "just-issued" ? { ...current, copied: true } : current,
    );
    if (copyTimeout.current !== undefined) clearTimeout(copyTimeout.current);
    copyTimeout.current = setTimeout(() => {
      setState((current) =>
        current.kind === "just-issued"
          ? { ...current, copied: false }
          : current,
      );
    }, COPY_FEEDBACK_MS);
  }

  return (
    <section className={styles.section} data-testid="share-design">
      <h3 className={styles.heading}>{content.title}</h3>
      <p className={styles.description}>{content.description}</p>
      <ShareDesignBody
        state={state}
        content={content}
        onCreate={create}
        onRevoke={revoke}
        onCopy={copy}
      />
    </section>
  );
}

function ShareDesignBody({
  state,
  content,
  onCreate,
  onRevoke,
  onCopy,
}: {
  readonly state: ShareControlState;
  readonly content: Content["share"];
  readonly onCreate: () => void;
  readonly onRevoke: () => void;
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
          {/* Beside the button it warns about, not a modal step: D10 lists it as this state's own
              caption, and re-issuing has one irreversible consequence to state, not a question to
              ask. */}
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
              type="text"
              readOnly
              className={styles.linkField}
              value={`${location.origin}${state.path}`}
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
            onClick={onCreate}
          >
            {content.create}
          </button>
        </>
      );
  }
}

function selectFieldContents(event: FocusEvent<HTMLInputElement>): void {
  event.currentTarget.select();
}
