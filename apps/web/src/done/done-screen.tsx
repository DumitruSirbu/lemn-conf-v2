"use client";

import type { DesignId } from "@lemnaria/configurator-domain";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";

import { LocaleMenu } from "@/app/configurator/configure/locale-menu";
import { useKeepFocusAbove } from "@/components/use-keep-focus-above";
import { ReviewLink } from "@/contact/review-link";
import type { Content } from "@/i18n/content";
import { Link } from "@/i18n/navigation";
import { useContent } from "@/i18n/use-content";
import { editorHref } from "@/review/design-hrefs";
import { KitchenPicture } from "@/review/review-scene";
import type { SceneView } from "@/scene/scene-view";
import { useWebGLSupport } from "@/scene/webgl-support";

import styles from "./done.module.css";
import {
  resultToShow,
  type ResultToShow,
  type SentReferenceAnswer,
  type SentResult,
} from "./result-to-show";
import { SendOnWhatsapp } from "./send-on-whatsapp";
import { SentReferenceCard } from "./sent-reference-card";
import { recallSentRequest, type SentRequest } from "./sent-request-memory";

export interface DoneScreenProps {
  readonly designId: DesignId;
  /** The stored design's revision, which the request named and the picture shows. */
  readonly revision: string;
  /** What the server read for this design at this revision, as a plain value. */
  readonly sentReference: SentReferenceAnswer;
}

/** The picture is the room as a whole, whatever view the customer last stood at in the editor. */
const OVERVIEW_VIEW: SceneView = { kind: "preset", id: "overview" };

/**
 * The confirmation of a sent request (frame 5A), and its two views for a design with none to show. What it claims comes
 * from `resultToShow` alone. The `h1` takes focus when the screen mounts, whether the customer arrived by a send or by
 * a load.
 */
export function DoneScreen({
  designId,
  revision,
  sentReference,
}: DoneScreenProps) {
  const handedOver = useHandedOverRequest({ designId, revision });
  const result = resultToShow({
    page: { designId, revision },
    handedOver,
    server: sentReference,
  });

  return (
    <main className={styles.screen}>
      <TopBar isSent={result.kind === "sent"} />
      <div className={styles.body}>
        <ResultHead result={result} />
        {result.kind === "sent" ? (
          <SentBody reference={result.reference} />
        ) : (
          <ReviewAgainLink designId={designId} />
        )}
      </div>
      {result.kind === "sent" ? <PinnedActions designId={designId} /> : null}
    </main>
  );
}

/** The sent request's memory is a variable no event changes while this screen is up, so there is nothing to subscribe
 *  to; the server snapshot is *none*, so a server render and the first client render agree. */
function useHandedOverRequest(page: {
  readonly designId: string;
  readonly revision: string;
}): SentRequest | undefined {
  return useSyncExternalStore(
    subscribeToNothing,
    () => handedOverTo(page),
    nothingHandedOver,
  );
}

function subscribeToNothing(): () => void {
  return () => undefined;
}

function nothingHandedOver(): undefined {
  return undefined;
}

/** The entry itself, whose identity holds until the next sent request, so repeated reads agree. */
function handedOverTo(page: {
  readonly designId: string;
  readonly revision: string;
}): SentRequest | undefined {
  const recalled = recallSentRequest(page);
  return recalled.kind === "remembered" ? recalled.request : undefined;
}

/** A view that claims no request is not titled as one: *Cerere trimisă* is the sent screen's alone. */
function TopBar({ isSent }: { readonly isSent: boolean }) {
  const content = useContent();
  return (
    <header className={styles.nav}>
      {isSent ? <span className={styles.barMark} aria-hidden="true" /> : null}
      <span className={styles.navTitle} data-testid="done-top-bar-title">
        {isSent
          ? content.submissionResult.topBarTitle
          : content.contact.topBarTitle}
      </span>
      <div className={styles.localeSlot}>
        <LocaleMenu />
      </div>
    </header>
  );
}

/** The one `h1`, kept in place when the view changes under it, so that the focus it took stays on it. */
function ResultHead({ result }: { readonly result: ResultToShow }) {
  const content = useContent().submissionResult;
  return (
    <ResultHeading
      heading={headingOf(result, content)}
      isSent={result.kind === "sent"}
    >
      {result.kind === "sent" ? (
        <SentSummary channelLine={result.channelLine} />
      ) : null}
    </ResultHeading>
  );
}

