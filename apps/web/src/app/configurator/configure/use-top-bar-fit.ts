"use client";

// The top bar's one measurement and the two decisions taken from it: how many settings the pill names, and what the
// row gives up to leave room for them. Decided together from one measured track, in the component that owns the grid,
// so the row and the pill cannot chase each other across frames. The ladder (`settings/settings-pill-fit.ts`) and
// the gives (`top-bar-fit.ts`) are pure; this hook measures, remembers, and skips a state write when the answer is
// unchanged, so dragging a window edge re-renders on a rung change, not per frame.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";

import type { AccountFormProbeRefs } from "@/account/session/account-control";
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
  /** Frame D2A's wordmark, or nothing: give C. */
  readonly isWordmarkDrawn: boolean;
  /** The row's two gaps, published for the stylesheet to read (as `price-bar.tsx` does for its reserved height),
   *  because a stylesheet cannot import a value. */
  readonly spacingMetrics: CSSProperties;
  /** Goes on the settings grid item: **the pill's track is what is measured**, not the pill, so the
   *  ladder can see room the pill is not currently using. */
  readonly settingsTrackRef: RefObject<HTMLDivElement | null>;
  /** The account give: the visitor's link is its glyph alone. */
  readonly isAccountCompact: boolean;
  /** The last give: the title has left the row so that the pill keeps one whole setting name. */
  readonly isTitleDropped: boolean;
  /** Goes on the hidden wordmark probe, which stands **outside** the nav so dropping the wordmark
   *  does not destroy the measurement that would put it back. */
  readonly wordmarkProbeRef: RefObject<HTMLSpanElement | null>;
  /** Goes on the hidden title probe, outside the nav for the same reason. */
  readonly titleProbeRef: RefObject<HTMLSpanElement | null>;
  /** Go on the account control's two hidden probes, which stand outside its cell for the same reason. */
  readonly accountProbeRefs: AccountFormProbeRefs;
  readonly onPillMeasured: (measurements: SettingsPillMeasurements) => void;
}

/** The pill's track and the row it was measured in: one fact, stored as one (see `measuringIn`). */
interface MeasuredTrack {
  readonly pillTrackPx: number;
  readonly measuredIn: TopBarConfiguration;
}

/** Frame D2A is what the row draws before anything gives: the wordmark, and the frame's own gaps. */
const D2A_AS_DRAWN: TopBarConfiguration = {
  isWordmarkDrawn: true,
  isSpacingClosed: false,
  isAccountCompact: false,
  isTitleDropped: false,
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
  const titleProbeRef = useRef<HTMLSpanElement>(null);
  const accountTextProbeRef = useRef<HTMLSpanElement>(null);
  const accountIconProbeRef = useRef<HTMLSpanElement>(null);
  const [measurements, setMeasurements] = useState<
    SettingsPillMeasurements | undefined
  >(undefined);
  const [track, setTrack] = useState<MeasuredTrack | undefined>(undefined);
  const [configuration, setConfiguration] =
    useState<TopBarConfiguration>(D2A_AS_DRAWN);
  // First paint has no measurement, so the pill renders every setting and settles on the first observation;
  // starting at the floor would flash a counter at every desktop width.
  const [visibleCount, setVisibleCount] = useState(pill.settings.length);

  /**
   * The configuration the observer is measuring in, in a ref because the observer is registered once and would
   * close over the configuration it was registered under. A track measured in one configuration and read in another
   * describes a row that is not on screen and the model would undo the wrong gives: at the width where the wordmark
   * returns, the row grew a label it had no room for until the next observation.
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
    // The probes change width when the session answers, and the cell may not (a compact link and a client's glyph are
    // both 44 px), so the track alone would leave the answer standing on the old widths.
    for (const probe of [
      accountTextProbeRef.current,
      accountIconProbeRef.current,
    ])
      if (probe) observer.observe(probe);
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
        accountWidthsPx: {
          textPx: widthOf(accountTextProbeRef.current),
          iconPx: widthOf(accountIconProbeRef.current),
        },
        titleWidthPx: widthOf(titleProbeRef.current),
      },
      track.measuredIn,
    );
    if (
      fit.isWordmarkDrawn !== configuration.isWordmarkDrawn ||
      fit.isSpacingClosed !== configuration.isSpacingClosed ||
      fit.isAccountCompact !== configuration.isAccountCompact ||
      fit.isTitleDropped !== configuration.isTitleDropped
    ) {
      setConfiguration({
        isWordmarkDrawn: fit.isWordmarkDrawn,
        isSpacingClosed: fit.isSpacingClosed,
        isAccountCompact: fit.isAccountCompact,
        isTitleDropped: fit.isTitleDropped,
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
    isAccountCompact: configuration.isAccountCompact,
    isTitleDropped: configuration.isTitleDropped,
    spacingMetrics: {
      "--top-bar-nav-gap": `${String(spacing.navGapPx)}px`,
      "--top-bar-row-gap": `${String(spacing.rowGapPx)}px`,
    } as CSSProperties,
    settingsTrackRef,
    wordmarkProbeRef,
    titleProbeRef,
    accountProbeRefs: {
      textRef: accountTextProbeRef,
      iconRef: accountIconProbeRef,
    },
    onPillMeasured: useCallback((next: SettingsPillMeasurements) => {
      setMeasurements(next);
    }, []),
  };
}

function widthOf(probe: HTMLElement | null): number {
  return probe?.getBoundingClientRect().width ?? 0;
}

/**
 * The room the pill actually has: the cell's box less its own padding. The cell carries the gap between nav and
 * pill (the row's spacing lives on the cells), so its border box overstates the room by 28 px at frame D2A's
 * spacing and 9 px at frame 2A's: a rung's worth of error exactly where a rung changes.
 */
function contentWidthOf(element: HTMLElement): number {
  const style = getComputedStyle(element);
  return (
    element.getBoundingClientRect().width -
    Number.parseFloat(style.paddingLeft) -
    Number.parseFloat(style.paddingRight)
  );
}

/** A shell whose frame draws no wordmark has no gives to spend: frame 2A draws neither the wordmark nor a second
 *  spacing, and its chip's own `max-width` bounds the ladder, so the pill takes the track it was measured in. */
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
