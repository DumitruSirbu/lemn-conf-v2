"use client";

import { useTranslations } from "next-intl";

import type { ContentTranslator } from "@/i18n/content";
import { useContent } from "@/i18n/use-content";

import styles from "./cabinet-detail.module.css";
import type { HardwareReadout } from "./cabinet-detail-facts";
import { formatLei } from "./format-lei";

// What the hardware a cabinet carries comes to, as the book's default class prices it at the default width. Read-only.

export function CabinetHardwareReadout({
  hardware,
}: {
  readonly hardware: HardwareReadout | undefined;
}) {
  const translate = useTranslations();
  const content = useContent();
  return (
    <div className={styles.hardware}>
      <span className={styles.hardwareTitle}>
        {translate("priceDashboard.cabinet.hardwareHeading")}
      </span>
      <span>
        {hardware === undefined
          ? translate("priceDashboard.cabinet.hardwareNone")
          : translate("priceDashboard.cabinet.hardwareLine", {
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
    </div>
  );
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
  ].filter((part) => part !== undefined);
  return parts.reduce((head, tail) =>
    translate("priceDashboard.cabinet.hardwareJoined", { head, tail }),
  );
}
