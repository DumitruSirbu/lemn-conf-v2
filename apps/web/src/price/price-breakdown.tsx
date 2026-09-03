"use client";

// Frames 2D / D2D's breakdown, rendered. A full sheet on mobile, a popover anchored to the price on
// desktop — **one model and one set of markup**, with the shell decided in
// `price-breakdown.module.css`, exactly as §9's sheet-or-rail is (§10.1's one permitted layout
// branch).
//
// It renders a value and decides nothing. Which rows exist, what order they are in, what each is
// called and what it prints are all `describePriceBreakdown`'s, and the rows it works from are
// `projectDesignForDisplay`'s — the one projection wave 6A exists to be.
//
// **Do not simplify the projection call below away, and the reason is not obvious.** A price line
// already carries `placementId`, `label` and `widthMm`, and `priceDesign` builds its lines by
// walking this same projection — so this component *could* rebuild a plausible, correctly ordered,
// correctly labelled breakdown from `pricing.priced.lines` alone and look right. The model's
// two-way refusal does not catch that: it compares the `groups` it was **handed** against the lines
// it was handed, and a guard that compares two things it was given cannot tell you where either
// came from. The binding is enforced in `tests/price/price-breakdown.adversarial.test.ts`, which
// captures the `groups` argument as it is handed over and requires it to equal the projection's
// answer for two designs with **different group structures** — unforgeable from lines, because no
// price line names a wall or a band, and that fact is itself asserted there.
//
// **What this file decides is what is open, and the focus story that follows from it**: focus moves
// into the surface when it opens, Escape closes it wherever focus has got to, and focus returns to
// the control that opened it. Tab may leave, and that is the contract rather than a gap — the
// listener below says why. Deliberately no live region either: a breakdown is a static list a
// customer asked to read, not a figure that moves under them, and `aria-live` here would re-read
// the whole list on every width step.
import { projectDesignForDisplay } from "@lemnaria/configurator-domain";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";

import { useConfiguratorStore } from "@/store/configurator-store";

import {
  describePriceBreakdown,
  type AvailableBreakdown,
  type BreakdownRow,
} from "./price-breakdown-model";
import styles from "./price-breakdown.module.css";
import { usePricedDesign } from "./use-priced-design";

/** The mockups draw it beside the control that opens the breakdown. Decoration, and hidden from
 *  the accessibility tree: the control's name is the ruled string, not a glyph. */
const DISCLOSURE_GLYPH = "⌃";

/** Frame 2D's note carries a round information mark. Decoration, like §9's banner's `!`. */
const NOTE_GLYPH = "i";

