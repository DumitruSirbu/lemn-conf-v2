"use client";

import type { DesignId } from "@lemnaria/configurator-domain";
import { useEffect, useId, useRef, type RefObject } from "react";

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
import { useSaveWait, type SaveWait } from "@/review/use-save-wait";
import { useWebGLSupport } from "@/scene/webgl-support";

import styles from "./review.module.css";

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
  const saveWaitSentenceId = useId();
  const saveWait = useSaveWait();

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
      <BottomRegion
        review={review}
        refusalSentenceId={refusalSentenceId}
        saveWait={saveWait}
        saveWaitSentenceId={saveWaitSentenceId}
        designId={designId}
      />
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
      <span className={styles.navTitle} data-testid="review-top-bar-title">
        {content.reviewScreen.topBarTitle}
      </span>
      {/* The menu's cell carries the editor's rule under it, which the review's taller bar would show floating. */}
      <div className={styles.localeSlot}>
        <LocaleMenu />
      </div>
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
      <ReviewScene support="supported">
        <Link
          prefetch={false}
          className={styles.view3d}
          href={editorHref(designId)}
        >
          {content.reviewScreen.view3d}
        </Link>
      </ReviewScene>
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
          rowDetails={review.rowDetails}
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

/** Pinned: the flagged total's sentence when flagged, the refusal's when refused, the save's while it is owed, the
 *  figure, the call to action. The call to action is never off without a sentence standing in this same region. */
function BottomRegion({
  review,
  refusalSentenceId,
  saveWait,
  saveWaitSentenceId,
  designId,
}: {
  readonly review: ReviewView;
  readonly refusalSentenceId: string;
  readonly saveWait: SaveWait;
  readonly saveWaitSentenceId: string;
  readonly designId: DesignId;
}) {
  const content = useContent();
  const submit = review.submit;
  const regionRef = useRef<HTMLDivElement>(null);
  useKeepFocusAboveThe(regionRef);
  return (
    <div className={styles.bottom} ref={regionRef} data-testid="review-bottom">
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
      {saveWait.kind === "waiting" ? (
        <p
          id={saveWaitSentenceId}
          className={saveWait.hasFailed ? styles.refusal : styles.waiting}
          data-testid="review-save-wait"
        >
          {saveWait.sentence}
        </p>
      ) : null}
      {saveWait.kind === "waiting" && saveWait.isSettledInTheEditor ? (
        <Link
          className={styles.openEditor}
          href={editorHref(designId, selectingTheFirstBody(review))}
          prefetch={false}
          data-testid="review-open-editor"
        >
          {content.reviewScreen.openEditor}
        </Link>
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
          designId={designId}
          reasonIds={[
            ...(submit.kind === "refused" ? [refusalSentenceId] : []),
            ...(saveWait.kind === "waiting" ? [saveWaitSentenceId] : []),
          ]}
        />
      </div>
    </div>
  );
}

/** A link when nothing stands in its way, otherwise off and announced with the sentences that say why. */
function CallToAction({
  designId,
  reasonIds,
}: {
  readonly designId: DesignId;
  readonly reasonIds: readonly string[];
}) {
  const content = useContent();
  if (reasonIds.length === 0) {
    return (
      <Link
        className={styles.cta}
        href={`/d/${designId}/contact`}
        prefetch={false}
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
      aria-describedby={reasonIds.join(" ")}
      data-section="callToAction"
      data-testid="review-cta"
    >
      {content.reviewScreen.callToAction}
    </button>
  );
}

/**
 * Where the link to the editor lands, so that a conflict is on screen when it does: the editor draws a conflict, and
 * its controls, in the panel, and the panel needs a selection. The first body in display order, which is the first
 * row of the first group, as each group's *Editează* takes it. A review with no rows (one that cannot be shown, or a
 * kitchen with no body) has no body to name, and the link then lands on the editor as it is.
 */
function selectingTheFirstBody(review: ReviewView): { select?: string } {
  if (review.kind !== "available") return {};
  const firstBody = review.groups[0]?.rows[0];
  return firstBody === undefined ? {} : { select: firstBody.key };
}

/**
 * Keeps whatever takes keyboard focus clear of the pinned region. The page scrolls under a sticky region, and a
 * browser scrolls a focused box only until it is in the viewport, which is under the region's top edge. The viewport's
 * `scroll-padding-bottom` is that edge, read from the region's own height as it changes (one sentence or three, any
 * language), so no number is kept in step with the layout. Restored when the screen goes.
 */
function useKeepFocusAboveThe(region: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = region.current;
    if (element === null) return;
    const viewport = document.documentElement;
    const reserve = () => {
      viewport.style.scrollPaddingBottom = `calc(${String(element.getBoundingClientRect().height)}px + var(--safe-gap))`;
    };
    reserve();
    const observer = new ResizeObserver(reserve);
    observer.observe(element);
    return () => {
      observer.disconnect();
      viewport.style.removeProperty("scroll-padding-bottom");
    };
  }, [region]);
}
