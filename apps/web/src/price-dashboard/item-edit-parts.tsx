"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, type ReactNode } from "react";

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
  /** Said under the switch while it can be pressed. */
  readonly activeNote: string;
  readonly deleteHeading: string;
  readonly deleteHint: string | undefined;
  readonly deleteAction: string;
}

export interface ItemLifecycleSectionProps {
  readonly availability: ItemAvailabilityDesk;
  readonly item: DeletableItemRef;
  /** Why the switch and the deletion are off; absent, each can be pressed. */
  readonly reasons: ActionReasons;
  readonly words: ItemLifecycleWords;
  /** Drawn above the switch, and between the switch and the deletion. */
  readonly aboveSwitch?: ReactNode;
  readonly belowSwitch?: ReactNode;
}

/** Whether customers are given the item, which applies at once and through the dialogs, and its deletion. */
export function ItemLifecycleSection({
  availability,
  item,
  reasons,
  words,
  aboveSwitch,
  belowSwitch,
}: ItemLifecycleSectionProps) {
  const translate = useTranslations();
  const isOn = isItemOn(item, availability.context);
  return (
    <>
      {aboveSwitch}
      <ActionThatMayBeOff
        reason={reasons.switchReason}
        restingNote={words.activeNote}
        switchState={isOn}
        buttonClassName={styles.switch}
        noteClassName={styles.hint}
        noteTag="p"
        onPress={() => {
          availability.requestSwitch(item);
        }}
      >
        <span>{words.activeLabel}</span>
        <span className={styles.switchState}>
          {translate(
            isOn
              ? "priceDashboard.chips.active"
              : "priceDashboard.chips.inactive",
          )}
        </span>
      </ActionThatMayBeOff>
      {belowSwitch}
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
