"use client";

// The Preview pop-up (ADR 0003 decision 4b, as its dated amendment changes it): a carousel
// of the presets the list shows, in the list's order, opened on the one that was tapped. Previous and Next stop at the
// ends, a position reads "2 / 5", and Select acts on the slide on screen. It draws the stored image and no live 3D.
//
// It is a modal dialog built from the pieces `settings/confirmation-dialog.tsx` exports (the Tab ring, Escape, the inert
// background), not from `ConfirmationDialog` itself, whose shell is one sentence and two buttons. It must stand as a
// direct child of `<main>` so that `useBackgroundInert` can mark every other band of the screen inert; the caller
// returns focus to the card that opened it once this has unmounted and the bands are live again.
import {
  PRESET_THUMBNAIL_HEIGHT_PX,
  PRESET_THUMBNAIL_WIDTH_PX,
} from "@lemnaria/configurator-domain";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { useContent } from "@/i18n/use-content";
import {
  trapTab,
  useBackgroundInert,
  useEscapeToDismiss,
} from "@/settings/confirmation-dialog";

import styles from "./preset-chooser.module.css";
import type { PresetCopyStatus } from "./use-generation";

/** Marks drawn by the stylesheet's typography rather than words, so no locale has a say in them. */
const CLOSE_GLYPH = "×";
const PREVIOUS_GLYPH = "‹";
const NEXT_GLYPH = "›";
const ADJUSTED_GLYPH = "✓";
const POSITION_SEPARATOR = " / ";

/** How many slides each side of the one on screen have their image fetched ahead of the tap. */
const NEIGHBOURS_FETCHED = 1;

/** What a slide draws. The caller builds it from the offer, so this file never reads a preset or a design. */
export interface PresetSlide {
  readonly id: string;
  /** Rendered as a React text child and as `alt` only: it is the owner's typed text. */
  readonly name: string;
  readonly imageUrl: string;
  readonly isAdjusted: boolean;
}

export interface PresetCarouselDialogProps {
  readonly slides: readonly PresetSlide[];
  readonly startIndex: number;
  readonly copyStatus: PresetCopyStatus;
  /** Chooses the slide on screen, by its id: read when the button is pressed, not when the pop-up opened. */
  readonly onSelect: (presetId: string) => void;
  /** The slide on screen changed, so what was said about the last one no longer applies. */
  readonly onSlideChange: () => void;
  readonly onClose: () => void;
}

/** A stored image that hatches over when it does not arrive, in the box it would have filled. */
export function PresetImage({
  slide,
  loading,
}: {
  readonly slide: PresetSlide;
  readonly loading: "lazy" | "eager";
}) {
  const [hasFailed, setFailed] = useState(false);
  if (hasFailed)
    return (
      <div className={styles.imageMissing} role="img" aria-label={slide.name} />
    );

  return (
    <img
      src={slide.imageUrl}
      alt={slide.name}
      width={PRESET_THUMBNAIL_WIDTH_PX}
      height={PRESET_THUMBNAIL_HEIGHT_PX}
      loading={loading}
      decoding="async"
      className={styles.image}
      onError={() => {
        setFailed(true);
      }}
    />
  );
}

/** The declared change (ADR 0109 Amendment A3.3): the adaptation made this kitchen fit, and the card says so. */
export function AdjustedNote({ testId }: { readonly testId: string }) {
  const content = useContent();

  return (
    <p className={styles.adjusted} data-testid={testId}>
      <span className={styles.adjustedGlyph} aria-hidden="true">
        {ADJUSTED_GLYPH}
      </span>
      {content.presetChooser.adjusted}
    </p>
  );
}

