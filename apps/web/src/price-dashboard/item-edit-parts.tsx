"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, type ReactNode } from "react";

import type { DeletableItemRef } from "@lemnaria/configurator-domain";

import {
  ActionThatMayBeOff,
  type ActionReasons,
} from "./action-that-may-be-off";
import styles from "./item-screen.module.css";
import { isItemOn } from "./item-lifecycle-model";
import editStyles from "./price-edit.module.css";
import type { ItemAvailabilityDesk } from "./use-item-availability";

// What the pages of one hardware class, one material and one accessory draw alike: whether customers are given the item
// and its deletion, and the notice that stands where an item the draft created and then deleted used to be.

/** The words of one item's lifecycle section, in the reader's language. An absent `deleteHint` draws no hint. */
export interface ItemLifecycleWords {
  readonly activeLabel: string;
  /** Said under the status, whether or not the action can be taken. */
  readonly activeNote: string;
  readonly deleteHeading: string;
  readonly deleteHint: string | undefined;
  readonly deleteAction: string;
}

export interface ItemLifecycleSectionProps {
  readonly availability: ItemAvailabilityDesk;
  readonly item: DeletableItemRef;
  /** Why the availability action and the deletion are off; absent, each can be pressed. */
  readonly reasons: ActionReasons;
  readonly words: ItemLifecycleWords;
  /** Drawn above the status line. */
  readonly aboveStatus?: ReactNode;
  /** Drawn between the availability button and the deletion. */
  readonly belowAction?: ReactNode;
}

/** Whether customers are given the item, stated as a status and changed by a named button that asks first (ADR 0184),
 *  which applies at once; and its deletion. */
export function ItemLifecycleSection({
  availability,
  item,
  reasons,
  words,
  aboveStatus,
  belowAction,
}: ItemLifecycleSectionProps) {
  const translate = useTranslations();
  const isOn = isItemOn(item, availability.context);
  const hintId = useId();
  return (
    <>
      {aboveStatus}
      <div className={styles.status} data-testid="item-status">
        <span className={styles.statusLabel}>{words.activeLabel}</span>
        <span className={styles.statusBadge} data-state={isOn ? "on" : "off"}>
          {translate(
            isOn
              ? "priceDashboard.chips.active"
              : "priceDashboard.chips.inactive",
          )}
        </span>
      </div>
      <p id={hintId} className={styles.hint}>
        {words.activeNote}
      </p>
      <ActionThatMayBeOff
        reason={reasons.switchReason}
        describedById={hintId}
        buttonClassName={editStyles.action}
        noteClassName={styles.reason}
        noteTag="p"
        onPress={() => {
          availability.requestSwitch(item);
        }}
      >
        {translate(
          isOn
            ? "priceDashboard.common.deactivate"
            : "priceDashboard.common.activate",
        )}
      </ActionThatMayBeOff>
      {belowAction}
      <div className={styles.danger}>
        <h2 className={styles.cardTitle}>{words.deleteHeading}</h2>
        {words.deleteHint === undefined ? null : (
          <p className={styles.hint}>{words.deleteHint}</p>
        )}
        <ActionThatMayBeOff
          reason={reasons.deleteReason}
          buttonClassName={editStyles.action}
          noteClassName={styles.hint}
          noteTag="p"
          onPress={() => {
            availability.requestDeletion(item);
          }}
        >
          {words.deleteAction}
        </ActionThatMayBeOff>
      </div>
    </>
  );
}

export interface ItemRemovedNoticeProps {
  readonly testId: string;
  /** The page that lists the items, and what to call the way back to it. */
  readonly backHref: string;
  readonly backLabel: string;
  readonly message: string;
}

/** The item is no longer in the draft: it was created there and has just been deleted, so nothing is left to publish.
 *  Focus goes to the notice, since the page it was on is gone. */
export function ItemRemovedNotice({
  testId,
  backHref,
  backLabel,
  message,
}: ItemRemovedNoticeProps) {
  const noticeRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    noticeRef.current?.focus();
  }, []);
  return (
    <section className={styles.editColumn} data-testid={testId}>
      <a className={styles.back} href={backHref}>
        {backLabel}
      </a>
      <p ref={noticeRef} tabIndex={-1} className={styles.notice} role="status">
        {message}
      </p>
    </section>
  );
}
