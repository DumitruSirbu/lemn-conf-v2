"use client";

// Frames 2D / D2D's breakdown, rendered: a full sheet on mobile, a popover anchored to the price on desktop, one
// model and one set of markup with the shell decided in `price-breakdown.module.css` (§10.1's one permitted layout
// branch). It renders a value and decides nothing: rows, order, labels and amounts are `describePriceBreakdown`'s.
//
// Do not simplify the projection call away: a price line already carries `placementId`, `label` and `widthMm`, so
// this component could rebuild a plausible breakdown from `pricing.priced.lines`, and the model's two-way refusal
// cannot tell where its inputs came from. `tests/price/price-breakdown.adversarial.test.ts` requires two designs
// with different group structures, which no price line can forge.
//
// Focus moves in when it opens, Escape closes it wherever focus is, and focus returns to the opener; Tab may leave,
// by contract. No live region: `aria-live` would re-read the static list on every width step.
import { projectDesignForDisplay } from "@lemnaria/configurator-domain";
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";

import { useConfiguratorStore } from "@/store/configurator-store";
import { useContent } from "@/i18n/use-content";

import {
  describePriceBreakdown,
  type AvailableBreakdown,
  type BreakdownDepthLine,
  type BreakdownRow,
} from "./price-breakdown-model";
import styles from "./price-breakdown.module.css";
import { useKeepSurfaceInsideViewport } from "./use-keep-surface-inside-viewport";
import { useDeepCabinetPercent, usePricedDesign } from "./use-priced-design";

/** Frame 2D's note carries a round information mark. Decoration, like §9's banner's `!`. */
const NOTE_GLYPH = "i";

