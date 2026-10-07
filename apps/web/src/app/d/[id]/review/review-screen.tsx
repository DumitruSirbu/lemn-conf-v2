"use client";

import type { DesignId } from "@lemnaria/configurator-domain";
import { useId } from "react";

import { LocaleMenu } from "@/app/configurator/configure/locale-menu";
import { WebGLUnavailable } from "@/components/webgl-unavailable";
import { Link } from "@/i18n/navigation";
import { useContent } from "@/i18n/use-content";
import {
  editorHref,
  ReviewGroups,
  ReviewWholeKitchenRows,
} from "@/review/review-groups";
import type {
  AvailableReview,
  RefusedSubmit,
  ReviewView,
} from "@/review/review-model";
import { ReviewScene } from "@/review/review-scene";
import { useReview } from "@/review/use-review";
import { useWebGLSupport } from "@/scene/webgl-support";

import styles from "./review.module.css";

const CONTACT_PLACEHOLDER_HREF = "/configurator/contact";

/**
 * The review of the design the store holds (frames 3A and 3B). On a device that cannot show the kitchen it is the
 * editor's own exit and nothing of the review, since a price would be offered for a configuration that cannot be
 * seen; while that is still being asked it is the editor's loading line and no figure.
 */
export function ReviewScreen({ designId }: { designId: DesignId }) {
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
  return <ReviewPage designId={designId} />;
}

function ReviewPage({ designId }: { designId: DesignId }) {
  const review = useReview();
  const refusalSentenceId = useId();

  return (
    <main className={styles.screen}>
      <TopBar designId={designId} />
      <div className={styles.body}>
        {review.kind === "available" ? (
          <AvailableBody
            designId={designId}
            review={review}
            refusalSentenceId={refusalSentenceId}
          />
        ) : (
          <UnavailableBody
            designId={designId}
            submit={review.submit}
            refusalSentenceId={refusalSentenceId}
          />
        )}
      </div>
      <BottomRegion review={review} refusalSentenceId={refusalSentenceId} />
    </main>
  );
}

function TopBar({ designId }: { designId: DesignId }) {
  const content = useContent();
  return (
    <header className={styles.nav}>
      <Link
        prefetch={false}
        className={styles.back}
        href={editorHref(designId)}
        aria-label={content.configure.backAction}
        data-testid="review-back"
      >
        <span aria-hidden="true">‹</span>
      </Link>
      <LocaleMenu />
    </header>
  );
}

interface BodyProps {
  readonly designId: DesignId;
  readonly refusalSentenceId: string;
}

/** The sections in `REVIEW_READING_ORDER`, each tagged with its name; the scene and the named bodies are the
 *  screen's own and carry no tag. */
function AvailableBody({
  designId,
  review,
  refusalSentenceId,
}: BodyProps & { readonly review: AvailableReview }) {
  const content = useContent();
  const markedPlacementIds = new Set(
    review.submit.kind === "refused"
      ? review.submit.bodies.map((body) => body.placementId)
      : [],
  );
  return (
    <>
      <div className={styles.head}>
        <h1 className={styles.title} data-section="title">
          {review.title}
        </h1>
        <p className={styles.roomLine} data-section="roomLine">
          {review.roomLine}
        </p>
      </div>
      <div className={styles.scene}>
        <ReviewScene />
        <Link
          prefetch={false}
          className={styles.view3d}
          href={editorHref(designId)}
        >
          {content.reviewScreen.view3d}
        </Link>
      </div>
      <div className={styles.settingsRow} data-section="settingsRow">
        <div className={styles.settingsText}>
          <span className={styles.settingsNames}>
            {review.settingsRow.settings.map((setting) => (
              <span key={setting}>{setting}</span>
            ))}
          </span>
          <span className={styles.settingsHeading}>
            {review.settingsRow.heading}
          </span>
        </div>
        <Link
          prefetch={false}
          className={styles.action}
          href={editorHref(designId, { settings: "open" })}
        >
          {content.reviewScreen.changeSettings}
        </Link>
      </div>
      <div className={styles.groups} data-section="groups">
        <ReviewGroups
          designId={designId}
          groups={review.groups}
          markedPlacementIds={markedPlacementIds}
          refusalSentenceId={refusalSentenceId}
        />
      </div>
      <div data-section="wholeKitchenRows">
        <ReviewWholeKitchenRows rows={review.wholeKitchenRows} />
      </div>
      <NotIncluded lines={review.notIncluded.lines} />
      <div className={styles.disclaimer} data-section="disclaimer">
        <p className={styles.disclaimerLine}>{review.disclaimer.rounding}</p>
        <p className={styles.disclaimerLine}>{review.disclaimer.notice}</p>
      </div>
      {review.submit.kind === "refused" ? (
        <NamedBodies
          designId={designId}
          submit={review.submit}
          refusalSentenceId={refusalSentenceId}
        />
      ) : null}
    </>
  );
}

