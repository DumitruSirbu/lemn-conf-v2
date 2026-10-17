"use client";

import type { DesignId } from "@lemnaria/configurator-domain";
import { useEffect, useRef } from "react";

import { useKeepFocusAbove } from "@/components/use-keep-focus-above";
import { BackToDesignLink } from "@/done/back-to-design-link";
import { useContent } from "@/i18n/use-content";
import { CallShopLink } from "@/shop/call-shop-link";
import { shopPhoneDisplay } from "@/shop/shop-phone";

import styles from "./contact.module.css";
import { ReviewBackLink, TopBar } from "./contact-top-bar";

/**
 * The contact page of a kitchen already sent for (ADR 0163 decision 7). Nothing here is a form and its import closure
 * holds none of the send path, so it draws its own heading and takes the way back from a module of its own (ADR 0163 A5).
 */
export function AlreadySentView({ designId }: { readonly designId: DesignId }) {
  return (
    <main className={styles.screen}>
      <TopBar backLink={<ReviewBackLink designId={designId} />} />
      <div className={styles.body} data-testid="contact-already-sent">
        <SentHeading />
        <CallAdvice />
        <ChangedKitchenSentence />
      </div>
      <PinnedWayBack designId={designId} />
    </main>
  );
}

function SentHeading() {
  const content = useContent().submissionResult;
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
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
  );
}

/** The correction path: a sentence naming the shop's number as text, and the one link that dials it. */
function CallAdvice() {
  const content = useContent().submissionResult;
  return (
    <div className={styles.alreadySentAdvice}>
      <p
        className={styles.alreadySentText}
        data-testid="contact-already-sent-advice"
      >
        {content.alreadySentAdvice(shopPhoneDisplay())}
      </p>
      <CallShopLink />
    </div>
  );
}

function ChangedKitchenSentence() {
  const content = useContent().submissionResult;
  return (
    <p
      className={styles.alreadySentText}
      data-testid="contact-already-sent-changed-kitchen"
    >
      {content.alreadySentChangedKitchen}
    </p>
  );
}

/** Pinned at the foot as frame 5A pins its way back: sticky and in the flow, and what takes focus is kept clear of it. */
function PinnedWayBack({ designId }: { readonly designId: DesignId }) {
  const regionRef = useRef<HTMLDivElement>(null);
  useKeepFocusAbove(regionRef);
  return (
    <div
      className={styles.bottom}
      ref={regionRef}
      data-testid="contact-already-sent-bottom"
    >
      <BackToDesignLink designId={designId} />
    </div>
  );
}
