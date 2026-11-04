"use client";

import { useTranslations } from "next-intl";

import type { ContentTranslator } from "@/i18n/content";
import { useContent } from "@/i18n/use-content";

import styles from "./cabinet-detail.module.css";
import type { HardwareReadout } from "./cabinet-detail-facts";
import { formatLei } from "./format-lei";

// What the hardware a cabinet carries comes to, as the book's default class prices it at the default width. Read-only.
// Where the draft changes what it comes to, both are said and each is named.

export function CabinetHardwareReadout({
  hardware,
  draftHardware,
}: {
  readonly hardware: HardwareReadout | undefined;
  readonly draftHardware: HardwareReadout | undefined;
}) {
  const translate = useTranslations();
  const isDraftDifferent =
    draftHardware !== undefined && !isSameReadout(hardware, draftHardware);
  return (
    <div className={styles.hardware}>
      <span className={styles.hardwareTitle}>
        {translate("priceDashboard.cabinet.hardwareHeading")}
      </span>
      {isDraftDifferent ? (
        <>
          <HardwareLine hardware={hardware} naming="active" />
          <HardwareLine hardware={draftHardware} naming="pending" />
        </>
      ) : (
        <HardwareLine hardware={hardware} naming="none" />
      )}
    </div>
  );
}

function isSameReadout(
  active: HardwareReadout | undefined,
  draft: HardwareReadout,
): boolean {
  return (
    active !== undefined &&
    active.amountMinor === draft.amountMinor &&
    active.hinges === draft.hinges &&
    active.drawers === draft.drawers &&
    active.lifts === draft.lifts &&
    active.tierName.authored === draft.tierName.authored
  );
}

function HardwareLine({
  hardware,
  naming,
}: {
  readonly hardware: HardwareReadout | undefined;
  /** Which version the line speaks of, said in its words where there are two lines. */
  readonly naming: "none" | "active" | "pending";
}) {
  const translate = useTranslations();
  const content = useContent();
  return (
    <span>
      {hardware === undefined
        ? translate("priceDashboard.cabinet.hardwareNone")
        : translate(lineKeyOf(naming), {
            widthMm: hardware.widthMm,
            quantities: quantitiesOf(translate, hardware),
            amount: formatLei(
              hardware.amountMinor,
              translate("priceDashboard.units.currency"),
            ),
            className: content.bookText(
              hardware.tierName.authored,
              hardware.tierName.key,
            ),
          })}
    </span>
  );
}

function lineKeyOf(naming: "none" | "active" | "pending") {
  switch (naming) {
    case "none":
      return "priceDashboard.cabinet.hardwareLine";
    case "active":
      return "priceDashboard.cabinet.hardwareLineActive";
    case "pending":
      return "priceDashboard.cabinet.hardwareLinePending";
  }
}

/** The mechanisms the cabinet carries, each as a count in its own words, joined with a plus. */
function quantitiesOf(
  translate: ContentTranslator,
  hardware: HardwareReadout,
): string {
  const parts = [
    hardware.hinges === 0
      ? undefined
      : translate("priceDashboard.cabinet.hingeCount", {
          count: hardware.hinges,
        }),
    hardware.drawers === 0
      ? undefined
      : translate("priceDashboard.cabinet.slidePairCount", {
          count: hardware.drawers,
        }),
    hardware.lifts === 0
      ? undefined
      : translate("priceDashboard.cabinet.liftCount", {
          count: hardware.lifts,
        }),
  ].filter((part) => part !== undefined);
  return parts.reduce((head, tail) =>
    translate("priceDashboard.cabinet.hardwareJoined", { head, tail }),
  );
}
