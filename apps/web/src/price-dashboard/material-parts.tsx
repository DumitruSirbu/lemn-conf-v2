"use client";

import { useTranslations } from "next-intl";

import type { ContentTranslator } from "@/i18n/content";

import type { ActionReasons } from "./action-that-may-be-off";
import {
  isDefaultItem,
  isItemOn,
  type LifecycleContext,
} from "./item-lifecycle-model";
import { reasonsOfItem } from "./item-lifecycle-words";
import {
  materialItemOf,
  type MaterialColours,
  type MaterialFacts,
} from "./material-model";
import styles from "./material.module.css";

// What the materials list and the material page draw the same way: the chips of a material, why a switch or a deletion
// may be off, and the screen that stands in for the page when the materials could not be read.

/** What the material is to customers now, whether it is the default, and whether the draft touches it. `usedBy` is how
 *  many saved kitchens use it, where that was counted. */
export function MaterialChips({
  facts,
  context,
  usedBy,
}: {
  readonly facts: MaterialFacts;
  readonly context: LifecycleContext;
  readonly usedBy: number | undefined;
}) {
  const translate = useTranslations();
  const item = materialItemOf(facts);
  const isOn = isItemOn(item, context);
  return (
    <span className={styles.chips}>
      {isDefaultItem(item, context) ? (
        <span className={styles.chip} data-testid="material-chip">
          {translate("priceDashboard.chips.defaultChoice")}
        </span>
      ) : null}
      <span
        className={styles.chip}
        data-tone={isOn ? "on" : "off"}
        data-testid="material-chip"
      >
        {isOn
          ? translate("priceDashboard.chips.active")
          : inactiveWords(translate, usedBy)}
      </span>
      {facts.isModified ? (
        <span
          className={styles.chip}
          data-tone="warm"
          data-testid="material-chip"
        >
          {translate("priceDashboard.chips.pending")}
        </span>
      ) : null}
    </span>
  );
}

/** Whether saved kitchens still use a switched-off material, which is what the chip, the note and the banner say. */
export function isStillUsed(usedBy: number | undefined): usedBy is number {
  return usedBy !== undefined && usedBy > 0;
}

function inactiveWords(
  translate: ContentTranslator,
  usedBy: number | undefined,
): string {
  return isStillUsed(usedBy)
    ? translate("priceDashboard.chips.inactiveInUse", { count: usedBy })
    : translate("priceDashboard.chips.inactive");
}

/** Why each action on a material is off; absent, it can be taken. */
export function materialReasonsOf({
  translate,
  facts,
  context,
}: {
  readonly translate: ContentTranslator;
  readonly facts: MaterialFacts;
  readonly context: LifecycleContext;
}): ActionReasons {
  return reasonsOfItem({
    translate,
    item: materialItemOf(facts),
    context,
    deletionPendingNotice: facts.isDeletionPending
      ? translate("priceDashboard.materials.deleteNotice")
      : undefined,
  });
}

/** A surcharge as a sentence part: "+30 %", and "0 %" where it adds nothing. */
export function surchargeWords(
  translate: ContentTranslator,
  percent: number,
): string {
  return translate(
    percent === 0
      ? "priceDashboard.common.percent"
      : "priceDashboard.common.percentPlus",
    { percent: String(percent) },
  );
}

/** What the material lets the customer choose as a colour, in words; absent where the code declares nothing. */
export function colourWords(
  translate: ContentTranslator,
  colours: MaterialColours,
): string | undefined {
  switch (colours.kind) {
    case "count":
      return translate("priceDashboard.materials.colourCount", {
        count: colours.count,
      });
    case "picker":
      return translate("priceDashboard.materials.colourPicker");
    case "undeclared":
      return undefined;
  }
}

/**
 * What the material's colours are, said as managed elsewhere (the page's fact line); absent where nothing is declared.
 */
export function managedColourWords(
  translate: ContentTranslator,
  colours: MaterialColours,
): string | undefined {
  switch (colours.kind) {
    case "count":
      return translate("priceDashboard.materials.coloursManaged", {
        count: colours.count,
      });
    case "picker":
      return translate("priceDashboard.materials.colourPickerManaged");
    case "undeclared":
      return undefined;
  }
}
