"use client";

import type { DesignId } from "@lemnaria/configurator-domain";
import { useLocale } from "next-intl";
import type { ReactNode } from "react";

import { LocaleMenu } from "@/app/configurator/configure/locale-menu";
import { StartLink } from "@/components/start-link";
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
  CALLBACK_TARGET,
  DESIGN_TARGET,
  useContactSubmission,
  type ContactSubmission,
  type ContactTarget,
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
    <UnavailablePage backLink={<ReviewBackLink designId={designId} />} />
  );
}

export interface CallbackContactScreenProps {
  /** As `ContactScreenProps.isSendable`. */
  readonly isSendable: boolean;
}

/**
 * The callback form, the way on from frame 2F (Q12 (i), 8L.10): the same form with no design behind it, so no card, no
 * figure and no wait on a save, and no probe of the device: 2F is how a customer reaches it. The bar leads to the start
 * of the configurator, since there is no review to go back to.
 */
export function CallbackContactScreen({
  isSendable,
}: CallbackContactScreenProps) {
  return isSendable ? (
    <CallbackContactPage />
  ) : (
    <UnavailablePage backLink={<StartBackLink />} />
  );
}

interface ContactPageProps {
  readonly target: ContactTarget;
  readonly backLink: ReactNode;
  /** What stands under the bar, given the form's memory. */
  readonly children: (submission: ContactSubmission) => ReactNode;
}

/** The one place the form's memory is mounted: a second instance would be a second form with its own copy of what was
 *  typed, and a hidden twin would be a form that could still be sent. */
function ContactPage({ target, backLink, children }: ContactPageProps) {
  const locale = useServedLocale();
  const submission = useContactSubmission({ target, locale });

  return (
    <main className={styles.screen}>
      <TopBar backLink={backLink} />
      {children(submission)}
    </main>
  );
}

function DesignContactPage({ designId }: { readonly designId: DesignId }) {
  return (
    <ContactPage
      target={DESIGN_TARGET}
      backLink={<ReviewBackLink designId={designId} />}
    >
      {(submission) => (
        <DesignContactBody designId={designId} submission={submission} />
      )}
    </ContactPage>
  );
}

function DesignContactBody({
  designId,
  submission,
}: {
  readonly designId: DesignId;
  readonly submission: ContactSubmission;
}) {
  const content = useContent();
  const review = useReview();
  const refusal = refusalOf(review);
  if (refusal !== undefined && submission.phase.kind !== "sent") {
    return <RefusedDesign designId={designId} refusal={refusal} />;
  }
  return (
    <SentOrForm
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
      <Intro
        heading={content.contact.heading}
        subheading={content.contact.subheading}
      />
      {review.kind === "available" ? (
        <ContactDesignCard review={review} />
      ) : null}
    </SentOrForm>
  );
}

function CallbackContactPage() {
  const content = useContent();
  return (
    <ContactPage target={CALLBACK_TARGET} backLink={<StartBackLink />}>
      {(submission) => (
        <SentOrForm
          submission={submission}
          sendingLine={content.contact.sendingLineNoDesign}
        >
          <Intro
            heading={content.contact.headingNoDesign}
            subheading={content.contact.subheadingNoDesign}
          />
        </SentOrForm>
      )}
    </ContactPage>
  );
}

/** The form, or the line that says the request is stored once it is: the form is never drawn beside it. */
function SentOrForm({
  submission,
  sendingLine,
  reviewLink,
  children,
}: {
  readonly submission: ContactSubmission;
  readonly sendingLine: string;
  readonly reviewLink?: ReactNode;
  readonly children: ReactNode;
}) {
  if (submission.phase.kind === "sent") {
    return <SentLine reference={submission.phase.reference} />;
  }
  return (
    <ContactForm
      submission={submission}
      sendingLine={sendingLine}
      reviewLink={reviewLink}
    >
      {children}
    </ContactForm>
  );
}

/** Where the server cannot take a request: the sentence, and the bar that leads back. No form, no input and no button,
 *  and the browser sends nothing. The shop's telephone is not drawn: no number has been given. */
function UnavailablePage({ backLink }: { readonly backLink: ReactNode }) {
  const content = useContent();
  return (
    <main className={styles.screen}>
      <TopBar backLink={backLink} />
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
 *  A3) and no step pill, which the review does not draw either. */
function TopBar({ backLink }: { readonly backLink: ReactNode }) {
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
function ReviewBackLink({ designId }: { readonly designId: DesignId }) {
  const content = useContent();
  return (
    <ReviewLink
      designId={designId}
      className={styles.back}
      aria-label={content.configure.backAction}
      data-testid="contact-back"
    >
      <span aria-hidden="true">‹</span>
    </ReviewLink>
  );
}

/** The way back for a form with no design: the start of the configurator. */
function StartBackLink() {
  const content = useContent();
  return (
    <StartLink
      className={styles.back}
      aria-label={content.configure.backAction}
      data-testid="contact-back"
    >
      <span aria-hidden="true">‹</span>
    </StartLink>
  );
}

function Intro({
  heading,
  subheading,
}: {
  readonly heading: string;
  readonly subheading: string;
}) {
  return (
    <div className={styles.head}>
      <h1 className={styles.heading}>{heading}</h1>
      <p className={styles.subheading}>{subheading}</p>
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
