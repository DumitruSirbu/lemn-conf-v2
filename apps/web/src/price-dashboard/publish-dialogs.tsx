"use client";

import { useTranslations } from "next-intl";
import { useId, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

import { AccountDialog } from "@/account/account-dialog";
import { FormNotice } from "@/account/account-form-parts";

import styles from "./publish.module.css";

// The three questions of the publish screens (frames D7B, D7C, D8C). Each opens on the safe action and Escape takes it: "Anulează"
// for the publish and the restore, which change what clients see or the pending list, and the checkbox for the provisional
// question, which does nothing by itself. While the request is out nothing leaves the dialog (`AccountDialog` holds that).
// They are drawn into the frame's `<main>`, as `AccountDialog` asks, so the page behind goes inert.

function InMain({ children }: { readonly children: ReactNode }) {
  return createPortal(
    children,
    document.querySelector("main") ?? document.body,
  );
}

/** Where focus goes when the control that opened a dialog was not focused by the press (Safari and Firefox). */
interface FocusFallback {
  readonly returnFocusFallbackRef: RefObject<HTMLElement | null>;
}

export interface PublishConfirmDialogProps extends FocusFallback {
  readonly versionName: string;
  readonly changeCount: number;
  readonly isBusy: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** D7B: publishing makes every pending price active at once, for new kitchens and saved ones. */
export function PublishConfirmDialog({
  versionName,
  changeCount,
  isBusy,
  onConfirm,
  onCancel,
  returnFocusFallbackRef,
}: PublishConfirmDialogProps) {
  const translate = useTranslations();
  return (
    <InMain>
      <AccountDialog
        kind="destructive"
        confirmTone="primary"
        title={translate("priceDashboard.publish.confirmTitle", {
          versionName,
        })}
        description={translate("priceDashboard.publish.confirmBody", {
          count: changeCount,
        })}
        returnFocusFallbackRef={returnFocusFallbackRef}
        confirm={{
          label: translate("priceDashboard.publish.confirmAction"),
          busyLabel: translate("priceDashboard.publish.publishing"),
          isBusy,
          onPress: onConfirm,
        }}
        cancel={{
          label: translate("priceDashboard.common.cancel"),
          onPress: onCancel,
        }}
      />
    </InMain>
  );
}

export interface ProvisionalOffDialogProps extends FocusFallback {
  readonly isChecked: boolean;
  readonly isBusy: boolean;
  readonly onCheckedChange: (isChecked: boolean) => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** D7C: the draft turns "Sume provizorii" off. The confirmation is off until the person says the prices are the shop's. */
export function ProvisionalOffDialog({
  isChecked,
  isBusy,
  onCheckedChange,
  onConfirm,
  onCancel,
  returnFocusFallbackRef,
}: ProvisionalOffDialogProps) {
  const translate = useTranslations();
  const checkRef = useRef<HTMLInputElement>(null);
  const warningId = useId();
  const checkId = useId();
  return (
    <InMain>
      <AccountDialog
        kind="destructive"
        title={translate("priceDashboard.publish.provisionalOffTitle")}
        alsoDescribedById={warningId}
        initialFocusRef={checkRef}
        returnFocusFallbackRef={returnFocusFallbackRef}
        confirm={{
          label: translate("priceDashboard.publish.provisionalOffConfirm"),
          busyLabel: translate("priceDashboard.publish.publishing"),
          isBusy,
          isOff: !isChecked,
          onPress: onConfirm,
        }}
        cancel={{
          label: translate("priceDashboard.common.cancel"),
          onPress: onCancel,
        }}
      >
        <FormNotice
          id={warningId}
          tone="warning"
          title={translate("priceDashboard.publish.provisionalOffWarningTitle")}
        >
          {translate("priceDashboard.publish.provisionalOffWarning")}
        </FormNotice>
        <label className={styles.checkRow} htmlFor={checkId}>
          <input
            ref={checkRef}
            id={checkId}
            type="checkbox"
            className={styles.checkInput}
            checked={isChecked}
            onChange={(event) => {
              onCheckedChange(event.target.checked);
            }}
          />
          <span>{translate("priceDashboard.publish.provisionalOffCheck")}</span>
        </label>
      </AccountDialog>
    </InMain>
  );
}

export interface RestoreDialogProps extends FocusFallback {
  readonly versionNumber: number;
  readonly differingCount: number;
  readonly isBusy: boolean;
  readonly failure: "save-failed" | "conflict" | undefined;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** D8C: restoring adds the old prices to "De publicat". It publishes nothing, so nothing changes for clients. */
export function RestoreDialog({
  versionNumber,
  differingCount,
  isBusy,
  failure,
  onConfirm,
  onCancel,
  returnFocusFallbackRef,
}: RestoreDialogProps) {
  const translate = useTranslations();
  return (
    <InMain>
      <AccountDialog
        kind="destructive"
        confirmTone="primary"
        title={translate("priceDashboard.history.restoreTitle", {
          versionId: String(versionNumber),
        })}
        description={translate("priceDashboard.history.restoreDialogBody", {
          count: differingCount,
        })}
        returnFocusFallbackRef={returnFocusFallbackRef}
        confirm={{
          label: translate("priceDashboard.common.addToPending"),
          busyLabel: translate("priceDashboard.history.restoring"),
          isBusy,
          onPress: onConfirm,
        }}
        cancel={{
          label: translate("priceDashboard.common.cancel"),
          onPress: onCancel,
        }}
      >
        {failure === undefined ? null : (
          <FormNotice tone="error">
            {failure === "conflict"
              ? translate("priceDashboard.errors.changedMeanwhile")
              : translate("priceDashboard.errors.saveFailed")}
          </FormNotice>
        )}
      </AccountDialog>
    </InMain>
  );
}
