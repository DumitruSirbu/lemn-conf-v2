"use client";

import { useTranslations } from "next-intl";

import type { ItemRef } from "@lemnaria/configurator-domain";

import type { ContentTranslator } from "@/i18n/content";

import type { ActionReasons } from "./action-that-may-be-off";
import type { HardwareClassFacts } from "./hardware-model";
import styles from "./hardware.module.css";
import {
  isDefaultItem,
  isItemOn,
  type LifecycleContext,
} from "./item-lifecycle-model";
import { reasonsOfItem } from "./item-lifecycle-words";

// What the hardware list and the class page draw the same way: the chips of a class, the item it stands for, why a
// switch or a deletion may be off, and the control that says so beside itself.

export function hardwareItemOf({
  tierId,
}: HardwareClassFacts): Extract<ItemRef, { readonly kind: "hardware" }> {
  return { kind: "hardware", tierId };
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
  return reasonsOfItem({
    translate,
    item: hardwareItemOf(facts),
    context,
    deletionPendingNotice: facts.isDeletionPending
      ? translate("priceDashboard.hardware.deleteNotice")
      : undefined,
  });
}
