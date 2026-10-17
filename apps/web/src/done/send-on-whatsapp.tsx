"use client";

// The link is made by a press and opened by a plain anchor: a window opened after an `await` is not the customer's
// gesture on a phone browser. It lives only in component state, never the store, Web Storage, our URL or a log.
// See ADR 0160 D8.
import type { DesignId } from "@lemnaria/configurator-domain";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { useContent } from "@/i18n/use-content";
import {
  issueShareLink,
  shareLinkStatus,
} from "@/persistence/share-link-client";
import { absoluteShareAddress } from "@/share/absolute-share-address";
import { shopWhatsAppDigits } from "@/shop/shop-phone";
import { useConfiguratorStore } from "@/store/configurator-store";

import styles from "./done.module.css";

/** The one address a message is handed to: the shop's WhatsApp, with the message as the only parameter. */
const WHATSAPP_MESSAGE_ADDRESS = `https://wa.me/${shopWhatsAppDigits()}?text=`;

/** The failed request travels with the failure, so a retry repeats *that* request: a failed status read retried as an
 *  issue would replace a link the customer had not agreed to replace. */
type FailedRequest = "status" | "issue";

type WhatsappStep =
  | { readonly kind: "idle" }
  | { readonly kind: "checking" }
  | { readonly kind: "confirming-reissue" }
  | { readonly kind: "issuing" }
  | { readonly kind: "ready"; readonly shareAddress: string }
  | { readonly kind: "failed"; readonly failedRequest: FailedRequest };

interface SendOnWhatsappProps {
  readonly designId: DesignId;
  /** The request's reference, which the message to the shop carries so the shop can find the request the link belongs
   *  to; the screen does not show it. */
  readonly reference: string;
}

/** Drawn for the design this page is about, once it has been saved, unless this browser is known to hold no write
 *  access. Write access is not known after a reload (`"checking"`, and nothing on `/done` probes it), so only `false`
 *  hides the action; the share route checks the write credential on every press. The store is never written here
 *  (ADR 0163 d4). */
export function SendOnWhatsapp({ designId, reference }: SendOnWhatsappProps) {
  const canWrite = useConfiguratorStore((state) => state.canWrite);
  const hasPersistedSuccessfully = useConfiguratorStore(
    (state) => state.hasPersistedSuccessfully,
  );
  const heldDesignId = useConfiguratorStore((state) => state.designId);

  const mayShare =
    canWrite !== false && hasPersistedSuccessfully && heldDesignId === designId;
  return mayShare ? (
    <WhatsappActionControl designId={designId} reference={reference} />
  ) : null;
}

function WhatsappActionControl({ designId, reference }: SendOnWhatsappProps) {
  const { step, checkStatus, goOn, retry } = useWhatsappShareLink(designId);
  const focusPrimaryControl = useFocusOnChange(step.kind);
  const noteId = useId();

  return (
    <div className={styles.whatsapp} data-testid="done-whatsapp">
      <StepNote step={step} noteId={noteId} />
      <StepControl
        step={step}
        noteId={noteId}
        reference={reference}
        controlRef={focusPrimaryControl}
        onSend={checkStatus}
        onGoOn={goOn}
        onRetry={retry}
      />
    </div>
  );
}

interface WhatsappShareLink {
  readonly step: WhatsappStep;
  readonly checkStatus: () => void;
  readonly goOn: () => void;
  readonly retry: () => void;
}

/** The status-then-issue steps of making the customer's link, one request in flight at a time. */
function useWhatsappShareLink(designId: DesignId): WhatsappShareLink {
  const [step, setStep] = useState<WhatsappStep>({ kind: "idle" });
  const isRequestInFlight = useRef(false);

  function claimTheRequest(): boolean {
    if (isRequestInFlight.current) return false;
    isRequestInFlight.current = true;
    return true;
  }

  function settleInto(next: WhatsappStep): void {
    isRequestInFlight.current = false;
    setStep(next);
  }

  function checkStatus(): void {
    if (!claimTheRequest()) return;
    setStep({ kind: "checking" });
    shareLinkStatus(designId)
      .then((isActive) => {
        if (isActive) settleInto({ kind: "confirming-reissue" });
        else issue();
      })
      .catch(() => {
        settleInto({ kind: "failed", failedRequest: "status" });
      });
  }

  function goOn(): void {
    if (claimTheRequest()) issue();
  }

  function issue(): void {
    setStep({ kind: "issuing" });
    issueShareLink(designId)
      .then((path) => {
        settleInto({ kind: "ready", shareAddress: absoluteShareAddress(path) });
      })
      .catch(() => {
        settleInto({ kind: "failed", failedRequest: "issue" });
      });
  }

  function retry(): void {
    if (step.kind !== "failed") return;
    if (step.failedRequest === "status") checkStatus();
    else goOn();
  }

  return { step, checkStatus, goOn, retry };
}