/** The head of a result: the ✓ disc where a request was sent, the one `h1`, which takes focus when it mounts, and what
 *  stands under it. The contact page's own sent view for a request with no design is made of the same head. */
export function ResultHeading({
  heading,
  isSent,
  children,
}: {
  readonly heading: string;
  readonly isSent: boolean;
  readonly children?: ReactNode;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className={styles.head}>
      {isSent ? <span className={styles.disc} aria-hidden="true" /> : null}
      <h1
        ref={headingRef}
        tabIndex={-1}
        className={styles.heading}
        data-testid="done-heading"
      >
        {heading}
      </h1>
      {children}
    </div>
  );
}

function headingOf(
  result: ResultToShow,
  content: Content["submissionResult"],
): string {
  switch (result.kind) {
    case "sent":
      return content.sentHeading;
    case "no-request":
      return content.noRequest;
    case "not-shown":
      return content.notShown;
  }
}

/** How the shop will reach the customer, naming the typed value only where the request was sent from this screen's
 *  own tab, then that the design is kept. */
function SentSummary({
  channelLine,
}: {
  readonly channelLine: SentResult["channelLine"];
}) {
  const content = useContent().submissionResult;
  return (
    <ChannelSummary channelLine={channelLine}>
      <span data-testid="done-saved-sentence">{content.savedSentence}</span>
    </ChannelSummary>
  );
}

/** The sentence that says how the shop will reach the customer, with whatever follows it in the same paragraph. */
export function ChannelSummary({
  channelLine,
  children,
}: {
  readonly channelLine: SentResult["channelLine"];
  readonly children?: ReactNode;
}) {
  const content = useContent().submissionResult;
  return (
    <p className={styles.summary} data-testid="done-summary">
      <span data-testid="done-channel-line">
        {channelLine === undefined
          ? content.channelLineWithoutValue
          : content.channelLine(channelLine)}
      </span>
      {children === undefined ? null : <> {children}</>}
    </p>
  );
}

function SentBody({ reference }: { readonly reference: string }) {
  return (
    <>
      <SentReferenceCard reference={reference} />
      <NextSteps />
      <ResultPicture />
    </>
  );
}

/** The three steps are a slot until the owner confirms them line by line, and say so; none of them names a figure. */
function NextSteps() {
  const content = useContent().submissionResult;
  const steps = [
    content.nextStepVerify,
    content.nextStepFinalPrice,
    content.nextStepMeasure,
  ];
  return (
    <section className={styles.steps} data-testid="done-steps">
      <div className={styles.stepsHead}>
        <h2 className={styles.stepsHeading}>{content.nextStepsTitle}</h2>
        <span className={styles.marker} data-testid="done-steps-provisional">
          {content.nextStepsProvisionalMarker}
        </span>
      </div>
      <ol className={styles.stepList}>
        {steps.map((step, index) => (
          <li key={step} className={styles.step}>
            <span className={styles.stepNumber} aria-hidden="true">
              {index + 1}
            </span>
            <span className={styles.stepText}>{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Decoration only: the kitchen as a whole. Probing or without WebGL it is the frame's neutral square, and nothing
 *  else on the screen waits for the probe. */
function ResultPicture() {
  const support = useWebGLSupport();
  return (
    <div
      className={styles.picture}
      aria-hidden="true"
      data-testid="done-picture"
    >
      <KitchenPicture support={support} view={OVERVIEW_VIEW} fallback={null} />
    </div>
  );
}

/** The way to the review, which asks the server for the design as it now stands. */
function ReviewAgainLink({ designId }: { readonly designId: DesignId }) {
  const content = useContent().submissionResult;
  return (
    <ReviewLink
      designId={designId}
      className={styles.reviewLink}
      data-testid="done-review-link"
    >
      {content.reviewLink}
    </ReviewLink>
  );
}

/** Pinned at the foot: the way back to the design under whatever the screen offers above it, which is the WhatsApp
 *  action where the customer may share this design and nothing where they may not. */
function PinnedActions({ designId }: { readonly designId: DesignId }) {
  const content = useContent().submissionResult;
  const regionRef = useRef<HTMLDivElement>(null);
  useKeepFocusAbove(regionRef);
  return (
    <div className={styles.bottom} ref={regionRef} data-testid="done-bottom">
      <SendOnWhatsapp designId={designId} />
      <Link
        prefetch={false}
        className={styles.backToDesign}
        href={editorHref(designId)}
        data-testid="done-back-to-design"
      >
        {content.backToDesign}
      </Link>
    </div>
  );
}
