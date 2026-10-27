"use client";

import { useTranslations } from "next-intl";
import { useId, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

import { AccountDialog } from "@/account/account-dialog";
import { FormNotice } from "@/account/account-form-parts";
import type { ContentTranslator } from "@/i18n/content";

import styles from "./publish.module.css";

// Each dialog opens on the safe action and Escape takes it; `AccountDialog` holds the rest.
// They are drawn into the frame's `<main>`, so the page behind goes inert.

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
  /** How many pending changes the restore replaces; none, and the sentence is left out. */
  readonly replacedCount: number;
  readonly isBusy: boolean;
  readonly failure: "save-failed" | "conflict" | "not-found" | undefined;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** D8C: restoring adds the old prices to "De publicat". It publishes nothing, so nothing changes for clients. */
export function RestoreDialog({
  versionNumber,
  differingCount,
  replacedCount,
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
        {replacedCount === 0 ? null : (
          <FormNotice tone="info">
            {translate("priceDashboard.history.restoreReplaces", {
              count: replacedCount,
            })}
          </FormNotice>
        )}
        {failure === undefined ? null : (
          <FormNotice tone="error">
            {restoreFailureWords(translate, failure)}
          </FormNotice>
        )}
      </AccountDialog>
    </InMain>
  );
}

function restoreFailureWords(
  translate: ContentTranslator,
  failure: "save-failed" | "conflict" | "not-found",
): string {
  switch (failure) {
    case "conflict":
      return translate("priceDashboard.errors.changedMeanwhile");
    case "not-found":
      return translate("priceDashboard.history.versionNotFound");
    case "save-failed":
      return translate("priceDashboard.errors.saveFailed");
  }
}
