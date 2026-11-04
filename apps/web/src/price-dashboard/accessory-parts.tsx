"use client";

import { useTranslations } from "next-intl";

import type { ContentTranslator } from "@/i18n/content";

import type { ActionReasons } from "./action-that-may-be-off";
import {
  accessoryItemOf,
  type AccessoryEarning,
  type AccessoryFacts,
} from "./accessory-model";
import styles from "./accessory.module.css";
import { formatLei, formatLeiAmount } from "./format-lei";
import { isItemOn, type LifecycleContext } from "./item-lifecycle-model";
import { reasonsOfItem } from "./item-lifecycle-words";

// What the accessory list and the accessory page draw the same way: the chips of an accessory, the rule that earns it,
// its price, why a switch or a deletion may be off, and the screen that stands in for the page when the accessories
// could not be read.

/** What the accessory is to customers now, and whether the draft touches it. */
export function AccessoryChips({
  facts,
  context,
}: {
  readonly facts: AccessoryFacts;
  readonly context: LifecycleContext;
}) {
  const translate = useTranslations();
  const isOn = isItemOn(accessoryItemOf(facts), context);
  return (
    <span className={styles.chips}>
      <span
        className={styles.chip}
        data-tone={isOn ? "on" : undefined}
        data-testid="accessory-chip"
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
          data-testid="accessory-chip"
        >
          {translate("priceDashboard.chips.pending")}
        </span>
      ) : null}
    </span>
  );
}

/** Why each action on an accessory is off; absent, it can be taken. */
export function accessoryReasonsOf({
  translate,
  facts,
  context,
}: {
  readonly translate: ContentTranslator;
  readonly facts: AccessoryFacts;
  readonly context: LifecycleContext;
}): ActionReasons {
  return reasonsOfItem({
    translate,
    item: accessoryItemOf(facts),
    context,
    deletionPendingNotice: facts.isDeletionPending
      ? translate("priceDashboard.accessories.deleteNotice")
      : undefined,
  });
}

/** When the accessory is added to a kitchen, said as the sentence of its rule. A cabinet type the page cannot name is
 *  said by its build id rather than left out. */
export function earningWords({
  translate,
  earning,
  cabinetNames,
}: {
  readonly translate: ContentTranslator;
  readonly earning: AccessoryEarning;
  readonly cabinetNames: Readonly<Record<string, string>>;
}): string {
  if (earning.kind === "linked") {
    return translate("priceDashboard.accessories.ruleLinked", {
      cabinetName: cabinetNameOf(cabinetNames, earning.linkedBuildId),
    });
  }
  return translate(
    earning.accessoryId === "sinkProtectiveCover"
      ? "priceDashboard.accessories.ruleSinkCover"
      : "priceDashboard.accessories.ruleDryingRack",
  );
}

export function cabinetNameOf(
  cabinetNames: Readonly<Record<string, string>>,
  buildId: string,
): string {
  return cabinetNames[buildId] ?? buildId;
}

/** The price per unit as the list and the page say it: "400 lei". */
export function priceWords(
  translate: ContentTranslator,
  minor: number,
): string {
  return formatLei(minor, translate("priceDashboard.units.currency"));
}

/** What was active before the draft's price, beside the price. */
export function activePriceWords(
  translate: ContentTranslator,
  activeMinor: number,
): string {
  return translate("priceDashboard.common.activeThenPending", {
    active: formatLeiAmount(activeMinor),
  });
}
