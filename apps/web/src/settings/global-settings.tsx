"use client";

// Frames 2E / D2E's whole-kitchen settings, rendered. A full sheet on mobile, a popover hanging from
// the chips it controls on desktop — **one model and one set of markup**, with the shell decided in
// `global-settings.module.css` (§10.1's one permitted layout branch), exactly as the breakdown's is.
//
// It renders a value and decides nothing. Which tiers exist, what each is called, what it says about
// itself and what it adds are all the price book's, reaching here through `useWholeKitchenTierOffer`;
// how many bodies the sheet applies to is wave 6A's projection.
//
// **This surface is modal on both viewports, and that differs from `price-breakdown.tsx` on
// purpose.** The breakdown is a static list the customer asked to read, so it is deliberately
// non-modal and lets Tab walk out. This one holds **uncommitted state and an explicit apply**: a
// background the customer can still operate means changing the design underneath a pending material
// choice, and then applying it to a kitchen that is no longer the one the deltas were measured
// against. So here there is a scrim on both shells, `aria-modal`, a real focus trap, and the rest of
// the screen marked inert while it is open. Two neighbouring surfaces with opposite focus stories is
// not a bug in either.
import { projectDesignForDisplay } from "@lemnaria/configurator-domain";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type Ref,
  type RefObject,
} from "react";

import {
  usePricedDesign,
  useWholeKitchenTierOffer,
} from "@/price/use-priced-design";
import { useConfiguratorStore } from "@/store/configurator-store";

import {
  describeGlobalSettings,
  type GlobalSettingsView,
  type TierGroupView,
  type WholeKitchenChoice,
  type WholeKitchenGroupKey,
} from "./global-settings-model";
import styles from "./global-settings.module.css";

/** Frame D2E draws one beside the control. Decoration, and hidden from the accessibility tree: the
 *  control's name is the ruled string, not a glyph. */
const DISCLOSURE_GLYPH = "⌃";

/** Frames 2E / D2E carry the same round information mark the breakdown's note does. */
const NOTE_GLYPH = "i";

/** The tab ring inside the dialog. **A radio group contributes exactly its checked member**, which
 *  is the browser's own rule and is why the unchecked ones are not listed: including them would put
 *  the trap's first and last stops on elements Tab never visits, and the ring would leak past both
 *  ends. Every group here always has a checked member — a choice resolves to the book's default
 *  where the design names none. */
const TAB_STOP_SELECTOR = 'button:not([disabled]), input[type="radio"]:checked';

