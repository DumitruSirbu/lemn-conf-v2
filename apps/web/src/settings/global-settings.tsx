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
import {
  countCabinetsWearingAChosenFinish,
  projectDesignForDisplay,
} from "@lemnaria/configurator-domain";
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
  type DepthGroupView,
  type MaterialResetConfirmView,
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
  const setCabinetDepth = useConfiguratorStore(
    (state) => state.setCabinetDepth,
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

  // **On `design` alone**, unlike the projection above: the query reads the document and the
  // material declaration and nothing else, so memoising it on `pending` too would make a number
  // about what is *stored* move every time the customer taps a radio.
  const chosenColourCount = useMemo(
    () => countCabinetsWearingAChosenFinish(design),
    [design],
  );

  const applied: WholeKitchenChoice = design.settings ?? {};
  const [isOpen, setIsOpen] = useState(false);
  // **The component's one boolean, and it is about the step rather than about the rule.** Whether a
  // confirmation is owed is `view.materialResetConfirm`'s presence, decided in the model; this only
  // records that the customer has been asked and has not answered yet.
  const [isConfirming, setIsConfirming] = useState(false);
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
    chosenColourCount,
  });

  const close = useCallback(() => {
    setIsOpen(false);
    setIsConfirming(false);
    // Back to what opened it, on cancel and on apply alike: a customer who reached the control by
    // keyboard has to be able to carry on from where they were.
    triggerRef.current?.focus();
  }, []);

  /** **What Escape and the scrim dismiss: the topmost thing, one step at a time.** On the confirm
   *  step that is the question, so both step back to the choosing step with the pending choices
   *  intact and nothing written — not the document, not `selection`, and not `lastRejection`, which
   *  a dismissal must not clear (ADR 0086 decision 5). A second press leaves the sheet. */
  const dismiss = useCallback(() => {
    if (isConfirming) {
      setIsConfirming(false);
      return;
    }
    close();
  }, [isConfirming, close]);

  /**
   * **Focus lands on the dialog on open and again on every step change** — and the second half is
   * not tidiness, it is what keeps the trap a trap.
   *
   * The two steps are different component types at the same position, so React unmounts the focused
   * button when the step swaps. `document.activeElement` then falls back to `<body>`, the dialog's
   * `onKeyDown` never fires because focus is outside it, and `whereTabMustLand`'s guarantee is
   * bypassed rather than wrong: measured in a browser at both viewports, one Shift+Tab from there
   * reached `global-settings-trigger` — the one control `useBackgroundInert` deliberately leaves
   * live — and Enter on it re-opened the sheet, discarding the pending material choice with no
   * warning. **In both directions**, forward to the confirm step and back from it.
   *
   * Forward Tab happened to land inside anyway, because Chromium starts sequential focus where the
   * destroyed button was. That is a browser detail and not the trap working, which is why the
   * dependency is the step rather than a patch aimed at one direction.
   */
  useEffect(() => {
    if (isOpen) surfaceRef.current?.focus();
  }, [isOpen, isConfirming]);

  useEscapeToDismiss(isOpen, dismiss);
  useBackgroundInert(isOpen, anchorRef);

  function openSheet(): void {
    setPending(applied);
    setIsConfirming(false);
    setIsOpen(true);
  }

  function chooseTier(key: WholeKitchenGroupKey, tierId: string): void {
    setPending((chosen) =>
      key === "material"
        ? { ...chosen, materialTierId: tierId }
        : { ...chosen, hardwareTierId: tierId },
    );
  }

  function chooseDepth(cabinetDepthMm: number): void {
    setPending((chosen) => ({ ...chosen, cabinetDepthMm }));
  }

  /** **The whole press is gated, not the material half of it** (ADR 0081 decision 2). With a
   *  confirmation owed this runs no command at all — not material, not hardware, not depth — and
   *  asks instead. A partial apply is not a state this product has. */
  function requestApply(): void {
    if (view.materialResetConfirm === undefined) {
      applyPending();
      return;
    }
    setIsConfirming(true);
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
    // The same two guards the tiers get, and they matter more here: a depth change rebuilds every
    // body and the whole 3D scene (ADR 0074), so applying an unchanged depth would be the most
    // expensive no-op in the product.
    if (
      pending.cabinetDepthMm !== undefined &&
      pending.cabinetDepthMm !== applied.cabinetDepthMm
    ) {
      setCabinetDepth(pending.cabinetDepthMm);
    }
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
            onClick={dismiss}
          />
          <GlobalSettingsSurface
            id={surfaceId}
            ref={surfaceRef}
            view={view}
            onChoose={chooseTier}
            onChooseDepth={chooseDepth}
            onCancel={close}
            onApply={requestApply}
            {...(isConfirming && view.materialResetConfirm !== undefined
              ? {
                  confirming: {
                    view: view.materialResetConfirm,
                    onConfirm: applyPending,
                    onStepBack: dismiss,
                  },
                }
              : {})}
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
 * **Escape dismisses it wherever focus has got to**, which is why this listens on the document
 * rather than on the surface — `price-breakdown.tsx` records what binding it to the dialog cost.
 *
 * Registered only while open. It is the second such handler in the application, which the
 * breakdown's own comment anticipated: the rule it states is that the topmost surface registers last
 * and **no handler calls `stopPropagation`**, and both hold here. The two cannot both be open —
 * this one marks the rest of the screen inert, and the breakdown's trigger is part of it.
 *
 * **Still one listener with the confirm step**, and it dismisses one step rather than the sheet —
 * ADR 0081 decision 3. A second document-level handler for a second dialog is what that decision
 * refuses, and what `dismiss` above exists to make unnecessary.
 */
function useEscapeToDismiss(isOpen: boolean, dismiss: () => void): void {
  useEffect(() => {
    if (!isOpen) return undefined;
    function dismissOnEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") dismiss();
    }
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [isOpen, dismiss]);
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
  confirming,
  onChoose,
  onChooseDepth,
  onCancel,
  onApply,
}: {
  readonly id: string;
  readonly ref?: Ref<HTMLDivElement>;
  readonly view: GlobalSettingsView;
  /** **The confirm step, or nothing** — its presence is which step this is. A `MaterialResetConfirm`
   *  and its two actions rather than a boolean beside them: a flag switching what a surface renders
   *  is the argument this codebase splits functions to avoid, and the step's data and the step's
   *  handlers arrive or are absent together. */
  readonly confirming?: MaterialResetConfirmStep;
  readonly onChoose: (key: WholeKitchenGroupKey, tierId: string) => void;
  /** Separate from `onChoose` because a depth is not a tier id: it carries no group key and no
   *  `availableTierIds`, and widening the tier callback to take a number would make the type say a
   *  depth is one of the things a tier group offers. */
  readonly onChooseDepth: (cabinetDepthMm: number) => void;
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
      data-step={confirming === undefined ? "choosing" : "confirm"}
      onKeyDown={trapTab}
    >
      <span className={styles.grabber} aria-hidden="true" />
      {/* **The head follows the step** (ADR 0086 decision 6). `aria-labelledby` keeps naming this
          same heading, so the dialog's accessible name is whatever the screen is asking; and
          `appliesTo` goes, because it states how many bodies the sheet applies to, four lines above
          a sentence stating how many wear a chosen colour — two different counts of cabinets on one
          screen, about one button. */}
      <div className={styles.head}>
        <h2 id={headingId} className={styles.title}>
          {confirming === undefined ? view.title : confirming.view.title}
        </h2>
        {confirming === undefined ? (
          <p
            className={styles.appliesTo}
            data-testid="global-settings-applies-to"
          >
            {view.appliesTo}
          </p>
        ) : null}
      </div>
      {confirming === undefined ? (
        <ChoosingStep
          view={view}
          namePrefix={id}
          onChoose={onChoose}
          onChooseDepth={onChooseDepth}
          onCancel={onCancel}
          onApply={onApply}
        />
      ) : (
        <ConfirmStep step={confirming} />
      )}
    </div>
  );
}

