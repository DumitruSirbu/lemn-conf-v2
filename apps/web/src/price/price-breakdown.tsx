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
import { useContent } from "@/i18n/use-content";

import {
  describePriceBreakdown,
  type AvailableBreakdown,
  type BreakdownRow,
} from "./price-breakdown-model";
import styles from "./price-breakdown.module.css";
import { usePricedDesign } from "./use-priced-design";

/** Frame 2D's note carries a round information mark. Decoration, like §9's banner's `!`. */
const NOTE_GLYPH = "i";

export function PriceBreakdown() {
  const content = useContent();
  const pricing = usePricedDesign();
  const design = useConfiguratorStore((state) => state.design);
  const catalog = useConfiguratorStore((state) => state.catalog);

  // Wave 6A's projection, and the only source of the rows below. Memoised on the two store slices
  // the answer depends on, for the reason `usePricedDesign` memoises on the same two.
  const groups = useMemo(
    () => projectDesignForDisplay(design, catalog),
    [design, catalog],
  );
  const view = describePriceBreakdown({ pricing, groups, content });

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
   * **Tab leaving this surface is intended, and must not be "fixed" into a focus trap.** The breakdown
   * is non-modal on **both** shells and now says so in every input mode — which is the resolution of
   * M6-AUD-013, ruled by the owner on 2026-09-09.
   *
   * It used to be modal for a pointer and not for a keyboard: `price-breakdown.module.css` drew a
   * scrim at ≥ 900 px — visible, covering the viewport, dismissing on click — while Tab walked out
   * onto the scene's camera presets, which the scrim made unreachable by pointer and did nothing to
   * protect from the keyboard. **A keyboard could activate controls a pointer could not**, the exact
   * asymmetry a scrim exists to prevent, and the dialog could not truthfully advertise `aria-modal`
   * on either shell.
   *
   * The three coherent fixes were put to the owner and they chose the smallest: **remove the desktop
   * scrim**, so both shells are genuinely non-modal and the page behind stays reachable to pointer
   * and keyboard alike. The alternative — modal on both — was rejected because frame 2D deliberately
   * keeps the mobile scene live behind the sheet, and §10.1 forbids branching behaviour on the
   * viewport in React, so one answer has to cover both.
   *
   * **What that cost, deliberately**: click-outside-to-close on desktop. Escape and the close button
   * are the two ways out, and Escape is why this listener is on the document rather than the dialog.
   * The settings sheet is the modal surface in this application and keeps its scrim, its trap, its
   * `aria-modal` and its `inert` — see `global-settings.tsx`, which is what a real modal looks like
   * here.
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
        {/* **No glyph beside it since 2026-09-09.** The mockups draw a caret here and the owner
            replaced it with a question mark, which is punctuation rather than decoration — so it is
            part of the ruled string in `src/messages/ro.json` and is read out, where the caret was
            deliberately hidden from the accessibility tree. */}
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
 * The breakdown itself, given a view — no store, no hooks, no open state.
 *
 * Separated so the markup can be asserted from a value: the states below are reachable only through
 * a design, and a test that had to build a design to see an empty whole-kitchen section would be
 * asserting the price book rather than this surface.
 *
 * **`role="dialog"` with no `aria-modal`, and since M6-AUD-013's ruling that claim is simply true on
 * both shells.** `aria-modal="true"` tells assistive technology that everything outside is inert.
 * Neither shell draws a scrim now and the page behind is live and clickable on both, so the weaker
 * declaration is the accurate one rather than a compromise between two shells that disagreed.
 *
 * It was a compromise until 2026-09-09: at ≥ 900 px a scrim made the claim true for a pointer and
 * false for a keyboard, and §10.1 forbids branching that per shell in React. Removing the scrim was
 * the owner's answer. Adding `aria-modal` here alone would make it false again in the other
 * direction, which is what `tests/price/price-breakdown-focus.dom.test.ts` pins.
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
