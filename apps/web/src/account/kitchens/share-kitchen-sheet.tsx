"use client";

import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type RefObject,
} from "react";

import { useAccountKitCopy, useAccountKitchensCopy } from "@/i18n/use-content";
import { absoluteShareAddress } from "@/share/absolute-share-address";
import {
  useShareLink,
  type ShareControlState,
  type ShareLink,
} from "@/share/use-share-link";

import { AccountDialog } from "../account-dialog";
import accountStyles from "../account.module.css";
import { FormNotice } from "../account-form-parts";
import styles from "./kitchens.module.css";

// "Link de partajare" (Lot 2 frames A9G and A9G2). The state machine is the editor's own (`useShareLink`), against the
// same endpoints with the account's session as the credential. The link exists in the browser only at the moment it is
// issued, so an active link is told as active and a new one replaces it; stopping it is asked in a second dialog
// before anything is sent.
//
// Mount it as a direct child of the screen's `<main>`, as `AccountDialog` asks.

export interface ShareKitchenSheetProps {
  readonly kitchenId: string;
  readonly onClose: () => void;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
}

type Step = "sheet" | "confirm-stop";

export function ShareKitchenSheet({
  kitchenId,
  onClose,
  returnFocusRef,
}: ShareKitchenSheetProps) {
  const share = useShareLink(kitchenId);
  const [step, setStep] = useState<Step>("sheet");
  return step === "sheet" ? (
    <ShareDialog
      share={share}
      onAskStop={() => {
        setStep("confirm-stop");
      }}
      onClose={onClose}
      returnFocusRef={returnFocusRef}
    />
  ) : (
    <StopShareDialog
      onStop={() => {
        share.revoke();
        setStep("sheet");
      }}
      onBack={() => {
        setStep("sheet");
      }}
      returnFocusRef={returnFocusRef}
    />
  );
}

function ShareDialog({
  share,
  onAskStop,
  onClose,
  returnFocusRef,
}: {
  readonly share: ShareLink;
  readonly onAskStop: () => void;
  readonly onClose: () => void;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
}) {
  const copy = useAccountKitchensCopy();
  const closeRef = useRef<HTMLButtonElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  useFocusPrimaryWhenReady(share.state.kind, primaryRef, closeRef);

  return (
    <AccountDialog
      kind="standard"
      title={copy.share.title}
      description={copy.share.body}
      confirm={{
        label: copy.share.close,
        busyLabel: copy.share.close,
        isBusy: false,
        onPress: onClose,
      }}
      dismiss={onClose}
      confirmRef={closeRef}
      confirmTone="quiet"
      returnFocusFallbackRef={returnFocusRef}
    >
      <ShareBody share={share} onAskStop={onAskStop} primaryRef={primaryRef} />
    </AccountDialog>
  );
}

function StopShareDialog({
  onStop,
  onBack,
  returnFocusRef,
}: {
  readonly onStop: () => void;
  readonly onBack: () => void;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
}) {
  const copy = useAccountKitchensCopy();
  return (
    <AccountDialog
      kind="destructive"
      title={copy.share.title}
      description={copy.share.stopWarning}
      confirm={{
        label: copy.share.stop,
        busyLabel: copy.share.stopping,
        isBusy: false,
        onPress: onStop,
      }}
      cancel={{ label: copy.share.cancel, onPress: onBack }}
      returnFocusFallbackRef={returnFocusRef}
    />
  );
}

/** The states that draw the sheet's primary act: create the link, copy the one just made, or retry the request that
 *  failed. An active link draws none: it cannot be shown again, and the acts it offers (a new link, stop) end the old one. */
const STATES_WITH_PRIMARY: readonly ShareControlState["kind"][] = [
  "none",
  "just-issued",
  "error",
];

/** The sheet opens before the status is known, so it opens on its close button. When an answer comes and nothing else
 *  has been pressed, focus goes to the primary act the answer draws. The same holds after a press: the button that was
 *  pressed went with the request. Focus the person has put elsewhere is theirs. */