export function PriceBreakdown() {
  const pricing = usePricedDesign();
  const design = useConfiguratorStore((state) => state.design);
  const catalog = useConfiguratorStore((state) => state.catalog);

  // Wave 6A's projection, and the only source of the rows below. Memoised on the two store slices
  // the answer depends on, for the reason `usePricedDesign` memoises on the same two.
  const groups = useMemo(
    () => projectDesignForDisplay(design, catalog),
    [design, catalog],
  );
  const view = describePriceBreakdown({ pricing, groups });

  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const surfaceId = useId();

  const close = useCallback(() => {
    setIsOpen(false);
    // Back to what opened it, rather than to the top of the document — a customer who reached the
    // control by keyboard has to be able to carry on from where they were.
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (isOpen) surfaceRef.current?.focus();
  }, [isOpen]);

  /**
   * **Escape closes it wherever focus has got to**, which is why this listens on the document
   * rather than on the surface.
   *
   * Bound to the dialog — which is how this shipped, and was wrong — it only ever heard a key
   * pressed *inside* the dialog, and focus leaves for two ordinary reasons: a tap on the live page
   * behind the sheet blurs to `<body>`, and Tab walks out. A dismissal that depends on where focus
   * happens to be is not one a customer can rely on, and the customer who arrived by keyboard is
   * the one with no other way out.
   *
   * **Tab leaving this surface is intended, and must not be "fixed" into a focus trap — but the
   * reason holds on one shell and not the other, so read both halves before acting on it.**
   *
   * On the **mobile sheet** it is simply correct. Frame 2D draws **no scrim** at 390 × 844: the
   * scene behind stays live and tappable on purpose, so the sheet is non-modal *by design*, and
   * every stop the ring leaves to sits above it in plain view and works. Trapping focus there would
   * strand a keyboard customer inside a surface everyone else can leave.
   *
   * On the **desktop popover it is an accepted shortfall, recorded as one rather than argued away.**
   * `price-breakdown.module.css` draws a scrim at ≥ 900 px — visible, covering the viewport,
   * dismissing on click — so that shell *is* modal in every respect except focus. Tab still leaves
   * onto the scene's camera presets, which the scrim makes unreachable by pointer and does nothing
   * to protect from the keyboard: **a keyboard can activate controls a pointer cannot**, which is
   * the exact asymmetry a scrim exists to prevent.
   *
   * It is accepted because the alternatives are worse: §10.1 forbids branching behaviour on the
   * viewport in React — the shell is a stylesheet — so the choice is a trap on both shells or
   * neither, and a trap is wrong on the shell the mockups make the priority surface. Consistency
   * across the two is worth more than closing a small desktop leak. `aria-modal` cannot be branched
   * either, which is the same trade-off seen from the accessibility side.
   *
   * The measurement and the reasoning live in `tests/e2e/price-breakdown.adversarial.desktop.e2e.spec.ts`;
   * this is here so a reader of the component meets the trade-off rather than a claim about scrims
   * that is false on the shell where it matters. Removing the desktop scrim would dissolve it, and
   * that is a product change — it goes to the owner with 6G, beside the mobile scrim question.
   *
   * **A trap would also not have replaced this listener**, which both a reviewer and QA assumed it
   * would. A Tab wrap does not stop a `blur()`, and the tap behind the sheet is a blur — so the
   * trap was never the two-birds fix it looked like, and re-proposing it as one is re-treading a
   * question already answered.
   *
   * **What is deliberately not here: dismissing when focus leaves.** It is the obvious lighter
   * alternative and it is a trap of a different kind. It would close the sheet the moment the tap
   * behind it landed, which makes the two adversarial tests guarding this behaviour pass *before*
   * Escape is ever pressed — a green check that stopped asking its question. If blur-dismissal is
   * ever wanted, it lands together with those tests being re-pointed, never silently underneath
   * them.
   *
   * Registered only while open, so at most one of these exists. **That there is nothing to race
   * with is true today and was verified, not assumed** — no other module under `apps/web/src`
   * listens for Escape, so this is the only such handler in the application. When a second
   * dismissable surface arrives (wave 6G's settings sheet is the next candidate), the rule is that
   * the topmost surface registers last and **no handler calls `stopPropagation`**: closing this is
   * never a reason to swallow the key from something else that wants it.
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
        {view.title}
        <span className={styles.chevron} aria-hidden="true">
          {DISCLOSURE_GLYPH}
        </span>
      </button>
      {isOpen ? (
        <>
          {/* Frame D2D dims the screen behind the popover; frame 2D's sheet has no scrim, so the
              stylesheet draws this only on the desktop shell. Decorative and click-to-dismiss: the
              close button and Escape are the two ways this is closed from the keyboard. */}
          <div
            className={styles.scrim}
            aria-hidden="true"
            data-testid="price-breakdown-scrim"
            onClick={close}
          />
          <PriceBreakdownSurface
            id={surfaceId}
            ref={surfaceRef}
            view={view}
            onClose={close}
          />
        </>
      ) : null}
    </div>
  );
}

/**
 * The breakdown itself, given a view — no store, no hooks, no open state.
 *
 * Separated so the markup can be asserted from a value: the states below are reachable only through
 * a design, and a test that had to build a design to see an empty whole-kitchen section would be
 * asserting the price book rather than this surface.
 *
 * **`role="dialog"` with no `aria-modal`, deliberately, and the two shells disagree about whether
 * that is right.** `aria-modal="true"` tells assistive technology that everything outside is inert.
 * At 390 × 844 frame 2D draws no scrim and the page behind is live and clickable on purpose, so the
 * claim would be **false**; at ≥ 900 px frame D2D draws one, so there it would be **true**. §10.1
 * forbids branching that per shell in React — the shell is a stylesheet, never a React branch — so
 * one answer has to cover both, and the honest one is the weaker: a dialog you can leave. What that
 * costs on desktop is written out beside the Escape listener above, as an accepted shortfall rather
 * than a claim. A scrim on mobile, or none on desktop, would let the two shells agree; both are
 * visible product changes and the owner's, and go to them with 6G.
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
        {/* ADR 0036 decision 3's worktop exclusion, among transport and appliances — the sentence
            wave 6K's depth control relies on for adding no price line of its own. */}
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
        {/* After every placement row, and rendered only when the book produced one — the inclusion
            list is data, so an empty section is an absent section rather than an empty box. */}
        {view.wholeKitchenRows.length === 0 ? null : (
          <section
            className={styles.wholeKitchen}
            data-testid="price-breakdown-whole-kitchen"
          >
            {view.wholeKitchenRows.map((row) => (
              <BreakdownLine key={row.key} row={row} kind="whole-kitchen" />
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
      {/* ADR 0065 decision 6: the flag travels with the total, and this surface shows one. Beside
          the figure rather than in the list, so it reads as a caution about the number below the
          rows and not as a row of its own. */}
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

/** One row, whichever section it stands in. `kind` reaches the stylesheet as a data attribute
 *  rather than a second class name, because the two differ only in the label's colour and the
 *  markup is otherwise identical. */
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