/** The confirm step's own view and its own two actions, which arrive together or not at all. */
interface MaterialResetConfirmStep {
  readonly view: MaterialResetConfirmView;
  /** Runs the apply the choosing step's *Aplică* withheld — all three settings, one press. */
  readonly onConfirm: () => void;
  /** Back to the choosing step, writing nothing. */
  readonly onStepBack: () => void;
}

/**
 * **The consequence, and the two ways out of it.** It replaces the sheet's body and footer inside
 * the one dialog above — no second scrim, no second focus trap and no second Escape listener
 * (ADR 0081 decision 3).
 *
 * **The figure and the overflow warning go with the footer they belong to.** A running total beside
 * *Schimbă materialul* invites the reading that the price is what changes, and the estimate is not
 * what this step is about.
 */
function ConfirmStep({ step }: { readonly step: MaterialResetConfirmStep }) {
  return (
    <>
      <div className={styles.body}>
        <p
          className={styles.confirmBody}
          data-testid="global-settings-confirm-body"
        >
          {step.view.body}
        </p>
      </div>
      <div className={styles.footer}>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancel}
            data-testid="global-settings-confirm-back"
            onClick={step.onStepBack}
          >
            {step.view.backLabel}
          </button>
          <button
            type="button"
            className={styles.apply}
            data-testid="global-settings-confirm"
            onClick={step.onConfirm}
          >
            {step.view.confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}

/** The step the sheet opens on: the three groups, the warning, the figure and the apply. */
function ChoosingStep({
  view,
  namePrefix,
  onChoose,
  onChooseDepth,
  onCancel,
  onApply,
}: {
  readonly view: GlobalSettingsView;
  readonly namePrefix: string;
  readonly onChoose: (key: WholeKitchenGroupKey, tierId: string) => void;
  readonly onChooseDepth: (cabinetDepthMm: number) => void;
  readonly onCancel: () => void;
  readonly onApply: () => void;
}) {
  return (
    <>
      <div className={styles.body}>
        {view.groups.map((group) => (
          <TierGroupSection
            key={group.key}
            group={group}
            onChoose={onChoose}
            namePrefix={namePrefix}
          />
        ))}
        <DepthGroupSection
          group={view.depthGroup}
          onChoose={onChooseDepth}
          namePrefix={namePrefix}
        />
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
    </>
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
 *
 * **What this cannot do is fire when focus has left the dialog altogether**, because it hangs off
 * the dialog's own `onKeyDown`. The same defect recurred through that gap — the confirm step
 * unmounted the focused button and dropped focus on `<body>` — so the guarantee above holds only
 * while something keeps focus inside. That something is the step-change effect in `GlobalSettings`,
 * and the two are one mechanism read from its two ends.
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

/** The depth group: the same native radios the tier groups use, for the same reason, and a note and
 *  a warning instead of an anchor and a delta.
 *
 *  **`view.depthGroup.shape` is read, never derived here.** Which control two declared depths earn
 *  is a rule about the declared map (ADR 0056) and it lives in the model; a component counting its
 *  own options would be a second author for it, and the count is exactly what a third declared depth
 *  changes. Today both shapes render the same radios and the attribute is what a shell or a test
 *  reads — the toggle's own layout is CSS, not markup. */
function DepthGroupSection({
  group,
  namePrefix,
  onChoose,
}: {
  readonly group: DepthGroupView;
  readonly namePrefix: string;
  readonly onChoose: (cabinetDepthMm: number) => void;
}) {
  const headingId = `${namePrefix}-cabinet-depth-heading`;
  return (
    <section
      role="radiogroup"
      aria-labelledby={headingId}
      className={styles.group}
      data-testid="global-settings-depth-group"
      data-shape={group.shape}
    >
      <h3 id={headingId} className={styles.heading}>
        {group.heading}
      </h3>
      {group.options.map((option) => (
        <label
          key={option.cabinetDepthMm}
          className={styles.option}
          data-selected={option.isSelected}
          data-testid="global-settings-depth-option"
        >
          <input
            type="radio"
            className={styles.radio}
            name={`${namePrefix}-cabinet-depth`}
            value={option.cabinetDepthMm}
            checked={option.isSelected}
            onChange={() => {
              onChoose(option.cabinetDepthMm);
            }}
          />
          <span className={styles.optionText}>
            <span className={styles.optionName}>{option.label}</span>
          </span>
        </label>
      ))}
      {/* Why there is no amount beside any of these, so the absence does not read as a missing
          line. */}
      <p className={styles.anchor} data-testid="global-settings-depth-note">
        {group.note}
      </p>
      <p className={styles.warning} data-testid="global-settings-depth-warning">
        <span className={styles.warningMark} aria-hidden="true">
          {NOTE_GLYPH}
        </span>
        {group.warning}
      </p>
    </section>
  );
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
