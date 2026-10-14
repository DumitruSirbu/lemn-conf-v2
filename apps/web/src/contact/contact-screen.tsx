"use client";

import type { DesignId } from "@lemnaria/configurator-domain";
import type { DesignRevision } from "@lemnaria/persistence";
import { useLocale } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { WebGLUnavailable } from "@/components/webgl-unavailable";
import { ChannelSummary, ResultHeading } from "@/done/done-screen";
import type { SentReferenceAnswer } from "@/done/result-to-show";
import { forgetSentRequest } from "@/done/sent-request-memory";
import { SentReferenceCard } from "@/done/sent-reference-card";
import { useReplaceWithDone } from "@/done/use-replace-with-done";
import type { SubmissionChannelLine } from "@/i18n/content";
import { useContent } from "@/i18n/use-content";
import { routing, type AppLocale } from "@/i18n/routing";
import { ReviewLink } from "@/result/review-link";
import { OpenEditorLink } from "@/review/open-editor-link";
import type { RefusedSubmit, ReviewView } from "@/review/review-model";
import { useReview } from "@/review/use-review";
import { useWebGLSupport } from "@/scene/webgl-support";
import { CallShopLink } from "@/shop/call-shop-link";
import {
  hasUnsavedEdit,
  useConfiguratorStore,
} from "@/store/configurator-store";

import { AlreadySentView } from "./already-sent-view";
import { ContactDesignCard } from "./contact-design-card";
import { ContactForm } from "./contact-form";
import type { ContactFormValues } from "./contact-form-model";
import { isSendOff } from "./contact-outcome";
import {
  contactPageViewOf,
  nextContactPageView,
  type ContactPageView,
  type ContactPageViewInput,
} from "./contact-page-view";
import { ReviewBackLink, StartBackLink, TopBar } from "./contact-top-bar";
import styles from "./contact.module.css";
import { SubmissionFailure, useFailureView } from "./submission-failure";
import {
  CALLBACK_TARGET,
  DESIGN_TARGET,
  useContactSubmission,
  type ContactSubmission,
  type ContactTarget,
} from "./use-contact-submission";

export interface ContactScreenProps {
  readonly designId: DesignId;
  /** The stored revision the page was loaded at: what `sentReference` answers for. It is the page's, never the one a
   *  request carries, so it is named for what it is and goes no further than the decision. */
  readonly loadedRevision: DesignRevision;
  /** Whether the server can take a request at all: a mail sender and a digest secret it can use. A boolean and nothing
   *  of how it was decided, since that must not reach the page. */
  readonly isSendable: boolean;
  /** What the server said of this design at `revision`. Nothing more of its row reaches the page. */
  readonly sentReference: SentReferenceAnswer;
}

/**
 * The contact page of a stored design (frames 4A to 4C). While the device is still being asked it is the editor's
 * loading line and no figure. A kitchen already sent for shows its request and no form, on any device, since that view
 * shows no price. Otherwise, on a device that cannot show the kitchen it is the editor's own exit, as the review is,
 * since the card shows a price for a kitchen that device cannot show; and where the server cannot take a request it is a
 * sentence saying so and no form. Every hook is called before the first return, so the order never changes.
 */
export function ContactScreen({
  designId,
  loadedRevision,
  isSendable,
  sentReference,
}: ContactScreenProps) {
  const content = useContent();
  const support = useWebGLSupport();
  const view = useLatchedContactPageView({
    server: sentReference,
    page: { designId, revision: loadedRevision },
  });
  useForgetSentRequestOnMount();

  if (support === "probing") {
    return (
      <main className={styles.screen}>
        <p className={styles.loading}>{content.configure.loading}</p>
      </main>
    );
  }
  if (view.kind === "already-sent") {
    return <AlreadySentView designId={designId} reference={view.reference} />;
  }
  if (support === "unsupported") return <WebGLUnavailable />;
  return isSendable ? (
    <DesignContactPage designId={designId} />
  ) : (
    <UnavailablePage backLink={<ReviewBackLink designId={designId} />} />
  );
}