/** A review that cannot be shown: no figure, no zero, no rows, no not-included block and no scene, only why and the
 *  way back. */
function UnavailableBody({
  designId,
  submit,
  refusalSentenceId,
}: BodyProps & { readonly submit: RefusedSubmit }) {
  const content = useContent();
  return (
    <>
      <div className={styles.head}>
        <h1 className={styles.title}>{content.review.title}</h1>
      </div>
      <Link
        prefetch={false}
        className={styles.unavailableBack}
        href={editorHref(designId)}
        data-testid="review-unavailable-back"
      >
        {content.configure.backAction}
      </Link>
      <NamedBodies
        designId={designId}
        submit={submit}
        refusalSentenceId={refusalSentenceId}
      />
    </>
  );
}

function NotIncluded({ lines }: { readonly lines: readonly string[] }) {
  const content = useContent();
  const headingId = useId();
  return (
    <section
      className={styles.notIncluded}
      aria-labelledby={headingId}
      data-section="notIncluded"
    >
      <h2 id={headingId} className={styles.notIncludedHeading}>
        {content.priceBreakdown.notIncluded}
      </h2>
      {lines.map((line) => (
        <p key={line} className={styles.notIncludedLine}>
          {line}
        </p>
      ))}
    </section>
  );
}

/** The bodies a refusal names, each a way to the editor with that body selected. The labels are the model's. */
function NamedBodies({
  designId,
  submit,
  refusalSentenceId,
}: BodyProps & { readonly submit: RefusedSubmit }) {
  if (submit.bodies.length === 0) return null;
  return (
    <ul
      className={styles.named}
      aria-describedby={refusalSentenceId}
      data-testid="review-named-bodies"
    >
      {submit.bodies.map((body) => (
        <li key={body.placementId}>
          <Link
            prefetch={false}
            className={styles.namedLink}
            href={editorHref(designId, { select: body.placementId })}
          >
            {body.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Pinned: the flagged total's sentence when flagged, the refusal's when refused, the figure, the call to action.
 *  The call to action is never off without its sentence standing in this same region. */
function BottomRegion({
  review,
  refusalSentenceId,
}: {
  readonly review: ReviewView;
  readonly refusalSentenceId: string;
}) {
  const content = useContent();
  const submit = review.submit;
  return (
    <div className={styles.bottom} data-testid="review-bottom">
      {review.kind === "available" && review.overflowWarning !== undefined ? (
        <p className={styles.flagged} data-section="overflowWarning">
          {review.overflowWarning}
        </p>
      ) : null}
      {submit.kind === "refused" ? (
        <p
          id={refusalSentenceId}
          className={styles.refusal}
          data-section="refusal"
        >
          {content.review.refusalReasons[submit.code]}
        </p>
      ) : null}
      <div className={styles.buyRow}>
        {review.kind === "available" ? (
          <p className={styles.figure} data-section="figure">
            <span className={styles.figureLabel}>{review.figure.label}</span>
            <span className={styles.figureAmount}>
              {review.figure.amountText}
            </span>
          </p>
        ) : null}
        <CallToAction
          isAllowed={submit.kind === "allowed"}
          refusalSentenceId={refusalSentenceId}
        />
      </div>
    </div>
  );
}

function CallToAction({
  isAllowed,
  refusalSentenceId,
}: {
  readonly isAllowed: boolean;
  readonly refusalSentenceId: string;
}) {
  const content = useContent();
  if (isAllowed) {
    return (
      <Link
        className={styles.cta}
        href={CONTACT_PLACEHOLDER_HREF}
        data-section="callToAction"
        data-testid="review-cta"
      >
        {content.reviewScreen.callToAction}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={styles.cta}
      aria-disabled="true"
      aria-describedby={refusalSentenceId}
      data-section="callToAction"
      data-testid="review-cta"
    >
      {content.reviewScreen.callToAction}
    </button>
  );
}
