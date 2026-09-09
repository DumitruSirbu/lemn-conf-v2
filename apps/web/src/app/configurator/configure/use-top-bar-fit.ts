"use client";

// The top bar's one measurement, and the two decisions taken from it: how many settings the pill
// names, and what the row gives up to leave room for them.
//
// **One owner and one observation.** The pill's ladder and the row's gives are answers to the same
// question — how much room is there — so they are decided together, from the same measured track, in
// the component that owns the grid. Splitting them would let the row and the pill chase each other
// across frames.
//
// **Nothing here decides anything.** `settings/settings-pill-fit.ts` holds the ladder and
// `top-bar-fit.ts` holds the gives; both are pure functions over measured widths, asserted as values.
// This hook measures, remembers, and skips a state write when the answer has not changed — so
// dragging a window edge re-renders on a rung change and not per frame.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";

import { useContent } from "@/i18n/use-content";
import { useWholeKitchenTierOffer } from "@/price/use-priced-design";
import { chooseVisibleSettingLabels } from "@/settings/settings-pill-fit";
import type { SettingsPillMeasurements } from "@/settings/settings-pill-measurement";
import {
  describeSettingsPill,
  type SettingsPillView,
} from "@/settings/global-settings-model";
import { useConfiguratorStore } from "@/store/configurator-store";

import {
  D2A_SPACING,
  describeTopBarFit,
  FRAME_2A_SPACING,
  type TopBarConfiguration,
} from "./top-bar-fit";

export interface TopBarFitState {
  /** The pill's own settings and their whole labels, for the measurement node and for the pill. */
  readonly pill: SettingsPillView;
  /** How many of them the pill names. The rest are counted. */
  readonly visibleCount: number;
  /** Frame D2A's wordmark, or nothing — give C, ruled by the owner on 2026-09-09. */
  readonly isWordmarkDrawn: boolean;
  /** The row's two gaps, published for the stylesheet to read — the same hop `price-bar.tsx` uses
   *  for its reserved height, because a stylesheet cannot import a value. */
  readonly spacingMetrics: CSSProperties;
  /** Goes on the settings grid item: **the pill's track is what is measured**, not the pill, so the
   *  ladder can see room the pill is not currently using. */
  readonly settingsTrackRef: RefObject<HTMLDivElement | null>;
  /** Goes on the hidden wordmark probe, which stands **outside** the nav so dropping the wordmark
   *  does not destroy the measurement that would put it back. */
  readonly wordmarkProbeRef: RefObject<HTMLSpanElement | null>;
  readonly onPillMeasured: (measurements: SettingsPillMeasurements) => void;
}

/** The pill's track, **and the row it was measured in** — the two are one fact and are stored as
 *  one. See `measuringIn` below for what separating them cost. */
interface MeasuredTrack {
  readonly pillTrackPx: number;
  readonly measuredIn: TopBarConfiguration;
}

/** Frame D2A is what the row draws before anything gives: the wordmark, and the frame's own gaps. */
const D2A_AS_DRAWN: TopBarConfiguration = {
  isWordmarkDrawn: true,
  isSpacingClosed: false,
};