function useFocusPrimaryWhenReady(
  kind: ShareControlState["kind"],
  primaryRef: RefObject<HTMLButtonElement | null>,
  closeRef: RefObject<HTMLButtonElement | null>,
): void {
  const previousKind = useRef(kind);
  useEffect(() => {
    const wasChecking = previousKind.current === "checking";
    previousKind.current = kind;
    if (!wasChecking || !STATES_WITH_PRIMARY.includes(kind)) return;
    if (isFocusAdrift(closeRef.current)) primaryRef.current?.focus();
  }, [kind, primaryRef, closeRef]);
}

/** Whether focus is nowhere the person put it: on the body (the button they pressed has gone), on the dialog's own
 *  surface or on its close button, where opening left it. */
function isFocusAdrift(closeButton: HTMLButtonElement | null): boolean {
  const holder = document.activeElement;
  return (
    holder === null ||
    holder === document.body ||
    holder === closeButton ||
    holder.getAttribute("role") === "dialog"
  );
}

function ShareBody({
  share,
  onAskStop,
  primaryRef,
}: {
  readonly share: ShareLink;
  readonly onAskStop: () => void;
  readonly primaryRef: RefObject<HTMLButtonElement | null>;
}) {
  const copy = useAccountKitchensCopy();
  const kit = useAccountKitCopy();
  const { state } = share;
  switch (state.kind) {
    case "checking":
      return null;
    case "none":
      return (
        <>
          {state.justRevoked ? (
            <p role="status" className={styles.shareStatus}>
              {copy.share.stopped}
            </p>
          ) : null}
          <ShareAction
            label={copy.share.create}
            buttonRef={primaryRef}
            onPress={share.create}
          />
        </>
      );
    case "active":
      return (
        <>
          <p className={styles.shareStatus}>{copy.share.active}</p>
          <div className={styles.shareActions}>
            <ShareAction
              label={copy.share.reissue}
              tone="quiet"
              onPress={share.create}
            />
            <ShareAction
              label={copy.share.stop}
              tone="destructive"
              onPress={onAskStop}
            />
          </div>
          <p className={styles.shareCaption}>{copy.share.reissueWarning}</p>
        </>
      );
    case "just-issued":
      return (
        <>
          <IssuedLink share={share} path={state.path} primaryRef={primaryRef} />
          <ShareAction
            label={copy.share.stop}
            tone="destructive"
            onPress={onAskStop}
          />
          <p className={styles.shareCaption}>{copy.share.shownOnce}</p>
        </>
      );
    case "error":
      return (
        <>
          <FormNotice tone="error">{copy.share.error}</FormNotice>
          <ShareAction
            label={kit.retry}
            buttonRef={primaryRef}
            onPress={share.retryFailedOperation}
          />
        </>
      );
  }
}

/** The link just made, in a field to select and a button to copy it. It is a read-only field and never an anchor, so
 *  nothing can prefetch it or record it in history. */
function IssuedLink({
  share,
  path,
  primaryRef,
}: {
  readonly share: ShareLink;
  readonly path: string;
  readonly primaryRef: RefObject<HTMLButtonElement | null>;
}) {
  const copy = useAccountKitchensCopy();
  const isCopied = share.state.kind === "just-issued" && share.state.copied;
  return (
    <div className={styles.shareLinkBlock}>
      <label className={styles.shareLinkLabel}>
        {copy.share.linkLabel}
        <input
          ref={share.linkFieldRef}
          type="text"
          readOnly
          className={styles.shareLinkField}
          value={absoluteShareAddress(path)}
          onFocus={selectFieldContents}
        />
      </label>
      <ShareAction
        label={isCopied ? copy.share.copied : copy.share.copy}
        buttonRef={primaryRef}
        onPress={() => {
          share.copy(path);
        }}
      />
    </div>
  );
}

function ShareAction({
  label,
  onPress,
  buttonRef,
  tone = "primary",
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly buttonRef?: RefObject<HTMLButtonElement | null>;
  readonly tone?: "primary" | "quiet" | "destructive";
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={SHARE_ACTION_CLASS[tone]}
      onClick={onPress}
    >
      {label}
    </button>
  );
}

const SHARE_ACTION_CLASS: Readonly<
  Record<"primary" | "quiet" | "destructive", string>
> = {
  primary: accountStyles.dialogPrimary ?? "",
  quiet: accountStyles.dialogSecondary ?? "",
  destructive: accountStyles.dialogDestructive ?? "",
};

function selectFieldContents(event: FocusEvent<HTMLInputElement>): void {
  event.currentTarget.select();
}
