"use client";

import type { KitchenViewed3dVersion } from "@lemnaria/configurator-domain";

import type { AppLocale } from "@/i18n/routing";
import { useStaffKitchenCopy } from "@/i18n/use-content";

import styles from "./staff-kitchen.module.css";
import { staffKitchen3dPathOf } from "./staff-paths";

/**
 * Opens the kitchen in the 3D view in a new tab, so this page stays where it is. `version` is the copy the version
 * switch shows, and is absent when the page has no switch.
 */
export function OpenIn3dLink({
  locale,
  kitchenId,
  version,
}: {
  readonly locale: AppLocale;
  readonly kitchenId: string;
  readonly version: KitchenViewed3dVersion | undefined;
}) {
  const copy = useStaffKitchenCopy();
  return (
    <a
      className={styles.open3d}
      href={staffKitchen3dPathOf({ locale, kitchenId, version })}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="staff-kitchen-open-3d"
    >
      {copy.open3d}
    </a>
  );
}