/** A design contact page's mount drops what an earlier request left, in every arm it draws, so the hand-over never
 *  predates the latest design contact page. It outlives the form that wrote it on purpose: the page that follows reads
 *  it. */
function useForgetSentRequestOnMount(): void {
  useEffect(() => {
    forgetSentRequest();
  }, []);
}

/** The view for this render, kept in state so that a form once decided is the form for the rest of the mount. The state
 *  is set while rendering, so the frame that would have drawn the sent view after the store moved on is never committed. */
function useLatchedContactPageView(
  pageInput: Omit<ContactPageViewInput, "held">,
): ContactPageView {
  const designId = useConfiguratorStore((state) => state.designId);
  const revision = useConfiguratorStore((state) => state.revision);
  const isUnsaved = useConfiguratorStore(hasUnsavedEdit);
  const input: ContactPageViewInput = {
    ...pageInput,
    held: { designId, revision, hasUnsavedEdit: isUnsaved },
  };
  const [latched, setLatched] = useState(() => contactPageViewOf(input));
  const view = nextContactPageView(latched, input);
  if (view.kind !== latched.kind) setLatched(view);
  return view;
}

export interface CallbackContactScreenProps {
  /** As `ContactScreenProps.isSendable`. */
  readonly isSendable: boolean;
}

/**
 * The callback form, the way on from frame 2F: the same form with no design behind it, so no card, no figure, no wait
 * on a save and no device probe. The bar leads to the start of the configurator, since there is no review to go back to.
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
  const card =
    review.kind === "available" ? <ContactDesignCard review={review} /> : null;
  return (
    <FormOrResult
      submission={submission}
      sendingLine={content.contact.sendingLine}
      intro={{
        heading: content.contact.heading,
        subheading: content.contact.subheading,
      }}
      whenSent={<LeaveForDone designId={designId} />}
      kept={{ sentence: content.submissionResult.failureKept, card }}
      reviewLink={
        <ReviewLink
          designId={designId}
          className={styles.reviewLink}
          data-testid="contact-outcome-review-link"
        >
          {content.contact.reviewLink}
        </ReviewLink>
      }
      editorLink={
        <OpenEditorLink
          designId={designId}
          review={review}
          className={styles.reviewLink}
          data-testid="contact-open-editor"
        />
      }
    >
      {card}
    </FormOrResult>
  );
}

function CallbackContactPage() {
  const content = useContent();
  return (
    <ContactPage target={CALLBACK_TARGET} backLink={<StartBackLink />}>
      {(submission) => (
        <FormOrResult
          submission={submission}
          sendingLine={content.contact.sendingLineNoDesign}
          intro={{
            heading: content.contact.headingNoDesign,
            subheading: content.contact.subheadingNoDesign,
          }}
          whenSent={
            submission.phase.kind === "sent" ? (
              <CallbackSentView
                reference={submission.phase.reference}
                values={submission.form.values}
              />
            ) : null
          }
          kept={{
            sentence: content.submissionResult.failureKeptNoDesign,
            card: null,
          }}
        />
      )}
    </ContactPage>
  );
}

interface FormOrResultProps {
  readonly submission: ContactSubmission;
  readonly sendingLine: string;
  readonly intro: { readonly heading: string; readonly subheading: string };
  /** Mounted in place of the form, and only once the request is answered *sent*. */
  readonly whenSent: ReactNode;
  /** What 5B says stays when a send does not arrive: its sentence, and the design's card where there is a design. */
  readonly kept: { readonly sentence: string; readonly card: ReactNode };
  readonly reviewLink?: ReactNode;
  readonly editorLink?: ReactNode;
  /** What stands under the intro, above the fields. */
  readonly children?: ReactNode;
}

