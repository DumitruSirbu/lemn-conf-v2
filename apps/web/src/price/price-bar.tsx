"use client";

import type { CSSProperties } from "react";

import { PRICE_BAR_RESERVED_HEIGHT_PX } from "./price-bar-layout";
import { describePriceBar } from "./price-bar-model";
import styles from "./price-bar.module.css";
import { usePricedDesign } from "./use-priced-design";

/** The reserved height, published onto the bar as a custom property so the stylesheet reads the one
 *  constant the 390 × 844 gate asserts against. A stylesheet cannot import a constant; this is the
 *  seam that lets it read one — the same hop `editor-panel.tsx` uses for the finish swatches, and
 *  `price-bar-layout.test.ts` pins it for the same reason. */
const PRICE_BAR_METRICS = {
  "--price-bar-height": `${String(PRICE_BAR_RESERVED_HEIGHT_PX)}px`,
} as CSSProperties;

/**
 * Frames 2A / D2A's price bar: the mobile shell's bottom bar and the desktop shell's top-bar
 * figure, one component either way. Which of the two happens is decided entirely in CSS — see
 * `configure.module.css`, exactly as §9's sheet-or-rail is.
 *
 * It renders a value and decides nothing. Whether there is a figure at all, which label it carries
 * and whether it is flagged are `describePriceBar`'s, and the amount is
 * `describeStartingPrice`'s — no component rounds, formats or prefixes a price.
 */
export function PriceBar() {
  const pricing = usePricedDesign();
  const view = describePriceBar({ pricing });

  // A pricing failure renders no figure: not a zero, not a stale one, not a dash that reads as free.
  if (view.kind === "unpriced") return null;

  // **M6-AUD-014**: an empty kitchen has no price, and the owner's prompt stands where the figure
  // would. The bar keeps its reserved height, so nothing below it moves when the first cabinet
  // arrives — the layout constant is the same one the 390 x 844 gate asserts.
  if (view.kind === "empty") {
    return (
      <div
        className={styles.bar}
        style={PRICE_BAR_METRICS}
        data-testid="price-bar"
      >
        {/* The same live region the figure uses, for the same reason: this is what replaces the
            amount, so a customer who is being read the bar hears the change either way. */}
        <p
          className={styles.emptyPrompt}
          aria-live="polite"
          data-testid="price-bar-empty"
        >
          {view.prompt}
        </p>
      </div>
    );
  }

  return (
    <div
      className={styles.bar}
      style={PRICE_BAR_METRICS}
      data-testid="price-bar"
    >
      {/* The **figure** is the live region, not the bar: the amount moves on every width step, and
          a region wrapping the whole bar would re-read whatever else stood in it each time. Polite
          rather than assertive — a price update is not worth interrupting. */}
      <p className={styles.figure} aria-live="polite">
        <span className={styles.label} data-testid="price-bar-label">
          {view.figure.label}
        </span>
        <span className={styles.amount} data-testid="price-bar-total">
          {view.figure.amountText}
        </span>
      </p>
      {/* **ADR 0065's flagged-total sentence is no longer drawn here** — the owner ruled it out of
          the bar and onto the scene on 2026-09-09 (ADR 0104 decision 8b), over letting the desktop
          bar grow on a flagged design. It is rendered once, by `price/flagged-total-warning.tsx`,
          from this same model. Nothing about the rule changed: the flag still travels with the total
          (decision 6), and the surface it travels to is the scene on both shells. */}
    </div>
  );
}
