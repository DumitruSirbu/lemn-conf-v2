"use client";

// Step 1's two preset screens (plan M8C section 3.6): 1D, the wait while the presets that fit the room are found, and
// 1E, the list of the ones that do. Frames 1D and 1E are the chrome (`docs/design/mockups/Lemnaria Configurator
// Mobil.dc.html:251-403`), with the owner's ruling of 2026-10-17 laid over them (ADR 0003 decision 4b, amended; ADR
// 0104 Amendment F): a card carries one control, *Previzualizează*, and selects nothing. Preview opens the carousel
// pop-up, where *Select* copies the preset; the list has its own way out to generation (`onSkip`).
//
// Nothing here fetches or evaluates: the offers arrive complete from `use-presets.ts`, and the card, the slide and the
// copy all read the one evaluation each offer carries (ADR 0109 decision 4).
import type { DesignRoom } from "@lemnaria/configurator-domain";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { useContent } from "@/i18n/use-content";

import { RoomSummary } from "./generation-steps";
import {
  AdjustedNote,
  PresetCarouselDialog,
  PresetImage,
  type PresetSlide,
} from "./preset-carousel-dialog";
import type { ListedPresetOffer } from "./preset-offers";
import styles from "./preset-chooser.module.css";
import roomStyles from "./room.module.css";
import type { PresetCopy } from "./use-generation";

/** The wait shows two placeholder cards, as frame 1D does: a stand-in for the list, not a count of what will be found. */
const SKELETON_CARD_COUNT = 2;

export interface PresetWaitProps {
  readonly room: DesignRoom;
  readonly onBack: () => void;
}

