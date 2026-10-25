"use client";

import type { RefObject } from "react";

import { FormNotice, OutcomeHero } from "@/account/account-form-parts";
import type { AppLocale } from "@/i18n/routing";
import { useStaffKitchenCopy, useStaffShellCopy } from "@/i18n/use-content";

import { staffPathOf } from "./staff-paths";
import styles from "./staff-kitchen.module.css";
import listStyles from "./staff-kitchens.module.css";
import shellStyles from "./staff.module.css";

// What the kitchen page draws around the kitchen itself: the heading with the way back, the grey boxes while it is read, the
// one answer for a kitchen that is not there, and the notice for a document this build cannot read.

/** The way back to the list, the page's one `h1` (it takes focus by script only) and the line under it. */
export function KitchenHeader({
  locale,
  title,
  sub,
  titleRef,
}: {
  readonly locale: AppLocale;
  readonly title: string;
  readonly sub?: string | undefined;
  readonly titleRef?: RefObject<HTMLHeadingElement | null>;
}) {
  const shell = useStaffShellCopy();
  return (
    <header className={styles.header}>
      <a className={styles.back} href={staffPathOf(locale, "kitchens")}>
        {shell.pages.kitchens}
      </a>
      <h1 ref={titleRef} className={styles.title} tabIndex={-1}>
        {title}
      </h1>
      {sub === undefined ? null : <p className={styles.sub}>{sub}</p>}
    </header>
  );
}

/** The three columns as grey boxes (frame S3A). The words are for a screen reader; the boxes are only for the eye. */
export function LoadingKitchen() {
  const copy = useStaffKitchenCopy();
  return (
    <>
      <p role="status" className={listStyles.visuallyHidden}>
        {copy.loading}
      </p>
      <div
        className={styles.skeletonColumns}
        aria-hidden="true"
        data-testid="staff-kitchen-skeleton"
      >
        <span className={styles.skeletonView} />
        <span className={styles.skeletonBox} />
        <span className={styles.skeletonBox} />
      </div>
    </>
  );
}

/** One answer for a kitchen that is missing and one the person may not open; it cannot tell them apart (frame S3H). */
export function KitchenNotAvailable({
  locale,
}: {
  readonly locale: AppLocale;
}) {
  const copy = useStaffKitchenCopy();
  const shell = useStaffShellCopy();
  return (
    <div
      className={shellStyles.forbidden}
      data-testid="staff-kitchen-not-found"
    >
      <OutcomeHero tone="error" title={copy.notFound.title}>
        {copy.notFound.body}
      </OutcomeHero>
      <a
        className={shellStyles.primaryLink}
        href={staffPathOf(locale, "kitchens")}
      >
        {shell.backTo(shell.pages.kitchens)}
      </a>
    </div>
  );
}

/** A kitchen whose document this build cannot read: said once, in place of the picture, with the rest still shown. */
export function CannotShowNotice() {
  const copy = useStaffKitchenCopy();
  return (
    <div data-testid="staff-kitchen-cannot-show">
      <FormNotice tone="warning" title={copy.cannotShow.title}>
        {copy.cannotShow.body}
      </FormNotice>
    </div>
  );
}