export function useTopBarFit(): TopBarFitState {
  const content = useContent();
  const offer = useWholeKitchenTierOffer();
  const applied = useConfiguratorStore((state) => state.design.settings);
  const pill = useMemo(
    () => describeSettingsPill({ offer, applied: applied ?? {}, content }),
    [offer, applied, content],
  );

  const settingsTrackRef = useRef<HTMLDivElement>(null);
  const wordmarkProbeRef = useRef<HTMLSpanElement>(null);
  const [measurements, setMeasurements] = useState<
    SettingsPillMeasurements | undefined
  >(undefined);
  const [track, setTrack] = useState<MeasuredTrack | undefined>(undefined);
  const [configuration, setConfiguration] =
    useState<TopBarConfiguration>(D2A_AS_DRAWN);
  // **First paint has no measurement**, so the pill renders at rung 1 for the settings it has and
  // settles on the first observation. The alternative — starting at the floor — would make every
  // desktop width flash a counter it does not need.
  const [visibleCount, setVisibleCount] = useState(pill.settings.length);

  /**
   * **The configuration the observer is measuring in**, kept in a ref because the observer is
   * registered once and would otherwise close over the configuration it was registered under.
   *
   * It is not an optimisation. A track measured in one configuration and read in another is a
   * measurement of a row that is not on screen, and the model's normalisation would undo the wrong
   * gives — measured 2026-09-09 at the width where the wordmark returns (923 px): the row grew a
   * label it had no room for and held it for about 250 ms before the next observation took it back.
   */
  const measuringIn = useRef(configuration);
  measuringIn.current = configuration;

  useEffect(() => {
    const trackElement = settingsTrackRef.current;
    if (!trackElement) return undefined;
    const observer = new ResizeObserver(() => {
      setTrack({
        pillTrackPx: contentWidthOf(trackElement),
        measuredIn: measuringIn.current,
      });
    });
    observer.observe(trackElement);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (measurements === undefined || track === undefined) return;
    const fit = fitOf(
      {
        pillTrackPx: track.pillTrackPx,
        // Read here rather than observed separately: the probe is `display: none` on the shell whose
        // frame draws no wordmark, so **a measured zero is how this hook learns there is no wordmark
        // to give** — the shell fork stays in CSS and no width is compared in TypeScript.
        wordmarkWidthPx:
          wordmarkProbeRef.current?.getBoundingClientRect().width ?? 0,
        measuredIn: track.measuredIn,
        labelWidthsPx: measurements.labelWidthsPx,
        fixedWidthsPx: measurements.fixedWidthsPx,
      },
      track.measuredIn,
    );
    if (
      fit.isWordmarkDrawn !== configuration.isWordmarkDrawn ||
      fit.isSpacingClosed !== configuration.isSpacingClosed
    ) {
      setConfiguration({
        isWordmarkDrawn: fit.isWordmarkDrawn,
        isSpacingClosed: fit.isSpacingClosed,
      });
    }
    const chosen = chooseVisibleSettingLabels({
      // The track the chosen configuration *will* produce, not the one the measurement was taken in,
      // so the row and the pill settle together on one observation.
      availableWidthPx: fit.pillTrackPx,
      labelWidthsPx: measurements.labelWidthsPx,
      fixedWidthsPx: measurements.fixedWidthsPx,
      previousVisibleCount: visibleCount,
    });
    if (chosen.visibleCount !== visibleCount)
      setVisibleCount(chosen.visibleCount);
  }, [measurements, track, configuration, visibleCount]);

  const spacing = configuration.isSpacingClosed
    ? FRAME_2A_SPACING
    : D2A_SPACING;
  return {
    pill,
    visibleCount,
    isWordmarkDrawn: configuration.isWordmarkDrawn,
    spacingMetrics: {
      "--top-bar-nav-gap": `${String(spacing.navGapPx)}px`,
      "--top-bar-row-gap": `${String(spacing.rowGapPx)}px`,
    } as CSSProperties,
    settingsTrackRef,
    wordmarkProbeRef,
    onPillMeasured: useCallback((next: SettingsPillMeasurements) => {
      setMeasurements(next);
    }, []),
  };
}

/**
 * The room the pill actually has: the cell's box **less its own padding**.
 *
 * The cell carries the gap between the nav and the pill — the row's spacing lives on the cells so
 * the band's rule is never broken by a grid gap — so its border box is wider than anything the pill
 * can use. Measured 2026-09-09: reading the border box made the track 28 px too generous at frame
 * D2A's spacing and 9 px at frame 2A's, which is a rung's worth of error at exactly the widths where
 * a rung changes.
 */
function contentWidthOf(element: HTMLElement): number {
  const style = getComputedStyle(element);
  return (
    element.getBoundingClientRect().width -
    Number.parseFloat(style.paddingLeft) -
    Number.parseFloat(style.paddingRight)
  );
}

/** **A shell whose frame draws no wordmark has no gives to spend** — frame 2A draws neither the
 *  wordmark nor a second spacing, and its chip's own `max-width` is what bounds the ladder there. So
 *  the pill simply takes the track it was measured in. */
function fitOf(
  input: Parameters<typeof describeTopBarFit>[0],
  configuration: TopBarConfiguration,
): ReturnType<typeof describeTopBarFit> {
  if (input.wordmarkWidthPx > 0) return describeTopBarFit(input);
  return {
    ...configuration,
    isWordmarkDrawn: false,
    spacing: FRAME_2A_SPACING,
    pillTrackPx: input.pillTrackPx,
  };
}