/** 1D: the room being checked against the library. It lasts at most the offers' budget (`PRESET_OFFERS_BUDGET_MS`). */
export function PresetWait({ room, onBack }: PresetWaitProps) {
  const content = useContent();
  const translate = useTranslations();

  return (
    <>
      <div className={styles.body} data-testid="room-presets-wait">
        <div className={styles.intro}>
          <h2 className={styles.heading}>{content.presetChooser.heading}</h2>
          <RoomSummary room={room} />
        </div>
        <div
          className={styles.waitNotice}
          role="status"
          data-testid="room-presets-wait-notice"
        >
          <span className={styles.spinner} aria-hidden="true" />
          <span className={styles.waitText}>
            {content.presetChooser.waiting}
          </span>
        </div>
        <ul className={styles.skeletons} aria-hidden="true">
          {Array.from({ length: SKELETON_CARD_COUNT }, (_, position) => (
            <li className={styles.skeleton} key={position}>
              <div className={styles.skeletonImage} />
              <div className={styles.skeletonLines}>
                <span className={styles.skeletonLineShort} />
                <span className={styles.skeletonLineLong} />
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className={roomStyles.composeFooter}>
        <button
          type="button"
          className={roomStyles.back}
          data-testid="room-presets-back"
          onClick={onBack}
        >
          {translate("room.back")}
        </button>
      </div>
    </>
  );
}

export interface PresetChooserProps {
  readonly room: DesignRoom;
  readonly offers: readonly ListedPresetOffer[];
  readonly copy: PresetCopy;
  /** Leaves Step 1's presets for the form, as *Înapoi* does everywhere. */
  readonly onBack: () => void;
  /** Leaves the list for composition (1F): the customer would rather have a kitchen generated for the room. */
  readonly onSkip: () => void;
}

/** 1E: the cards, and the Preview pop-up they open. */
export function PresetChooser({
  room,
  offers,
  copy,
  onBack,
  onSkip,
}: PresetChooserProps) {
  const content = useContent();
  const translate = useTranslations();
  const headingId = useId();
  const slides = offers.map((offer) => slideOf(offer, content));
  const preview = usePreviewFocus();

  const { select: copySelect, dismissFailure } = copy;
  const select = useCallback(
    (presetId: string) => {
      // Read now, from the offers on screen: the slide that was on screen when the button was pressed.
      const offer = offers.find(
        (candidate) => candidate.preset.id === presetId,
      );
      if (offer === undefined) return;
      copySelect({ presetId, design: offer.design });
    },
    [offers, copySelect],
  );

  const { close: closePreviewList } = preview;
  const closePreview = useCallback(() => {
    dismissFailure();
    closePreviewList();
  }, [dismissFailure, closePreviewList]);

  return (
    <>
      <div className={styles.body} data-testid="room-presets">
        <div className={styles.intro}>
          <h2 className={styles.heading} id={headingId}>
            {content.presetChooser.heading}
          </h2>
          <RoomSummary room={room} />
        </div>
        <ul
          className={styles.list}
          aria-labelledby={headingId}
          data-testid="room-presets-list"
        >
          {slides.map((slide, position) => (
            <PresetCard
              key={slide.id}
              slide={slide}
              buttonRef={preview.registerButton(slide.id)}
              onPreview={() => {
                preview.open(slide.id, position);
              }}
            />
          ))}
        </ul>
      </div>
      <div className={roomStyles.composeFooter}>
        <button
          type="button"
          className={roomStyles.back}
          data-testid="room-presets-back"
          onClick={onBack}
        >
          {translate("room.back")}
        </button>
        <button
          type="button"
          className={roomStyles.cta}
          data-testid="room-presets-skip"
          onClick={onSkip}
        >
          {content.presetChooser.skip}
        </button>
      </div>
      {preview.openIndex === undefined ? null : (
        <PresetCarouselDialog
          slides={slides}
          startIndex={preview.openIndex}
          copyStatus={copy.status}
          onSelect={select}
          onSlideChange={dismissFailure}
          onClose={closePreview}
        />
      )}
    </>
  );
}

/** What a card and a slide draw of an offer. The name is the owner's typed one, shown verbatim, or the one rendered from
 *  the stored facts in the active locale (ADR 0112 Amendment A). */
function slideOf(
  offer: ListedPresetOffer,
  content: ReturnType<typeof useContent>,
): PresetSlide {
  const { preset, changes } = offer;
  return {
    id: preset.id,
    name: preset.typedName ?? content.presetName(preset.nameFacts),
    imageUrl: preset.imageUrl,
    isAdjusted: !changes.isUnchanged,
  };
}

function PresetCard({
  slide,
  buttonRef,
  onPreview,
}: {
  readonly slide: PresetSlide;
  readonly buttonRef: (button: HTMLButtonElement | null) => void;
  readonly onPreview: () => void;
}) {
  const content = useContent();
  const nameId = useId();
  const buttonId = useId();

  return (
    <li
      className={styles.card}
      data-testid="room-preset-card"
      data-preset-id={slide.id}
    >
      <div className={styles.thumb}>
        <PresetImage slide={slide} loading="lazy" />
      </div>
      <div className={styles.cardInfo}>
        <h3 className={styles.name} id={nameId}>
          {slide.name}
        </h3>
        {slide.isAdjusted ? (
          <AdjustedNote testId="room-preset-adjusted" />
        ) : null}
        {/* Named by the word and the preset together, so that a screen reader's list of buttons is not a column of
            identical ones. */}
        <button
          ref={buttonRef}
          id={buttonId}
          type="button"
          className={styles.previewButton}
          aria-haspopup="dialog"
          aria-labelledby={`${buttonId} ${nameId}`}
          data-testid="room-preset-preview"
          onClick={onPreview}
        >
          {content.presetChooser.preview}
        </button>
      </div>
    </li>
  );
}

interface PreviewFocus {
  readonly openIndex: number | undefined;
  readonly open: (presetId: string, index: number) => void;
  readonly close: () => void;
  /** A ref callback per card, so the pop-up's opener can be found again by its preset. */
  readonly registerButton: (
    presetId: string,
  ) => (button: HTMLButtonElement | null) => void;
}

/**
 * Which slide the pop-up is open on, and the card to give focus back to. Focus returns in an effect after the pop-up has
 * unmounted, not in `close`: while it is open the list's band is inert, and focus on an inert element is ignored
 * (`useSaveAsPresetControl` does the same). It returns to the card that opened the pop-up, not to the slide it ended on.
 */
function usePreviewFocus(): PreviewFocus {
  const [openIndex, setOpenIndex] = useState<number | undefined>(undefined);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const openerId = useRef<string | undefined>(undefined);
  const wasOpen = useRef(false);

  const open = useCallback((presetId: string, index: number) => {
    openerId.current = presetId;
    setOpenIndex(index);
  }, []);
  const close = useCallback(() => {
    setOpenIndex(undefined);
  }, []);
  const registerButton = useCallback(
    (presetId: string) => (button: HTMLButtonElement | null) => {
      if (button === null) buttons.current.delete(presetId);
      else buttons.current.set(presetId, button);
    },
    [],
  );

  const isOpen = openIndex !== undefined;
  useEffect(() => {
    if (wasOpen.current && !isOpen && openerId.current !== undefined) {
      buttons.current.get(openerId.current)?.focus();
    }
    wasOpen.current = isOpen;
  }, [isOpen]);

  return { openIndex, open, close, registerButton };
}
