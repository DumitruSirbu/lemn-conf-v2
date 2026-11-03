"use client";

import { useTranslations } from "next-intl";

import type { ContentTranslator } from "@/i18n/content";
import type { AppLocale } from "@/i18n/routing";
import { StaffShell, type StaffShellContext } from "@/staff/staff-shell";

import { CatalogUnavailableNotice } from "./catalog-states";
import type { ActionReasons } from "./action-that-may-be-off";
import {
  deleteStandOf,
  isDefaultItem,
  isItemOn,
  switchStandOf,
  type LifecycleContext,
} from "./item-lifecycle-model";
import { offReasonWords } from "./item-lifecycle-words";
import {
  materialItemOf,
  type MaterialColours,
  type MaterialFacts,
} from "./material-model";
import styles from "./material.module.css";

// What the materials list and the material page draw the same way: the chips of a material, why a switch or a deletion
// may be off, and the screen that stands in for the page when the materials could not be read.

/** The materials could not be read: the frame stays, and the notice stands in the page's place. */
export function MaterialUnavailableScreen({
  locale,
  context,
}: {
  readonly locale: AppLocale;
  readonly context: StaffShellContext;
}) {
  return (
    <StaffShell locale={locale} page="materials" context={context}>
      <CatalogUnavailableNotice />
    </StaffShell>
  );
}

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

/** Why each action on a material is off; absent, it can be taken. A material the draft deletes cannot be switched, and
 *  nothing is offered of it once the deletion is published. */
export function materialReasonsOf({
  translate,
  facts,
  context,
}: {
  readonly translate: ContentTranslator;
  readonly facts: MaterialFacts;
  readonly context: LifecycleContext;
}): ActionReasons {
  if (facts.isDeletionPending) {
    const pending = translate("priceDashboard.materials.deleteNotice");
    return { switchReason: pending, deleteReason: pending };
  }
  const item = materialItemOf(facts);
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
