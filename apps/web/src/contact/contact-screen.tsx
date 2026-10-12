"use client";

import type { DesignId } from "@lemnaria/configurator-domain";
import { useLocale } from "next-intl";

import { LocaleMenu } from "@/app/configurator/configure/locale-menu";
import { WebGLUnavailable } from "@/components/webgl-unavailable";
import { useContent } from "@/i18n/use-content";
import { routing, type AppLocale } from "@/i18n/routing";
import type { RefusedSubmit, ReviewView } from "@/review/review-model";
import { useReview } from "@/review/use-review";
import { useWebGLSupport } from "@/scene/webgl-support";

import { ContactDesignCard } from "./contact-design-card";
import { ContactForm } from "./contact-form";
import styles from "./contact.module.css";
import { ReviewLink } from "./review-link";
import {
  DESIGN_TARGET,
  useContactSubmission,
  type ContactSubmission,
} from "./use-contact-submission";

export interface ContactScreenProps {
  readonly designId: DesignId;
  /** Whether the server can take a request at all: a mail sender and a digest secret it can use. A boolean and nothing
   *  of how it was decided, since that must not reach the page. */
  readonly isSendable: boolean;
}

/**
 * The contact page of a stored design (frames 4A to 4C). On a device that cannot show the kitchen it is the editor's
 * own exit, as the review is, since the card shows a price for a kitchen that device cannot show; while that is still
 * being asked it is the editor's loading line and no figure. Where the server cannot take a request it is a sentence
 * saying so and no form.
 */
export function ContactScreen({ designId, isSendable }: ContactScreenProps) {
  const content = useContent();
  const support = useWebGLSupport();

  if (support === "unsupported") return <WebGLUnavailable />;
  if (support === "probing") {
    return (
      <main className={styles.screen}>
        <p className={styles.loading}>{content.configure.loading}</p>
      </main>
    );
  }
  return isSendable ? (
    <DesignContactPage designId={designId} />
  ) : (
    <UnavailablePage designId={designId} />
  );
}

/** The one place the form's memory is mounted: a second instance would be a second form with its own copy of what was
 *  typed, and a hidden twin would be a form that could still be sent. */
function DesignContactPage({ designId }: { readonly designId: DesignId }) {
  const locale = useServedLocale();
  const review = useReview();
  const submission = useContactSubmission({ target: DESIGN_TARGET, locale });

  return (
    <main className={styles.screen}>
      <TopBar designId={designId} />
      <DesignContactBody
        designId={designId}
        review={review}
        submission={submission}
      />
    </main>
  );
}

function DesignContactBody({
  designId,
  review,
  submission,
}: {
  readonly designId: DesignId;
  readonly review: ReviewView;
  readonly submission: ContactSubmission;
}) {
  const content = useContent();
  const refusal = refusalOf(review);
  if (submission.phase.kind === "sent") {
    return <SentLine reference={submission.phase.reference} />;
  }
  if (refusal !== undefined) {
    return <RefusedDesign designId={designId} refusal={refusal} />;
  }
  return (
    <ContactForm
      submission={submission}
      sendingLine={content.contact.sendingLine}
      reviewLink={
        <ReviewLink
          designId={designId}
          className={styles.reviewLink}
          data-testid="contact-outcome-review-link"
        >
          {content.contact.reviewLink}
        </ReviewLink>
      }
    >
      <Intro />
      {review.kind === "available" ? (
        <ContactDesignCard review={review} />
      ) : null}
    </ContactForm>
  );
}

/** Where the server cannot take a request: the sentence, and the bar that leads back. No form, no input and no button,
 *  and the browser sends nothing. The shop's telephone is not drawn: no number has been given. */
function UnavailablePage({ designId }: { readonly designId: DesignId }) {
  const content = useContent();
  return (
    <main className={styles.screen}>
      <TopBar designId={designId} />
      <div className={styles.body}>
        <p className={styles.sentence} data-testid="contact-unavailable">
          {content.contact.unavailable}
        </p>
      </div>
    </main>
  );
}

/** The answer that the request is stored: one line with its reference, in place of the form. */
function SentLine({ reference }: { readonly reference: string }) {
  const content = useContent();
  return (
    <div className={styles.body}>
      <p className={styles.sent} role="status" data-testid="contact-sent">
        {content.contactOutcome({ kind: "sent", reference })}
      </p>
    </div>
  );
}

function useServedLocale(): AppLocale {
  const locale = useLocale();
  const served = routing.locales.find((candidate) => candidate === locale);
  if (served === undefined) {
    throw new Error(`ContactScreen: "${locale}" is not a served locale`);
  }
  return served;
}

/** The review's own refusal, when it has one: whatever it will not offer, this page does not send. */
function refusalOf(review: ReviewView): RefusedSubmit | undefined {
  return review.submit.kind === "refused" ? review.submit : undefined;
}

/** The bar the review draws, as shipped (frame 4A's `‹`, the title and the language menu); no material pill (ADR 0148
 *  A3) and no step pill, which the review does not draw either. The way back is the review, fetched. */
function TopBar({ designId }: { readonly designId: DesignId }) {
  const content = useContent();
  return (
    <header className={styles.nav}>
      <ReviewLink
        designId={designId}
        className={styles.back}
        aria-label={content.configure.backAction}
        data-testid="contact-back"
      >
        <span aria-hidden="true">‹</span>
      </ReviewLink>
      <span className={styles.navTitle} data-testid="contact-top-bar-title">
        {content.contact.topBarTitle}
      </span>
      <div className={styles.localeSlot}>
        <LocaleMenu />
      </div>
    </header>
  );
}

function Intro() {
  const content = useContent();
  return (
    <div className={styles.head}>
      <h1 className={styles.heading}>{content.contact.heading}</h1>
      <p className={styles.subheading}>{content.contact.subheading}</p>
    </div>
  );
}

/** A design the review will not offer: the sentence the review gives for it and the way back to it, and no form. */
function RefusedDesign({
  designId,
  refusal,
}: {
  readonly designId: DesignId;
  readonly refusal: RefusedSubmit;
}) {
  const content = useContent();
  return (
    <div className={styles.body} data-testid="contact-refused">
      <div className={styles.head}>
        <h1 className={styles.heading}>{content.review.title}</h1>
      </div>
      <p className={styles.refusal} data-section="refusal">
        {content.review.refusalReasons[refusal.code]}
      </p>
      <ReviewLink
        designId={designId}
        className={styles.reviewLink}
        data-testid="contact-review-link"
      >
        {content.contact.reviewLink}
      </ReviewLink>
    </div>
  );
}