export function PriceBreakdown() {
  const content = useContent();
  const pricing = usePricedDesign();
  const design = useConfiguratorStore((state) => state.design);
  const catalog = useConfiguratorStore((state) => state.catalog);

  // The projection is the only source of the rows below, memoised on the two store slices it depends on, as
  // `usePricedDesign` is.
  const groups = useMemo(
    () => projectDesignForDisplay(design, catalog),
    [design, catalog],
  );
  // No book means a refused pricing, which is the unavailable view: there is then no depth row to word.
  const deepCabinetPercent = useDeepCabinetPercent();
  const view = describePriceBreakdown({
    pricing,
    groups,
    content,
    deepCabinetPercent,
  });

  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const surfaceId = useId();
  useKeepSurfaceInsideViewport(surfaceRef, isOpen);

  const close = useCallback(() => {
    setIsOpen(false);
    // Back to what opened it, not the top of the document: a keyboard customer carries on from where they were.
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (isOpen) surfaceRef.current?.focus();
  }, [isOpen]);

  /**
   * Escape closes it wherever focus has got to, so this listens on the document, not the surface: a tap on the live
   * page behind blurs to `<body>` and Tab walks out, so a dismissal tied to focus cannot be relied on.
   *
   * Tab leaving this surface is intended and must not be "fixed" into a focus trap: the breakdown is non-modal on
   * both shells (no scrim, page behind reachable by pointer and keyboard, no `aria-modal`), and a trap would not
   * stop the `blur()` of a tap behind the sheet anyway. Click-outside-to-close is the accepted cost. The settings
   * sheet is the modal surface here (`global-settings.tsx`).
   *
   * Do not add dismiss-on-blur: it would close the sheet when the tap behind it lands, so the two adversarial tests
   * guarding this pass before Escape is pressed. Registered only while open; no handler may call `stopPropagation`.
   */
  useEffect(() => {
    if (!isOpen) return undefined;
    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") close();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen, close]);

  // A pricing failure renders no figure, and so offers nothing to explain about one.
  if (view.kind === "unavailable") return null;

  return (
    <div className={styles.anchor} data-testid="price-breakdown">
      <button
        type="button"
        ref={triggerRef}
        className={styles.trigger}
        aria-expanded={isOpen}
        aria-controls={surfaceId}
        data-testid="price-breakdown-trigger"
        onClick={() => {
          setIsOpen(!isOpen);
        }}
      >
        {/* No glyph beside it: a question mark replaces the mockups' caret as punctuation in the ruled
            string in `src/messages/ro.json`, and is read out. */}
        {view.title}
      </button>
      {isOpen ? (
        <PriceBreakdownSurface
          id={surfaceId}
          ref={surfaceRef}
          view={view}
          onClose={close}
        />
      ) : null}
    </div>
  );
}

/**
 * The breakdown itself, given a view (no store, hooks or open state), so its markup can be asserted from a value
 * without building a design. `role="dialog"` with no `aria-modal`, which is true on both shells: neither draws a
 * scrim and the page behind is live (`tests/price/price-breakdown-focus.dom.test.ts` pins this).
 */
export function PriceBreakdownSurface({
  id,
  ref,
  view,
  onClose,
}: {
  readonly id: string;
  readonly ref?: Ref<HTMLDivElement>;
  readonly view: AvailableBreakdown;
  readonly onClose: () => void;
}) {
  const headingId = `${id}-title`;
  return (
    <div
      id={id}
      ref={ref}
      role="dialog"
      aria-labelledby={headingId}
      tabIndex={-1}
      className={styles.surface}
      data-testid="price-breakdown-surface"
    >
      <span className={styles.grabber} aria-hidden="true" />
      <div className={styles.head}>
        <h2 id={headingId} className={styles.title}>
          {view.title}
        </h2>
        {/* The worktop exclusion among transport and appliances (ADR 0036 decision 3): why the depth
            control adds no price line of its own. */}
        <p
          className={styles.disclaimer}
          data-testid="price-breakdown-disclaimer"
        >
          {view.disclaimer}
        </p>
      </div>
      <div className={styles.body}>
        {view.groups.map((group) => (
          <section
            key={group.key}
            className={styles.group}
            data-testid="price-breakdown-group"
          >
            <h3 className={styles.heading}>{group.heading}</h3>
            {group.rows.map((row) => (
              <BreakdownLine key={row.key} row={row} kind="placement" />
            ))}
          </section>
        ))}
        {/* After every placement row; absent when the book produced no inclusions, not an empty box. The depth line
            is one of its rows, printed after the material row it multiplies with. */}
        {view.wholeKitchenRows.length === 0 &&
        view.depthLine === undefined ? null : (
          <section
            className={styles.wholeKitchen}
            data-testid="price-breakdown-whole-kitchen"
          >
            {view.depthLine !== undefined &&
            view.depthLineFollowsKey === undefined ? (
              <DepthLineRow line={view.depthLine} />
            ) : null}
            {view.wholeKitchenRows.map((row) => (
              <Fragment key={row.key}>
                <BreakdownLine row={row} kind="whole-kitchen" />
                {view.depthLine !== undefined &&
                view.depthLineFollowsKey === row.key ? (
                  <DepthLineRow line={view.depthLine} />
                ) : null}
              </Fragment>
            ))}
          </section>
        )}
        <p className={styles.note} data-testid="price-breakdown-note">
          <span className={styles.noteMark} aria-hidden="true">
            {NOTE_GLYPH}
          </span>
          {view.note}
        </p>
      </div>
      {/* ADR 0065 decision 6: the flag travels with the total. Beside the figure, not in the list, so it
          reads as a caution about the number and not as a row. */}
      {view.overflowWarning === undefined ? null : (
        <p className={styles.overflow} data-testid="price-breakdown-overflow">
          {view.overflowWarning}
        </p>
      )}
      <div className={styles.footer}>
        <p className={styles.figure}>
          <span className={styles.figureLabel}>{view.figure.label}</span>
          <span
            className={styles.figureAmount}
            data-testid="price-breakdown-figure"
          >
            {view.figure.amountText}
          </span>
        </p>
        <button
          type="button"
          className={styles.close}
          data-testid="price-breakdown-close"
          onClick={onClose}
        >
          {view.closeLabel}
        </button>
      </div>
    </div>
  );
}

/** One row, whichever section it stands in. `kind` reaches the stylesheet as a data attribute because the two
 *  differ only in the label's colour. */
function BreakdownLine({
  row,
  kind,
}: {
  readonly row: BreakdownRow;
  readonly kind: "placement" | "whole-kitchen";
}) {
  return (
    <span className={styles.row} data-row={kind} data-testid="breakdown-row">
      <span className={styles.rowLabel} data-testid="breakdown-row-label">
        {row.label}
      </span>
      <span className={styles.rowAmount} data-testid="breakdown-row-amount">
        {row.amountText}
      </span>
    </span>
  );
}

/** The depth line: a whole-kitchen row with the cabinets it applies to under its label. Its own test ids, so a count
 *  of `breakdown-row` stays a count of the rows the placements and the tiers print. */
function DepthLineRow({ line }: { readonly line: BreakdownDepthLine }) {
  return (
    <span
      className={styles.row}
      data-row="whole-kitchen"
      data-testid="breakdown-depth-row"
    >
      <span className={styles.rowLabel}>
        <span data-testid="breakdown-depth-label">{line.label}</span>
        <span className={styles.rowScope} data-testid="breakdown-depth-scope">
          {line.scope}
        </span>
      </span>
      <span className={styles.rowAmount} data-testid="breakdown-depth-amount">
        {line.amountText}
      </span>
    </span>
  );
}
