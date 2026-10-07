"use client";

import type { DesignId } from "@lemnaria/configurator-domain";
import { useId } from "react";

import type { Content } from "@/i18n/content";

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
import type { SaveStatus } from "@/persistence/save-coalescer";
import { useConfiguratorStore } from "@/store/configurator-store";

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

/** Whether the design on screen is the one the server holds. An edit made in the editor can still be queued or in
 *  flight when the review opens, and a request for an offer must not go out for a design the server does not have. */
type SaveWait =
  | { readonly kind: "saved" }
  | {
      readonly kind: "waiting";
      readonly sentence: string;
      /** The wait is one the customer ends in the editor, so the sentence comes with a way there. */
      readonly isSettledInTheEditor: boolean;
    };

function useSaveWait(): SaveWait {
  const content = useContent();
  const isSaved = useConfiguratorStore(
    (state) => state.design === state.savedDesign,
  );
  const saveStatus = useConfiguratorStore((state) => state.saveStatus);
  if (isSaved) return { kind: "saved" };
  return {
    kind: "waiting",
    sentence: sentenceForUnsavedEdit(saveStatus, content),
    isSettledInTheEditor: saveStatus === "conflict",
  };
}

/** What the customer is told while an edit is unsaved: that it is being saved, or, once the save has failed, the
 *  sentence the editor already says for that failure. The exception is a conflict: the editor's sentence names
 *  reload and overwrite, which this screen does not have, so the review says where the choice is made. */
function sentenceForUnsavedEdit(
  saveStatus: SaveStatus,
  content: Content,
): string {
  switch (saveStatus) {
    case "error":
      return content.panel.saveFailedNotice;
    case "stopped":
      return content.panel.saveStoppedNotice;
    case "conflict":
      return content.reviewScreen.conflict;
    case "unauthorized":
      return content.panel.readOnlyRefusedNotice;
    case "idle":
    case "saving":
      return content.reviewScreen.saving;
  }
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
      {saveWait.kind === "waiting" ? (
        <p
          id={saveWaitSentenceId}
          className={styles.refusal}
          data-testid="review-save-wait"
        >
          {saveWait.sentence}
        </p>
      ) : null}
      {saveWait.kind === "waiting" && saveWait.isSettledInTheEditor ? (
        <Link
          className={styles.openEditor}
          href={editorHref(designId)}
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
  reasonIds,
}: {
  readonly reasonIds: readonly string[];
}) {
  const content = useContent();
  if (reasonIds.length === 0) {
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
      aria-describedby={reasonIds.join(" ")}
      data-section="callToAction"
      data-testid="review-cta"
    >
      {content.reviewScreen.callToAction}
    </button>
  );
}
