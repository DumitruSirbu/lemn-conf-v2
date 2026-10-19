"use client";

// What the preset card and the Preview pop-up's slide share: the stored image with its loading and failed states, and
// the note that a preset was adjusted to the room. Frames: `Presete.dc.html#1e-img`, `#1g-loading`, `#1g-failed`.
import {
  PRESET_THUMBNAIL_HEIGHT_PX,
  PRESET_THUMBNAIL_WIDTH_PX,
} from "@lemnaria/configurator-domain";
import { useCallback, useState } from "react";

import { useContent } from "@/i18n/use-content";

import styles from "./preset-chooser.module.css";

const ADJUSTED_GLYPH = "✓";

type ImageStatus = "loading" | "loaded" | "failed";

/** What the image needs of a slide; `PresetSlide` satisfies it. */
interface PresetImageSource {
  /** Rendered as a React text child and as `alt` only: it is the owner's typed text. */
  readonly name: string;
  readonly imageUrl: string;
}

/**
 * A stored image in the box its parent gives it: a shimmer until it has loaded or failed, then the image, whole
 * (`contain`); a failed one is hatching with the preset's name on it.
 */
export function PresetImage({
  slide,
  loading,
}: {
  readonly slide: PresetImageSource;
  readonly loading: "lazy" | "eager";
}) {
  const [status, setStatus] = useState<ImageStatus>("loading");

  // An image from the cache can finish before React has attached `onLoad`, and then no `load` event ever reaches it.
  const settleIfAlreadyLoaded = useCallback(
    (image: HTMLImageElement | null) => {
      if (image?.complete === true && image.naturalWidth > 0) {
        setStatus("loaded");
      }
    },
    [],
  );

  return (
    <div className={styles.imageFrame}>
      {status === "failed" ? (
        <FailedImage name={slide.name} />
      ) : (
        <>
          <img
            ref={settleIfAlreadyLoaded}
            src={slide.imageUrl}
            alt={slide.name}
            width={PRESET_THUMBNAIL_WIDTH_PX}
            height={PRESET_THUMBNAIL_HEIGHT_PX}
            loading={loading}
            decoding="async"
            className={styles.image}
            onLoad={() => {
              setStatus("loaded");
            }}
            onError={() => {
              setStatus("failed");
            }}
          />
          {status === "loading" ? (
            <span
              className={styles.imageLoading}
              aria-hidden="true"
              data-testid="preset-image-loading"
            />
          ) : null}
        </>
      )}
    </div>
  );
}

/** The image is the one named thing; the name drawn on the hatching is for the eye, so it is hidden from a reader. */
function FailedImage({ name }: { readonly name: string }) {
  return (
    <div
      className={styles.imageMissing}
      role="img"
      aria-label={name}
      data-testid="preset-image-failed"
    >
      <span className={styles.imageMissingName} aria-hidden="true">
        {name}
      </span>
    </div>
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