/** Focus follows the one control the customer is to press next when the step changes under them: the button they
 *  pressed is replaced by the warning's, the link or the retry. Never on arrival, where the `h1` has it. */
function useFocusOnChange(kind: WhatsappStep["kind"]) {
  const control = useRef<HTMLElement | null>(null);
  const previousKind = useRef(kind);
  useEffect(() => {
    if (previousKind.current !== kind) control.current?.focus();
    previousKind.current = kind;
  }, [kind]);
  return useCallback((element: HTMLElement | null) => {
    control.current = element;
  }, []);
}

/** The live region is drawn in every step, empty or not, so that a sentence put into it is announced. The warning
 *  before a link is replaced, and the failure, which says only that the link could not be made: no status and no code
 *  of the request reaches the page. */
function StepNote({
  step,
  noteId,
}: {
  readonly step: WhatsappStep;
  readonly noteId: string;
}) {
  const share = useContent().share;
  return (
    <div role="status">
      {step.kind === "confirming-reissue" ? (
        <p
          id={noteId}
          className={styles.whatsappNote}
          data-testid="done-whatsapp-reissue-warning"
        >
          {share.reissueWarning}
        </p>
      ) : null}
      {step.kind === "failed" ? (
        <p
          id={noteId}
          className={styles.whatsappError}
          data-testid="done-whatsapp-error"
        >
          {share.error}
        </p>
      ) : null}
    </div>
  );
}

interface StepControlProps {
  readonly step: WhatsappStep;
  readonly noteId: string;
  readonly reference: string;
  readonly controlRef: (element: HTMLElement | null) => void;
  readonly onSend: () => void;
  readonly onGoOn: () => void;
  readonly onRetry: () => void;
}

/** Each step has one control. Busy keeps the button where it is and focusable, as the contact retry does
 *  (`aria-disabled`, not `disabled`); the press is refused by the component, which holds the one request in flight. */
function StepControl({
  step,
  noteId,
  reference,
  controlRef,
  onSend,
  onGoOn,
  onRetry,
}: StepControlProps) {
  const content = useContent();
  const buttonProps = { type: "button", ref: controlRef } as const;

  switch (step.kind) {
    case "idle":
    case "checking":
    case "issuing": {
      const isBusy = step.kind !== "idle";
      return (
        <button
          {...buttonProps}
          className={styles.whatsappAction}
          aria-disabled={isBusy}
          aria-busy={isBusy}
          data-testid="done-whatsapp-send"
          onClick={onSend}
        >
          {content.submissionResult.sendOnWhatsapp}
        </button>
      );
    }
    case "confirming-reissue":
      return (
        <button
          {...buttonProps}
          className={styles.whatsappAction}
          aria-describedby={noteId}
          data-testid="done-whatsapp-go-on"
          onClick={onGoOn}
        >
          {content.share.reissue}
        </button>
      );
    case "ready":
      return (
        <a
          ref={controlRef}
          className={styles.whatsappAction}
          href={whatsappAddress(
            content.submissionResult.whatsappMessageToShop({
              reference,
              link: step.shareAddress,
            }),
          )}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="done-whatsapp-open"
        >
          {content.submissionResult.openWhatsapp}
        </a>
      );
    case "failed":
      return (
        <button
          {...buttonProps}
          className={styles.whatsappAction}
          aria-describedby={noteId}
          data-testid="done-whatsapp-retry"
          onClick={onRetry}
        >
          {content.share.retry}
        </button>
      );
  }
}

/** The whole message, encoded as one value: nothing else is in the address. */
function whatsappAddress(message: string): string {
  return `${WHATSAPP_MESSAGE_ADDRESS}${encodeURIComponent(message)}`;
}