export function PresetCarouselDialog({
  slides,
  startIndex,
  copyStatus,
  onSelect,
  onSlideChange,
  onClose,
}: PresetCarouselDialogProps) {
  const content = useContent();
  const hostRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const previousRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const selectRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [index, setIndex] = useState(startIndex);
  const slide = slides[index];
  const isWriting = copyStatus === "saving";
  // A request in flight cannot be taken back, so nothing leaves the pop-up until it is answered.
  const dismiss = isWriting ? ignore : onClose;

  useEffect(() => {
    surfaceRef.current?.focus();
  }, []);
  useEscapeToDismiss(true, dismiss);
  useBackgroundInert(true, hostRef);

  const go = useCallback(
    (step: -1 | 1) => {
      const target = index + step;
      if (isWriting || target < 0 || target >= slides.length) return;
      setIndex(target);
      onSlideChange();
      // A button that has focus and is about to be disabled drops focus to the page, outside the Tab ring, and the other
      // way on may be disabled itself at this moment. Select is never disabled here, so focus goes to it first.
      const pressed = step === 1 ? nextRef : previousRef;
      const isReachingTheEnd = target === (step === 1 ? slides.length - 1 : 0);
      if (isReachingTheEnd && document.activeElement === pressed.current) {
        selectRef.current?.focus();
      }
    },
    [index, isWriting, slides.length, onSlideChange],
  );

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    trapTab(event);
    if (event.key === "ArrowLeft") go(-1);
    if (event.key === "ArrowRight") go(1);
  }

  if (slide === undefined) return null;
  const isOnly = slides.length === 1;

  return (
    <div
      className={styles.dialogHost}
      ref={hostRef}
      data-testid="preset-carousel-host"
    >
      <div
        className={styles.scrim}
        aria-hidden="true"
        data-testid="preset-carousel-scrim"
        onClick={dismiss}
      />
      <div
        ref={surfaceRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={styles.dialog}
        data-testid="preset-carousel-dialog"
        onKeyDown={onKeyDown}
      >
        <div className={styles.dialogHead}>
          <div role="status" aria-live="polite" aria-atomic="true">
            <span
              className={styles.position}
              data-testid="preset-carousel-position"
            >
              {index + 1}
              {POSITION_SEPARATOR}
              {slides.length}
            </span>
            <span className={styles.visuallyHidden}>{slide.name}</span>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            aria-label={content.presetChooser.close}
            data-testid="preset-carousel-close"
            disabled={isWriting}
            onClick={onClose}
          >
            <span aria-hidden="true">{CLOSE_GLYPH}</span>
          </button>
        </div>
        <SlideImages slides={slides} index={index} />
        <h2
          id={titleId}
          className={styles.slideTitle}
          data-testid="preset-carousel-name"
        >
          {slide.name}
        </h2>
        {slide.isAdjusted ? (
          <AdjustedNote testId="preset-carousel-adjusted" />
        ) : null}
        <CopyStatusLine copyStatus={copyStatus} />
        <div className={styles.dialogActions}>
          {isOnly ? null : (
            <button
              ref={previousRef}
              type="button"
              className={styles.navButton}
              data-testid="preset-carousel-previous"
              disabled={index === 0 || isWriting}
              onClick={() => {
                go(-1);
              }}
            >
              <span aria-hidden="true">{PREVIOUS_GLYPH} </span>
              {content.presetChooser.previous}
            </button>
          )}
          <button
            ref={selectRef}
            type="button"
            className={styles.selectButton}
            aria-busy={isWriting}
            data-testid="preset-carousel-select"
            disabled={isWriting || copyStatus === "limited"}
            onClick={() => {
              onSelect(slide.id);
            }}
          >
            {isWriting
              ? content.presetChooser.selecting
              : content.presetChooser.select}
          </button>
          {isOnly ? null : (
            <button
              ref={nextRef}
              type="button"
              className={styles.navButton}
              data-testid="preset-carousel-next"
              disabled={index === slides.length - 1 || isWriting}
              onClick={() => {
                go(1);
              }}
            >
              {content.presetChooser.next}
              <span aria-hidden="true"> {NEXT_GLYPH}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The slide on screen and the images next to it. A neighbour is mounted hidden and eager, because a hidden lazy image
 * is never fetched and the point is to have the next one by the time it is wanted; anything further away is not
 * mounted, so at most three of a list's `PRESET_LIST_LIMIT` full-size images are in play. The list's thumbnails are these same URLs.
 */
function SlideImages({
  slides,
  index,
}: {
  readonly slides: readonly PresetSlide[];
  readonly index: number;
}) {
  const from = Math.max(0, index - NEIGHBOURS_FETCHED);
  const to = Math.min(slides.length - 1, index + NEIGHBOURS_FETCHED);

  return (
    <div className={styles.slide} data-testid="preset-carousel-slide">
      {slides.slice(from, to + 1).map((slide, offset) => {
        const isCurrent = from + offset === index;
        return (
          <div key={slide.id} hidden={!isCurrent} className={styles.slideFrame}>
            <PresetImage slide={slide} loading={isCurrent ? "lazy" : "eager"} />
          </div>
        );
      })}
    </div>
  );
}

/** The one line under the slide: the write's answer when it failed, nothing otherwise. Always rendered, so the
 *  region is live before the sentence it will announce. */
function CopyStatusLine({
  copyStatus,
}: {
  readonly copyStatus: PresetCopyStatus;
}) {
  const content = useContent();

  return (
    <p
      role="status"
      className={styles.slideStatus}
      data-testid="preset-carousel-status"
      data-copy-status={copyStatus}
    >
      {copyStatus === "failed" ? content.presetChooser.selectFailed : null}
      {copyStatus === "limited"
        ? content.presetChooser.selectLimitReached
        : null}
    </p>
  );
}

function ignore(): void {
  // Intentionally nothing: see `dismiss`.
}
