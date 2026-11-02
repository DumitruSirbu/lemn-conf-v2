"use client";

import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";

import type { ItemRef } from "@lemnaria/configurator-domain";

import type { ContentTranslator } from "@/i18n/content";
import type { AppLocale } from "@/i18n/routing";
import { StaffShell, type StaffShellContext } from "@/staff/staff-shell";

import { CatalogUnavailableNotice } from "./catalog-states";
import type { HardwareClassFacts } from "./hardware-model";
import styles from "./hardware.module.css";
import {
  deleteStandOf,
  isDefaultItem,
  isItemOn,
  switchStandOf,
  type LifecycleContext,
} from "./item-lifecycle-model";
import { offReasonWords } from "./item-lifecycle-words";

// What the hardware list and the class page draw the same way: the chips of a class, the item it stands for, why a switch
// or a deletion may be off, and the control that says so beside itself.

export function hardwareItemOf({
  tierId,
}: HardwareClassFacts): Extract<ItemRef, { readonly kind: "hardware" }> {
  return { kind: "hardware", tierId };
}

/** The classes could not be read: the frame stays, and the notice stands in the page's place. */
export function HardwareUnavailableScreen({
  locale,
  context,
}: {
  readonly locale: AppLocale;
  readonly context: StaffShellContext;
}) {
  return (
    <StaffShell locale={locale} page="hardware" context={context}>
      <CatalogUnavailableNotice />
    </StaffShell>
  );
}

/** What the class is to customers now, whether it is the default, and whether the draft touches it. */
export function ClassChips({
  facts,
  context,
}: {
  readonly facts: HardwareClassFacts;
  readonly context: LifecycleContext;
}) {
  const translate = useTranslations();
  const item = hardwareItemOf(facts);
  const isOn = isItemOn(item, context);
  return (
    <span className={styles.chips}>
      {isDefaultItem(item, context) ? (
        <span className={styles.chip} data-testid="hardware-chip">
          {translate("priceDashboard.chips.defaultChoice")}
        </span>
      ) : null}
      <span
        className={styles.chip}
        data-tone={isOn ? "on" : undefined}
        data-testid="hardware-chip"
      >
        {translate(
          isOn
            ? "priceDashboard.chips.active"
            : "priceDashboard.chips.inactive",
        )}
      </span>
      {facts.isModified ? (
        <span
          className={styles.chip}
          data-tone="warm"
          data-testid="hardware-chip"
        >
          {translate("priceDashboard.chips.pending")}
        </span>
      ) : null}
    </span>
  );
}

/** Why each action on a class is off; absent, it can be taken. A class the draft deletes cannot be switched, and
 *  nothing is offered of it once the deletion is published. */
export interface ActionReasons {
  readonly switchReason: string | undefined;
  readonly deleteReason: string | undefined;
}

export function reasonsOf({
  translate,
  facts,
  context,
}: {
  readonly translate: ContentTranslator;
  readonly facts: HardwareClassFacts;
  readonly context: LifecycleContext;
}): ActionReasons {
  if (facts.isDeletionPending) {
    const pending = translate("priceDashboard.hardware.deleteNotice");
    return { switchReason: pending, deleteReason: pending };
  }
  const item = hardwareItemOf(facts);
  const switchStand = switchStandOf(item, context);
  const deleteStand = deleteStandOf(item, context);
  return {
    switchReason:
      switchStand.kind === "off"
        ? offReasonWords(translate, switchStand.reason)
        : undefined,
    deleteReason:
      deleteStand.kind === "off"
        ? offReasonWords(translate, deleteStand.reason)
        : undefined,
  };
}

export interface ActionThatMayBeOffProps {
  /** Why the action is off; absent, it can be pressed. */
  readonly reason: string | undefined;
  /** Said under the action while it can be pressed. */
  readonly restingNote?: string | undefined;
  readonly onPress: () => void;
  readonly buttonClassName: string | undefined;
  readonly noteClassName: string | undefined;
  readonly noteTag: "p" | "span";
  readonly noteTestId?: string | undefined;
  /** Set where the action is a switch: whether it is on. */
  readonly switchState?: boolean | undefined;
  readonly children: ReactNode;
}

/** An action that stays in place when it cannot be taken: off, it is not pressed, and the reason is said under it. */
export function ActionThatMayBeOff({
  reason,
  restingNote,
  onPress,
  buttonClassName,
  noteClassName,
  noteTag: Note,
  noteTestId,
  switchState,
  children,
}: ActionThatMayBeOffProps) {
  const noteId = useId();
  const isOff = reason !== undefined;
  const note = reason ?? restingNote;
  return (
    <>
      <button
        type="button"
        role={switchState === undefined ? undefined : "switch"}
        aria-checked={switchState}
        className={buttonClassName}
        aria-disabled={isOff ? true : undefined}
        aria-describedby={note === undefined ? undefined : noteId}
        onClick={isOff ? undefined : onPress}
      >
        {children}
      </button>
      {note === undefined ? null : (
        <Note id={noteId} className={noteClassName} data-testid={noteTestId}>
          {note}
        </Note>
      )}
    </>
  );
}