export function GlobalSettings() {
  const pricing = usePricedDesign();
  const offer = useWholeKitchenTierOffer();
  const design = useConfiguratorStore((state) => state.design);
  const catalog = useConfiguratorStore((state) => state.catalog);
  const setMaterialTier = useConfiguratorStore(
    (state) => state.setMaterialTier,
  );
  const setHardwareTier = useConfiguratorStore(
    (state) => state.setHardwareTier,
  );
  // Only the figure's *label* reads this — the total itself does not move under a refusal. Taken
  // here so the sheet cannot say *"De la"* over the bar it is covering while the bar behind the
  // scrim says *"De la neschimbat"*.
  const rejection = useConfiguratorStore((state) => state.lastRejection);

  // Wave 6A's projection, memoised on the two store slices the answer depends on — the reason
  // `usePricedDesign` memoises on the same two.
  const groups = useMemo(
    () => projectDesignForDisplay(design, catalog),
    [design, catalog],
  );

  const applied: WholeKitchenChoice = design.settings ?? {};
  const [isOpen, setIsOpen] = useState(false);
  // What the customer has chosen and not yet applied. Seeded from the design each time the sheet
  // opens, so cancelling and re-opening starts from what is actually stored.
  const [pending, setPending] = useState<WholeKitchenChoice>({});

  const anchorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const surfaceId = useId();

  const view = describeGlobalSettings({
    pricing,
    offer,
    groups,
    applied,
    pending,
    rejection,
  });

  const close = useCallback(() => {
    setIsOpen(false);
    // Back to what opened it, on cancel and on apply alike: a customer who reached the control by
    // keyboard has to be able to carry on from where they were.
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (isOpen) surfaceRef.current?.focus();
  }, [isOpen]);

  useEscapeToClose(isOpen, close);
  useBackgroundInert(isOpen, anchorRef);

  function openSheet(): void {
    setPending(applied);
    setIsOpen(true);
  }

  function chooseTier(key: WholeKitchenGroupKey, tierId: string): void {
    setPending((chosen) =>
      key === "material"
        ? { ...chosen, materialTierId: tierId }
        : { ...chosen, hardwareTierId: tierId },
    );
  }

  /** **Cancel writes nothing**, and apply writes only what changed — so opening the sheet and
   *  pressing *Aplică* without choosing anything leaves the document untouched rather than stamping
   *  the book's defaults into it. */
  function applyPending(): void {
    applyTierIfChanged({
      pendingTierId: pending.materialTierId,
      appliedTierId: applied.materialTierId,
      availableTierIds: offer.material.tierIds,
      commit: setMaterialTier,
    });
    applyTierIfChanged({
      pendingTierId: pending.hardwareTierId,
      appliedTierId: applied.hardwareTierId,
      availableTierIds: offer.hardware.tierIds,
      commit: setHardwareTier,
    });
    close();
  }

  return (
    <div
      className={styles.anchor}
      data-testid="global-settings"
      ref={anchorRef}
    >
      <div className={styles.chips} data-testid="global-settings-chips">
        {view.chips.map((chip) => (
          <span key={chip.key} className={styles.chip}>
            {chip.label}
          </span>
        ))}
      </div>
      <button
        type="button"
        ref={triggerRef}
        className={styles.trigger}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={surfaceId}
        data-testid="global-settings-trigger"
        onClick={openSheet}
      >
        {view.openLabel}
        <span className={styles.chevron} aria-hidden="true">
          {DISCLOSURE_GLYPH}
        </span>
      </button>
      {isOpen ? (
        <>
          {/* Drawn on **both** shells, unlike the breakdown's — see this file's head comment. It
              dismisses on click, which is the pointer's equivalent of Escape and writes nothing. */}
          <div
            className={styles.scrim}
            aria-hidden="true"
            data-testid="global-settings-scrim"
            onClick={close}
          />
          <GlobalSettingsSurface
            id={surfaceId}
            ref={surfaceRef}
            view={view}
            onChoose={chooseTier}
            onCancel={close}
            onApply={applyPending}
          />
        </>
      ) : null}
    </div>
  );
}

/** One setting's commit, as apply performs it. Grouped rather than passed as four arguments,
 *  because the two calls differ only in which setting they are about. */
interface TierApplication {
  readonly pendingTierId: string | undefined;
  readonly appliedTierId: string | undefined;
  readonly availableTierIds: readonly string[];
  readonly commit: (
    tierId: string,
    availableTierIds: readonly string[],
  ) => void;
}

function applyTierIfChanged(application: TierApplication): void {
  if (application.pendingTierId === undefined) return;
  if (application.pendingTierId === application.appliedTierId) return;
  application.commit(application.pendingTierId, application.availableTierIds);
}

/**
 * **Escape closes it wherever focus has got to**, which is why this listens on the document rather
 * than on the surface — `price-breakdown.tsx` records what binding it to the dialog cost.
 *
 * Registered only while open. It is the second such handler in the application, which the
 * breakdown's own comment anticipated: the rule it states is that the topmost surface registers last
 * and **no handler calls `stopPropagation`**, and both hold here. The two cannot both be open —
 * this one marks the rest of the screen inert, and the breakdown's trigger is part of it.
 */
function useEscapeToClose(isOpen: boolean, close: () => void): void {
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
}

