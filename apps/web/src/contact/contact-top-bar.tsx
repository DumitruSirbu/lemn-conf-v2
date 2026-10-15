"use client";

import type { DesignId } from "@lemnaria/configurator-domain";
import type { ReactNode } from "react";

import { LocaleMenu } from "@/app/configurator/configure/locale-menu";
import { StartLink } from "@/components/start-link";
import { useContent } from "@/i18n/use-content";
import { ReviewLink } from "@/result/review-link";

import styles from "./contact.module.css";

/** The bar the review draws, as shipped (frame 4A's `‹`, the title and the language menu); no material pill (ADR 0148
 *  A3) and no step pill, which the review does not draw either. */
export function TopBar({ backLink }: { readonly backLink: ReactNode }) {
  const content = useContent();
  return (
    <header className={styles.nav}>
      {backLink}
      <span className={styles.navTitle} data-testid="contact-top-bar-title">
        {content.contact.topBarTitle}
      </span>
      <div className={styles.localeSlot}>
        <LocaleMenu />
      </div>
    </header>
  );
}

/** The way back to the design's review, fetched. */
export function ReviewBackLink({ designId }: { readonly designId: DesignId }) {
  return <ReviewLink designId={designId} {...useBackLinkProps()} />;
}

/** The way back for a form with no design: the start of the configurator. */
export function StartBackLink() {
  return <StartLink {...useBackLinkProps()} />;
}

/** What both back links draw: the same `‹` button, whichever page it leads to. */
function useBackLinkProps() {
  const content = useContent();
  return {
    className: styles.back,
    "aria-label": content.configure.backAction,
    "data-testid": "contact-back",
    children: <span aria-hidden="true">‹</span>,
  };
}
