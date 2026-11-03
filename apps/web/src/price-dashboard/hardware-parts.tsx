"use client";

import { useTranslations } from "next-intl";

import type { ItemRef } from "@lemnaria/configurator-domain";

import type { ContentTranslator } from "@/i18n/content";
import type { AppLocale } from "@/i18n/routing";
import { StaffShell, type StaffShellContext } from "@/staff/staff-shell";

import type { ActionReasons } from "./action-that-may-be-off";
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

// What the hardware list and the class page draw the same way: the chips of a class, the item it stands for, why a
// switch or a deletion may be off, and the control that says so beside itself.

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

// Kept here for the hardware screens, which import it from this file; the component itself is kind-agnostic.
export { ActionThatMayBeOff } from "./action-that-may-be-off";
export type {
  ActionReasons,
  ActionThatMayBeOffProps,
} from "./action-that-may-be-off";
