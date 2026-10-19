"use client";

// The Preview pop-up (ADR 0003 decision 4b, as its dated amendment changes it): a carousel
// of the presets the list shows, in the list's order, opened on the one that was tapped. Previous and Next stop at the
// ends, a position reads "2 / 5" (and is absent for one preset), and Select acts on the slide on screen. It draws the
// stored image and no live 3D. Frames: `Presete.dc.html#1g-first` … `#1g-ru-320`, `#d1g` … `#d1g-ru`.
//
// It is a modal dialog built from the pieces `components/use-modal-focus.ts` exports (the Tab ring, Escape, the inert
// background), not from `ConfirmationDialog` itself, whose shell is one sentence and two buttons. It must stand as a
// direct child of `<main>` so that `useBackgroundInert` can mark every other band of the screen inert; the caller
// returns focus to the card that opened it once this has unmounted and the bands are live again.
//
// Tab order is × → Previous → Next → Select on every screen (the DOM order); desktop draws Select between the two by
// grid placement alone.
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";

import {
  trapTab,
  useBackgroundInert,
  useEscapeToDismiss,
} from "@/components/use-modal-focus";
import { useContent } from "@/i18n/use-content";
import {
  PresetStatusNotice,
  type PresetStatus,
} from "@/preset/preset-status-notice";

import styles from "./preset-chooser.module.css";
import { AdjustedNote, PresetImage } from "./preset-image";
import { slideTransition, type SlideStep } from "./slide-transition";
import type { PresetCopyStatus } from "./use-generation";
import { useSlideSwipe, type SlideSwipeHandlers } from "./use-slide-swipe";

/** Marks drawn by the stylesheet's typography rather than words, so no locale has a say in them. */
const CLOSE_GLYPH = "×";
const PREVIOUS_GLYPH = "‹";
const NEXT_GLYPH = "›";
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
  // The day's limit and a write in flight both leave Select unable to act. It stays focusable (`aria-disabled`, not
  // `disabled`) so that the focus the press left on it is not dropped to the page, outside the Tab ring.
  const isSelectInert = isWriting || copyStatus === "limited";
  // A request in flight cannot be taken back, so nothing leaves the pop-up until it is answered.
  const dismiss = isWriting ? ignore : onClose;

  useEffect(() => {
    surfaceRef.current?.focus();
  }, []);
  useEffect(() => {
    if (isWriting && isFocusStranded(previousRef, nextRef)) {
      selectRef.current?.focus();
    }
  }, [isWriting]);
  useEscapeToDismiss(true, dismiss);
  useBackgroundInert(true, hostRef);

  const moveBy = useCallback(
    (step: SlideStep) => {
      const target = slideTransition({ index, count: slides.length, step });
      if (isWriting || target === index) return;
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
  const swipe = useSlideSwipe({ isEnabled: !isWriting, onStep: moveBy });

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    trapTab(event);
    if (event.key === "ArrowLeft") moveBy(-1);
    if (event.key === "ArrowRight") moveBy(1);
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
        onMouseDown={keepFocus}
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
        <span className={styles.handle} aria-hidden="true" />
        <div className={styles.dialogHead}>
          {isOnly ? null : (
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
          )}
          <button
            type="button"
            className={styles.closeButton}
            aria-label={content.presetChooser.close}
            aria-disabled={isWriting}
            data-testid="preset-carousel-close"
            onClick={dismiss}
          >
            <span aria-hidden="true">{CLOSE_GLYPH}</span>
          </button>
        </div>
        <SlideImages slides={slides} index={index} swipe={swipe} />
        <div className={styles.slideText}>
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
        </div>
        <PresetStatusNotice
          status={statusOf(copyStatus, content)}
          testId="preset-carousel-status"
        />
        <div className={styles.dialogActions}>
          {isOnly ? null : (
            <>
              <button
                ref={previousRef}
                type="button"
                className={[styles.navButton, styles.previousButton].join(" ")}
                data-testid="preset-carousel-previous"
                disabled={index === 0 || isWriting}
                onClick={() => {
                  moveBy(-1);
                }}
              >
                <span className={styles.navGlyph} aria-hidden="true">
                  {PREVIOUS_GLYPH}
                </span>
                {content.presetChooser.previous}
              </button>
              <button
                ref={nextRef}
                type="button"
                className={[styles.navButton, styles.nextButton].join(" ")}
                data-testid="preset-carousel-next"
                disabled={index === slides.length - 1 || isWriting}
                onClick={() => {
                  moveBy(1);
                }}
              >
                {content.presetChooser.next}
                <span className={styles.navGlyph} aria-hidden="true">
                  {NEXT_GLYPH}
                </span>
              </button>
            </>
          )}
          <button
            ref={selectRef}
            type="button"
            className={styles.selectButton}
            aria-busy={isWriting}
            aria-disabled={isSelectInert}
            data-testid="preset-carousel-select"
            onClick={() => {
              if (!isSelectInert) onSelect(slide.id);
            }}
          >
            {content.presetChooser.select}
          </button>
        </div>
      </div>
    </div>
  );
}

/** What the status area says for the copy's progress: nothing while idle. */
function statusOf(
  copyStatus: PresetCopyStatus,
  content: ReturnType<typeof useContent>,
): PresetStatus | undefined {
  switch (copyStatus) {
    case "saving":
      return { tone: "progress", sentence: content.presetChooser.selecting };
    case "failed":
      return { tone: "error", sentence: content.presetChooser.selectFailed };
    case "limited":
      return {
        tone: "warn",
        sentence: content.presetChooser.selectLimitReached,
      };
    case "idle":
      return undefined;
  }
}

/** True when focus is on the page or on a button that is about to be disabled, so that nothing in the dialog has it. */
function isFocusStranded(
  ...buttons: readonly RefObject<HTMLButtonElement | null>[]
): boolean {
  const active = document.activeElement;
  return (
    active === document.body ||
    buttons.some((button) => button.current === active)
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
  swipe,
}: {
  readonly slides: readonly PresetSlide[];
  readonly index: number;
  readonly swipe: SlideSwipeHandlers;
}) {
  const from = Math.max(0, index - NEIGHBOURS_FETCHED);
  const to = Math.min(slides.length - 1, index + NEIGHBOURS_FETCHED);

  return (
    <div
      className={styles.slide}
      data-testid="preset-carousel-slide"
      {...swipe}
    >
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

/** A press on the scrim must not take focus from the dialog: it is not focusable, so the page would get it. */
function keepFocus(event: ReactMouseEvent<HTMLElement>): void {
  event.preventDefault();
}

function ignore(): void {
  // Intentionally nothing: see `dismiss`.
}
