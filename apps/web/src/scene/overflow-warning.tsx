"use client";

import type { CSSProperties } from "react";

import { useContent } from "@/i18n/use-content";
import { useConfiguratorStore } from "@/store/configurator-store";

import styles from "./overflow-warning.module.css";
import { OVERFLOW_WARNING_RESERVED_HEIGHT_PX } from "./overflow-warning-layout";
import { useOverflowingPlacementIds } from "./use-overflowing-placements";

/** The reserved height, published onto the band as a custom property so the stylesheet reads the one
 *  constant the 390 × 844 gate asserts against. A stylesheet cannot import a constant; this is the
 *  same hop `price-bar.tsx` uses, pinned for the same reason. */
const OVERFLOW_WARNING_METRICS = {
  "--overflow-warning-height": `${String(OVERFLOW_WARNING_RESERVED_HEIGHT_PX)}px`,
} as CSSProperties;

/**
 * ADR 0065 decision 7b's scene warning: the sentence that stands beside the bodies the scene marks.
 *
 * **It is its own surface, on purpose.** Decision 8 keeps it off §9's rejection banner — a rejection
 * says *an edit did not happen*, this says *an edit happened and its result does not fit* — and it is
 * not the flagged total's sentence either, which says what the price contains rather than what to do.
 *
 * It reads `useOverflowingPlacementIds` rather than the priced design: pricing can fail, and a scene
 * that keeps its marks while the sentence explaining them vanishes is worse than either alone.
 *
 * **The sentence says "marcate", so it may only be on screen while something is marked.** The marks
 * are built by `kitchen-stage.tsx`, which lives inside a `dynamic(..., { ssr: false })` canvas behind
 * a WebGL probe — so on a cold load of a stored overflowing design there is a window, seconds long on
 * a slow connection, in which the ids are known and the scene is not mounted. Rendered on the ids
 * alone the customer would read *"the marked cabinets…"* over a loading placeholder with nothing
 * marked. `isBodyProbeAttached` is the store's own published "the scene is mounted" fact — the stage
 * attaches the probe on mount and detaches it on unmount — and gating on it makes the sentence and
 * the marks arrive together or not at all.
 */
export function OverflowWarning() {
  const ro = useContent();
  const overflowingIds = useOverflowingPlacementIds();
  const isSceneMounted = useConfiguratorStore(
    (state) => state.isBodyProbeAttached,
  );

  return (
    // The region is mounted whether or not there is anything in it, and **is not gated on the scene**
    // — only the sentence inside it is. That is `price-bar.tsx`'s `.flagRegion`, the honest precedent
    // for this shape: many screen readers announce only *changes* to a region already in the
    // accessibility tree, so a region created at the same moment as its first message is announced
    // late or not at all, and the arrival of this warning is what matters most on this screen.
    <div
      className={styles.region}
      role="status"
      data-testid="scene-overflow-region"
    >
      {isSceneMounted && overflowingIds.length > 0 ? (
        <p
          className={styles.warning}
          style={OVERFLOW_WARNING_METRICS}
          data-testid="scene-overflow-warning"
        >
          {ro.configure.overflowWarning}
        </p>
      ) : null}
    </div>
  );
}