/**
 * The form, or what replaces it: the sent view once the request is stored, and frame 5B once a send did not arrive
 * (`unanswered`, `failed`). The form is never drawn beside either, and what was typed stays in the form's memory, which
 * is above this. Every other answer is told beside the form.
 */
function FormOrResult({
  submission,
  sendingLine,
  intro,
  whenSent,
  kept,
  reviewLink,
  editorLink,
  children,
}: FormOrResultProps) {
  const { phase, form, press } = submission;
  const { screen, hasShownFailure } = useFailureView(phase);
  if (phase.kind === "sent") return whenSent;
  if (screen !== undefined) {
    return (
      <SubmissionFailure
        screen={screen}
        isRetrying={phase.kind === "sending"}
        isRetryOff={isSendOff(submission, false)}
        keptSentence={kept.sentence}
        keptCard={kept.card}
        contactValue={contactValueOf(form.values)}
        onRetry={press}
      />
    );
  }
  return (
    <ContactForm
      submission={submission}
      sendingLine={sendingLine}
      reviewLink={reviewLink}
      editorLink={editorLink}
    >
      <Intro
        heading={intro.heading}
        subheading={intro.subheading}
        takesFocus={hasShownFailure}
      />
      {children}
    </ContactForm>
  );
}

/** The one typed value the shop would use for the channel chosen, as the request carries it: trimmed. */
function contactValueOf({ channel, email, phone }: ContactFormValues): string {
  return (channel === "email" ? email : phone).trim();
}

/**
 * The callback form's sent view, in place, since a request with no design has no confirmation to leave for: 5A's head
 * with the channel line, and the reference to copy. Nothing about a design, so no steps, picture or way back to one. A
 * reload shows the empty form.
 */
function CallbackSentView({
  reference,
  values,
}: {
  readonly reference: string;
  readonly values: ContactFormValues;
}) {
  const content = useContent().submissionResult;
  const channelLine: SubmissionChannelLine = {
    channel: values.channel,
    contact: contactValueOf(values),
  };
  return (
    <div className={styles.body} data-testid="contact-sent">
      <ResultHeading heading={content.sentHeading} isSent>
        <ChannelSummary channelLine={channelLine} />
      </ResultHeading>
      <SentReferenceCard reference={reference} />
    </div>
  );
}

/** Where the server cannot take a request: the sentence, the one link that rings the shop instead, and the bar that
 *  leads back. No form, no input and no button, and the browser sends nothing. */
function UnavailablePage({ backLink }: { readonly backLink: ReactNode }) {
  const content = useContent();
  return (
    <main className={styles.screen}>
      <TopBar backLink={backLink} />
      <div className={styles.body}>
        <p className={styles.sentence} data-testid="contact-unavailable">
          {content.contact.unavailable}
        </p>
        <CallShopLink />
      </div>
    </main>
  );
}

/** The design form's way out once its request is sent: the confirmation replaces this page. The sending line stays
 *  until it arrives, so the page is never blank (ADR 0160 D3). */
function LeaveForDone({ designId }: { readonly designId: DesignId }) {
  const content = useContent();
  useReplaceWithDone(designId);
  return (
    <div className={styles.body}>
      <p
        className={styles.sendingLine}
        role="status"
        data-testid="contact-leaving-line"
      >
        {content.contact.sendingLine}
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

function Intro({
  heading,
  subheading,
  takesFocus,
}: {
  readonly heading: string;
  readonly subheading: string;
  /** The form is back from frame 5B, whose retry held the focus: the `h1` takes it, so it is not left on a removed
   *  element. */
  readonly takesFocus: boolean;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (takesFocus) headingRef.current?.focus();
  }, [takesFocus]);
  return (
    <div className={styles.head}>
      <h1
        ref={headingRef}
        tabIndex={takesFocus ? -1 : undefined}
        className={styles.heading}
      >
        {heading}
      </h1>
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
