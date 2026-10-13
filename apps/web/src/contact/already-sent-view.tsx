"use client";

import type { DesignId } from "@lemnaria/configurator-domain";
import { useEffect, useRef } from "react";

import { SentReferenceCard } from "@/done/sent-reference-card";
import { useContent } from "@/i18n/use-content";

import styles from "./contact.module.css";
import { ReviewBackLink, TopBar } from "./contact-top-bar";

/**
 * What the contact page of a kitchen already sent for draws: the bar, one focused `h1` and the request's reference.
 * The submission hook is not mounted and nothing here is a form, so no press on it can send. Its import closure holds
 * none of the send path (ADR 0163 A5), which is why it draws its own heading and not the confirmation's.
 */
export function AlreadySentView({
  designId,
  reference,
}: {
  readonly designId: DesignId;
  readonly reference: string;
}) {
  const content = useContent().submissionResult;
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className={styles.screen}>
      <TopBar backLink={<ReviewBackLink designId={designId} />} />
      <div className={styles.body} data-testid="contact-already-sent">
        <div className={styles.head}>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className={styles.heading}
            data-testid="contact-already-sent-heading"
          >
            {content.alreadySentHeading}
          </h1>
        </div>
        <SentReferenceCard reference={reference} />
      </div>
    </main>
  );
}