/**
 * **The rest of the screen, marked inert while the sheet is open** — the half of "modal" a scrim
 * cannot do, because a keyboard can activate controls a pointer cannot.
 *
 * Applied to the screen's own children rather than to a named list of components: the branch holding
 * this control stays live (its trigger and chips are what the sheet is about) and every sibling band
 * — the header, the stage with its camera presets and §9's panel, the price bar and its breakdown —
 * goes inert together. Walking up to the screen rather than assuming a depth means a later change to
 * where this mounts cannot silently leave a band operable.
 */
function useBackgroundInert(
  isOpen: boolean,
  anchorRef: RefObject<HTMLDivElement | null>,
): void {
  useEffect(() => {
    const anchor = anchorRef.current;
    const screenElement = anchor?.closest("main");
    if (!isOpen || !anchor || !screenElement) return undefined;
    const behind = [...screenElement.children].filter(
      (band) => !band.contains(anchor),
    );
    for (const band of behind) band.setAttribute("inert", "");
    return () => {
      for (const band of behind) band.removeAttribute("inert");
    };
  }, [isOpen, anchorRef]);
}

/**
 * The sheet itself, given a view — no store, no pricing, no open state.
 *
 * Separated for `PriceBreakdownSurface`'s reason: the states below are reachable only through a
 * design, and a test that had to build one to see a tier's badge would be asserting the price book
 * rather than this surface.
 *
 * **`aria-modal="true"` here, where the breakdown deliberately carries none.** Both shells draw a
 * scrim and both trap focus, so unlike the breakdown the claim is true on each — see this file's
 * head comment for why the two surfaces answer this differently.
 */
