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
import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type RefObject,
} from "react";
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

/** Review round 1, L1.1: the failed operation travels with the error, so retrying repeats *that*
 *  request rather than always re-issuing — a status check that failed must not be retried as a
 *  create, which would silently mint a fresh link and kill whatever the sheet's last open already
 *  found active. */
type FailedOperation = "status" | "create" | "revoke";

type ShareControlState =
  | { readonly kind: "checking" }
  | { readonly kind: "none"; readonly justRevoked: boolean }
  | { readonly kind: "active" }
  | {
      readonly kind: "just-issued";
      readonly path: string;
      readonly copied: boolean;
    }
  | { readonly kind: "error"; readonly failedOperation: FailedOperation };

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
  const linkFieldRef = useRef<HTMLInputElement>(null);

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
        if (isCurrent) setState({ kind: "error", failedOperation: "status" });
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

  function checkStatus(): void {
    setState({ kind: "checking" });
    shareLinkStatus(designId)
      .then((active) => {
        setState({ kind: active ? "active" : "none", justRevoked: false });
      })
      .catch(() => {
        setState({ kind: "error", failedOperation: "status" });
      });
  }

  function create(): void {
    setState({ kind: "checking" });
    issueShareLink(designId)
      .then((path) => {
        setState({ kind: "just-issued", path, copied: false });
      })
      .catch(() => {
        setState({ kind: "error", failedOperation: "create" });
      });
  }

  function revoke(): void {
    setState({ kind: "checking" });
    revokeShareLink(designId)
      .then(() => {
        setState({ kind: "none", justRevoked: true });
      })
      .catch(() => {
        setState({ kind: "error", failedOperation: "revoke" });
      });
  }

  /** Review round 1, L1.1: repeats whichever request failed rather than always re-issuing — a
   *  status check retried as `create` would silently mint a fresh link, and a failed revoke
   *  retried as `create` would leave the link it was meant to kill standing beside a second one. */
  function retryFailedOperation(): void {
    if (state.kind !== "error") return;
    if (state.failedOperation === "status") {
      checkStatus();
      return;
    }
    if (state.failedOperation === "revoke") {
      revoke();
      return;
    }
    create();
  }

  /** Review round 1, L1.2: `copied` only follows a `writeText` that actually resolved — the field
   *  stays selected either way, so a customer whose browser withheld clipboard access (no secure
   *  context, no permission, no `navigator.clipboard` at all) can still copy by hand from a
   *  visibly-selected field instead of trusting a confirmation the browser never earned. Both
   *  branches of the promise are handled, so a rejection never reaches the console as unhandled. */
  function copy(path: string): void {
    linkFieldRef.current?.select();
    // TypeScript's own `lib.dom.d.ts` declares `Navigator.clipboard` as always present; a browser
    // without a secure context or without clipboard permission at all leaves it `undefined` in
    // reality, which is exactly the case this function exists to survive — read through a narrower
    // type than the DOM lib's own, so the runtime check below is not "always true" to the compiler.
    const clipboard = (navigator as { clipboard?: Clipboard }).clipboard;
    if (clipboard === undefined) return;

    clipboard.writeText(`${location.origin}${path}`).then(
      () => {
        setState((current) =>
          current.kind === "just-issued"
            ? { ...current, copied: true }
            : current,
        );
        if (copyTimeout.current !== undefined)
          clearTimeout(copyTimeout.current);
        copyTimeout.current = setTimeout(() => {
          setState((current) =>
            current.kind === "just-issued"
              ? { ...current, copied: false }
              : current,
          );
        }, COPY_FEEDBACK_MS);
      },
      () => {
        linkFieldRef.current?.select();
      },
    );
  }

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
              ref={linkFieldRef}
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
            onClick={onRetry}
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