export function GlobalSettingsSurface({
  id,
  ref,
  view,
  onChoose,
  onCancel,
  onApply,
}: {
  readonly id: string;
  readonly ref?: Ref<HTMLDivElement>;
  readonly view: GlobalSettingsView;
  readonly onChoose: (key: WholeKitchenGroupKey, tierId: string) => void;
  readonly onCancel: () => void;
  readonly onApply: () => void;
}) {
  const headingId = `${id}-title`;
  return (
    <div
      id={id}
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      tabIndex={-1}
      className={styles.surface}
      data-testid="global-settings-surface"
      onKeyDown={trapTab}
    >
      <span className={styles.grabber} aria-hidden="true" />
      <div className={styles.head}>
        <h2 id={headingId} className={styles.title}>
          {view.title}
        </h2>
        <p
          className={styles.appliesTo}
          data-testid="global-settings-applies-to"
        >
          {view.appliesTo}
        </p>
      </div>
      <div className={styles.body}>
        {view.groups.map((group) => (
          <TierGroupSection
            key={group.key}
            group={group}
            onChoose={onChoose}
            namePrefix={id}
          />
        ))}
        <p className={styles.warning} data-testid="global-settings-warning">
          <span className={styles.warningMark} aria-hidden="true">
            {NOTE_GLYPH}
          </span>
          {view.warning}
        </p>
      </div>
      {/* ADR 0065 decision 6: the flag travels with the total, and this surface shows one. */}
      {view.overflowWarning === undefined ? null : (
        <p className={styles.overflow} data-testid="global-settings-overflow">
          {view.overflowWarning}
        </p>
      )}
      <div className={styles.footer}>
        {/* Absent, never zero, when the design could not be priced — a tier the book has since
            withdrawn is the case, and the customer still needs the list above it to get out of
            that state. */}
        {view.figure === undefined ? null : (
          <p className={styles.figure}>
            <span className={styles.figureLabel}>{view.figure.label}</span>
            <span
              className={styles.figureAmount}
              data-testid="global-settings-figure"
            >
              {view.figure.amountText}
            </span>
          </p>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancel}
            data-testid="global-settings-cancel"
            onClick={onCancel}
          >
            {view.cancelLabel}
          </button>
          <button
            type="button"
            className={styles.apply}
            data-testid="global-settings-apply"
            onClick={onApply}
          >
            {view.applyLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** **The focus trap.** Bound to the dialog rather than to the document because a trap is about where
 *  focus *is* — which is exactly the property that made a document listener right for Escape and
 *  wrong here. */
function trapTab(event: ReactKeyboardEvent<HTMLDivElement>): void {
  if (event.key !== "Tab") return;
  const stops = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(TAB_STOP_SELECTOR),
  ];
  const landing = whereTabMustLand(stops, event.shiftKey);
  if (landing === undefined) return;
  event.preventDefault();
  landing.focus();
}

/**
 * Where this keypress has to be sent, or `undefined` where the browser's own answer is already
 * inside the ring.
 *
 * **The question is "would this keypress leave the dialog", not "is focus at an end", and the
 * difference is the whole defect this replaced.** A rule written on the ends alone is silent
 * whenever focus is on the container itself — which is exactly where the sheet *starts*, because
 * opening it focuses the dialog (`tabIndex={-1}`, focusable but not a tab stop, the ordinary
 * pattern). Forward from there the browser's next stop happens to be inside and nothing looked
 * wrong. **Backwards from there it is the trigger**, which is in the one band `useBackgroundInert`
 * deliberately leaves live — so a single Shift+Tab from the position every keyboard customer starts
 * in walked straight out of a surface whose whole point is that it cannot be left. Measured in a
 * browser, not reasoned about: one Shift+Tab reached the trigger, a second reached `<body>`.
 *
 * So focus not being on any of this dialog's own stops is a case in its own right, and it takes the
 * end the direction implies.
 */
function whereTabMustLand(
  stops: readonly HTMLElement[],
  isBackwards: boolean,
): HTMLElement | undefined {
  const first = stops.at(0);
  const last = stops.at(-1);
  if (first === undefined || last === undefined) return undefined;
  const at = stops.findIndex((stop) => stop === document.activeElement);
  if (at === -1) return isBackwards ? last : first;
  if (isBackwards) return at === 0 ? last : undefined;
  return at === stops.length - 1 ? first : undefined;
}

/** One group of tiers: native radios, so the arrow keys behave the way a customer's assistive
 *  technology already expects, and so choosing one is a change of pending state rather than a
 *  command. Nothing is written until apply. */
function TierGroupSection({
  group,
  namePrefix,
  onChoose,
}: {
  readonly group: TierGroupView;
  readonly namePrefix: string;
  readonly onChoose: (key: WholeKitchenGroupKey, tierId: string) => void;
}) {
  const headingId = `${namePrefix}-${group.key}-heading`;
  return (
    // `role="radiogroup"` over a `<fieldset>`: the fieldset is the semantically obvious wrapper and
    // its `<legend>` does not take part in flex layout the way the rest of the sheet does, so the
    // heading would be laid out by a different set of rules from every other line here.
    <section
      role="radiogroup"
      aria-labelledby={headingId}
      className={styles.group}
      data-testid="global-settings-group"
    >
      <h3 id={headingId} className={styles.heading}>
        {group.heading}
      </h3>
      {/* What this group's amounts are measured against, in the product's own words. Rendered only
          when there are amounts for it to be about. */}
      {group.anchor === undefined ? null : (
        <p className={styles.anchor} data-testid="global-settings-anchor">
          {group.anchor}
        </p>
      )}
      {group.options.map((option) => (
        <label
          key={option.tierId}
          className={styles.option}
          data-selected={option.isSelected}
          data-testid="global-settings-option"
        >
          <input
            type="radio"
            className={styles.radio}
            name={`${namePrefix}-${group.key}`}
            value={option.tierId}
            checked={option.isSelected}
            onChange={() => {
              onChoose(group.key, option.tierId);
            }}
          />
          <span className={styles.optionText}>
            <span className={styles.optionName}>{option.name}</span>
            <span className={styles.optionDescription}>
              {option.description}
            </span>
          </span>
          {option.deltaText === undefined ? null : (
            <span
              className={styles.optionDelta}
              data-testid="global-settings-delta"
            >
              {option.deltaText}
            </span>
          )}
        </label>
      ))}
    </section>
  );
}
