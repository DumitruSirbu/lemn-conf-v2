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
  cornerDirectionOf,
  countCabinetsWearingAChosenFinish,
  lookUpMaterial,
  projectDesignForDisplay,
  wouldDiscardTheGlobalFinish,
  type Finish,
} from "@lemnaria/configurator-domain";
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react";

import { FinishSectionView } from "@/panel/editor-panel";
import { describeFinishSection } from "@/panel/panel-model";
import {
  usePricedDesign,
  useWholeKitchenTierOffer,
} from "@/price/use-priced-design";
import { ShareDesign } from "@/share/share-design";
import { useConfiguratorStore } from "@/store/configurator-store";
import { describeEditability, type Editability } from "@/store/editability";
import { useContent } from "@/i18n/use-content";

import {
  ConfirmStep,
  trapTab,
  useBackgroundInert,
  useEscapeToDismiss,
} from "./confirmation-dialog";
import {
  chooseDepthIn,
  chooseFinishIn,
  chooseTierIn,
  describeApplyRefusal,
  describeGlobalSettings,
  describePillRung,
  resolveOpeningChoice,
  type ApplyRefusal,
  type GlobalSettingsView,
  type ColourGroupView,
  type DepthGroupView,
  type MaterialResetConfirmView,
  type TierGroupView,
  type WholeKitchenChoice,
  type WholeKitchenGroupKey,
} from "./global-settings-model";
import styles from "./global-settings.module.css";

/** Frames D2A `:556` and D2E `:959` draw the caret both ways round: `▾` shut, `⌃` open. Decoration,
 *  and hidden from the accessibility tree — the control's name is the ruled string, not a glyph, and
 *  `aria-expanded` is what states the surface's state. */
const DISCLOSURE_GLYPH = "⌃";

const CLOSED_GLYPH = "▾";

/** Frames 2E / D2E carry the same round information mark the breakdown's note does. */
const NOTE_GLYPH = "i";

interface GlobalSettingsProps {
  /** How many settings the pill names, decided from the row's measured track by
   *  `configure/use-top-bar-fit.ts`. **Not decided here**: the fit is a value over measured widths
   *  and no component may take it (ADR 0104 decision 3). */
  readonly visibleCount: number;
}

export function GlobalSettings({ visibleCount }: GlobalSettingsProps) {
  const content = useContent();
  const pricing = usePricedDesign();
  const offer = useWholeKitchenTierOffer();
  const design = useConfiguratorStore((state) => state.design);
  const catalog = useConfiguratorStore((state) => state.catalog);
  const applyWholeKitchenSettings = useConfiguratorStore(
    (state) => state.applyWholeKitchenSettings,
  );
  // **The two fields wave 6G never selected** (M6-AUD-001). Without them this surface had no locked
  // state at all: its trigger, its radios and its *Aplică* stayed live on a read-only `/d/{id}` link
  // while §9's panel one band away was correctly greyed. The rule itself is
  // `store/editability.ts`'s, shared with the panel, so the two cannot drift again.
  const canWrite = useConfiguratorStore((state) => state.canWrite);
  const saveStatus = useConfiguratorStore((state) => state.saveStatus);

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
  // opens — through `resolveOpeningChoice`, so a stored tier the book has withdrawn opens as the
  // fallback the sheet actually displays (M6-AUD-012) — so cancelling and re-opening starts from
  // what is stored.
  const [pending, setPending] = useState<WholeKitchenChoice>({});
  /** The last press this sheet refused, or nothing. Component state rather than a store read: it is
   *  about *this* press, and `lastRejection` cannot be told apart from a refusal already on screen
   *  when the sheet opened. */
  const [refusal, setRefusal] = useState<ApplyRefusal | undefined>(undefined);

  const editability = describeEditability(
    { canWrite, saveStatus },
    content.panel,
  );

  const anchorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const surfaceId = useId();

  // **ADR 0099 decision 7's second arm, asked of the domain about the *pending* material.** It is
  // the one question the amended count cannot answer: a kitchen whose cabinets all follow one global
  // colour counts zero chosen colours and still loses a colour somebody chose.
  const globalFinishWouldBeLost =
    pending.materialTierId !== undefined &&
    wouldDiscardTheGlobalFinish(design, pending.materialTierId);

  const view = describeGlobalSettings({
    content,
    pricing,
    offer,
    groups,
    applied,
    pending,
    chosenColourCount,
    globalFinishWouldBeLost,
  });
  // What the pill draws at the rung the row's measurement put it on. The rung is a count, taken
  // there; what that count *names* is composed here, from the same model the sheet renders.
  const rung = describePillRung(view.pill, visibleCount);

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
    setPending(resolveOpeningChoice(applied, offer));
    setIsConfirming(false);
    setRefusal(undefined);
    setIsOpen(true);
  }

  function chooseTier(key: WholeKitchenGroupKey, tierId: string): void {
    setPending((chosen) => chooseTierIn(chosen, { key, tierId }));
  }

  function chooseDepth(cabinetDepthMm: number): void {
    setPending((chosen) => chooseDepthIn(chosen, cabinetDepthMm));
  }

  function chooseFinish(finish: Finish): void {
    setPending((chosen) => chooseFinishIn(chosen, finish));
  }

  /** **The whole press is gated, not the material half of it** (ADR 0081 decision 2). With a
   *  confirmation owed this runs no command at all — not material, not hardware, not depth — and
   *  asks instead. A partial apply is not a state this product has.
   *
   *  It carries the read-only guard because it is *a* door into the commit. It is not the only one —
   *  see `applyPending`, which carries its own. */
  function requestApply(): void {
    if (editability.isReadOnly) return;
    if (view.materialResetConfirm === undefined) {
      applyPending();
      return;
    }
    setIsConfirming(true);
  }

  /**
   * **Cancel writes nothing**, and apply writes only what changed — so opening the sheet and
   * pressing *Aplică* without choosing anything leaves the document untouched rather than stamping
   * the book's defaults into it.
   *
   * **And one press is one commit** (M6-AUD-004). The three settings used to be three independent
   * store actions, each mutating state and scheduling a save the moment it succeeded, so a depth
   * refused after a material committed left the design half changed — and closed the sheet on it.
   * `applyWholeKitchenSettings` preflights the whole press and commits once or not at all; on a
   * refusal the sheet **stays open**, naming the setting that refused, with every other choice the
   * customer made still standing.
   *
   * **The guard is here and not only on `requestApply`** (M6-AUD-001, found by adversarial QA).
   * There are two doors into this commit — the choosing step's *Aplică* goes through `requestApply`,
   * the confirm step's *Schimbă materialul* calls this function directly — and guarding the caller
   * guarded one of them. The state that walks through the other needs nothing unusual from the
   * customer: the sheet opens writable, *Aplică* is pressed, a confirmation is owed, and while the
   * question is on screen an earlier edit's save comes back `unauthorized`. That is the audit
   * finding's own scenario, one step further in. A rule that has to be remembered at each call site
   * is the rule this whole wave is about.
   */
  function applyPending(): void {
    if (editability.isReadOnly) return;
    const outcome = applyWholeKitchenSettings({
      ...(pending.materialTierId === undefined
        ? {}
        : { materialTierId: pending.materialTierId }),
      ...(pending.hardwareTierId === undefined
        ? {}
        : { hardwareTierId: pending.hardwareTierId }),
      ...(pending.cabinetDepthMm === undefined
        ? {}
        : { cabinetDepthMm: pending.cabinetDepthMm }),
      // Absent stays absent, like every other field of this request: a sheet nobody touched the
      // colour on must leave a document that chose no global colour exactly as it found it.
      ...(pending.finish === undefined ? {} : { finish: pending.finish }),
      availableMaterialTierIds: offer.material.tierIds,
      availableHardwareTierIds: offer.hardware.tierIds,
    });
    if (!outcome.committed) {
      setRefusal({
        setting: outcome.setting,
        // **6B-e**: the engine hands back a code and its params, and the sentence is the active
        // locale's. ADR 0032 rule 2 still holds — the sheet hands over to the engine's own words
        // rather than restating the refusal in its own.
        //
        // Review L1.6: a whole-kitchen refusal reaches here from `setCabinetDepth`'s rebuild, whose
        // only refusal codes are `COLUMN_MISMATCH`, `NON_INTEGER_MILLIMETRES` and
        // `evaluateInsertFit`'s own set (`WIDTH_TOO_SMALL`/`_LARGE`, `WIDTH_NOT_SUPPORTED`,
        // `HEIGHT_EXCEEDS_LEVEL`/`_TOO_LARGE`, `NO_SNAP_POSITION`, `BAND_MISMATCH`,
        // `OPENING_TOO_SHORT`, `COLUMN_MISMATCH`, `TARGET_NOT_FOUND`/`_REPLACEABLE`) — none of which
        // is `NO_EMPTY_SPACE`, `RESIZE_OPENS_GAP` or `COLUMN_KEY_COLLISION`, the only codes that ever
        // carry `sides` (`content.ts`'s `SIDE_CARRIERS`). So the direction this call omits can never
        // change the sentence; it is passed anyway so a future refusal code does not silently depend
        // on that fact.
        message: content.rejection(
          outcome.reason,
          cornerDirectionOf(design.room),
        ),
      });
      // Back to the choosing step rather than out of the sheet: the confirm step's *Schimbă
      // materialul* reaches here too, and leaving the customer on a question that has been answered
      // would hide the refusal behind it.
      setIsConfirming(false);
      return;
    }
    close();
  }

  return (
    <div
      className={styles.anchor}
      data-testid="global-settings"
      ref={anchorRef}
    >
      {/* **Frames D2A / 2A's pill, and it is the trigger** (ADR 0104 decision 2): no frame draws a
          separate *Setări globale* control, so `globalSettings.open` is this button's accessible
          name rather than visible text — through `pillNameAllSettings`, which states **every**
          setting whether or not the pill has room to draw it. `+N` is a visual economy and must not
          cost a screen-reader user a setting.

          **Greyed and unclickable with the reason** (§13.1, M6-AUD-001). The reason travels as the
          button's own description rather than as a line beside it: a sentence added to this row is
          exactly what pushed the trigger's right edge off a 390 px screen once already. Nothing is
          hidden by locking it — the pill still names what the kitchen carries. */}
      <button
        type="button"
        ref={triggerRef}
        className={styles.pill}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={surfaceId}
        aria-label={view.pill.accessibleName}
        data-testid="global-settings-trigger"
        disabled={editability.isReadOnly}
        {...(editability.isReadOnly
          ? {
              title: editability.disabledReason,
              "data-disabled-reason": editability.disabledReason,
            }
          : {})}
        onClick={openSheet}
      >
        {/* **One swatch, and it wears the kitchen's colour** (owner, 2026-09-09). Both frames draw
            one, at the head of the pill, over a fixed decor texture; the colour it actually carries
            is the adapter's own value for the applied finish, published as a custom property so the
            pill, §9's chips and the 3D all paint from one declared colour. A wood derives its grain
            from that same value — `global-settings.module.css`, in the language
            `editor-panel.module.css` already speaks. */}
        <span
          className={styles.swatch}
          aria-hidden="true"
          {...(view.pill.swatch === undefined
            ? {}
            : {
                style: {
                  "--pill-swatch-colour": view.pill.swatch.colour,
                } as CSSProperties,
                "data-wood": view.pill.swatch.isWood ? "true" : "false",
              })}
        />
        {rung.labels.map((label, position) => (
          <Fragment key={label}>
            {position === 0 ? null : (
              <span className={styles.separator} aria-hidden="true" />
            )}
            {/* **Only the first label may ever ellipsise**, which is frame D2A's own arrangement and
                the ladder's floor: at every other rung a label that does not fit is counted rather
                than cut, and at the floor the first label is the only one left. */}
            <span
              className={
                position === 0
                  ? [styles.label, styles.leadLabel].join(" ")
                  : styles.label
              }
              data-testid="global-settings-pill-label"
            >
              {label}
            </span>
          </Fragment>
        ))}
        {rung.counter === undefined ? null : (
          <span
            className={styles.counter}
            data-testid="global-settings-pill-count"
          >
            {rung.counter}
          </span>
        )}
        {/* Frame D2E flips the caret when the surface is open; frame 2A draws none at all, which
            `global-settings.module.css` decides rather than this component. */}
        <span className={styles.caret} aria-hidden="true">
          {isOpen ? DISCLOSURE_GLYPH : CLOSED_GLYPH}
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
            editability={editability}
            shareControl={<ShareDesign />}
            {...(refusal === undefined
              ? {}
              : { refusalNote: describeApplyRefusal(refusal, content) })}
            onChoose={chooseTier}
            onChooseDepth={chooseDepth}
            onChooseFinish={chooseFinish}
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
  editability,
  refusalNote,
  confirming,
  shareControl,
  onChoose,
  onChooseDepth,
  onChooseFinish,
  onCancel,
  onApply,
}: {
  readonly id: string;
  readonly ref?: Ref<HTMLDivElement>;
  readonly view: GlobalSettingsView;
  /**
   * Whether this browser may write, already decided by `store/editability.ts`.
   *
   * **Required, and it was optional for one wave.** It defaulted to *writable* on the trade
   * `DescribePanelInput.pricing` records — a convenient default, with the dropped-wiring risk said
   * to be closed by `tests/settings/read-only-global-settings.test.ts` going red if `GlobalSettings`
   * stopped passing it. **Adversarial QA measured that claim and it was false**: deleting
   * `editability={editability}` from the one production call site left all 1710 tests green.
   * Nothing in a `node` runtime can open the sheet — there is no DOM, so `useState(false)` never
   * advances — so that file renders the store-connected component only with the sheet **shut**, and
   * renders the open sheet by constructing this surface and passing the prop itself. No test
   * exercised the production wiring with the sheet open, and the type was silent because the prop
   * was optional.
   *
   * So the type carries it now. This is the wave whose whole subject is a write surface that
   * silently defaulted to permitted; one more of those is the wrong thing to economise on, and the
   * price was one line in each of six fixtures. `qa-w2-locked-surface-reach.adversarial.test.ts`
   * keeps a source-text assertion over the call site as well — the strongest guard this runtime
   * allows — and `tests/e2e/read-only-global-settings.e2e.spec.ts` is what a browser asserts.
   */
  readonly editability: Editability;
  /** The sentence a refused press left, or nothing. Absent — never empty — on the ordinary path:
   *  the sheet says nothing about an apply that has not happened. */
  readonly refusalNote?: string;
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
  /**
   * Separate again, and for `onChooseDepth`'s reason: a colour is neither a tier id nor a
   * millimetre. What moves is the sheet's **pending** colour and never a cabinet's — the same
   * callback shape §9's panel hands the shared control, pointed at a different writer (ADR 0099
   * decision 2).
   *
   * **Optional, and its absence hides the colour group rather than greying it.** A control with
   * nowhere to send a press is one this surface cannot satisfy (§9), so it is not offered — the
   * opposite of `editability`, which was optional for a wave and defaulted to *permitted*. The
   * production wiring is held by a source-text assertion in
   * `tests/settings/global-colour-group.test.ts`, which is the strongest guard this runtime allows:
   * nothing in a `node` runtime can open the sheet, so no rendering test exercises it.
   */
  readonly onChooseFinish?: (finish: Finish) => void;
  /**
   * D10's share control, rendered as the choosing step's last section — a slot rather than a
   * hard-wired `<ShareDesign />`, for the same reason `editability` is threaded through rather than
   * read from the store in here: this surface takes already-resolved data and renders it, so a
   * fixture that builds a `GlobalSettingsView` by hand can render the whole dialog with no store and
   * no i18n provider in scope. `global-settings.tsx`'s own connected component is the only caller
   * that ever passes one; absent, the choosing step's body simply ends one section sooner, which is
   * every existing surface-level test's own case.
   */
  readonly shareControl?: ReactNode;
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
      {/* **§13.1's reason, on the dialog rather than inside a step** (M6-AUD-001, found by
          adversarial QA). It stated it once at the head of the choosing step's body — and the
          confirm step replaces that body wholesale, so the explanation disappeared at the exact
          moment the customer was being asked to commit. It is a fact about this browser, not about
          which question is on screen, so it belongs to the sheet. Once for the sheet rather than
          under each of a dozen radios: a sentence repeated down every row is the sheet arguing with
          itself. */}
      {editability.isReadOnly ? (
        <p
          className={styles.locked}
          data-testid="global-settings-read-only-reason"
        >
          {editability.disabledReason}
        </p>
      ) : null}
      {confirming === undefined ? (
        <ChoosingStep
          view={view}
          namePrefix={id}
          editability={editability}
          {...(refusalNote === undefined ? {} : { refusalNote })}
          {...(onChooseFinish === undefined ? {} : { onChooseFinish })}
          {...(shareControl === undefined ? {} : { shareControl })}
          onChoose={onChoose}
          onChooseDepth={onChooseDepth}
          onCancel={onCancel}
          onApply={onApply}
        />
      ) : (
        <ConfirmStep step={confirming} editability={editability} />
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

/** The step the sheet opens on: the three groups, the warning, the figure and the apply. */
function ChoosingStep({
  view,
  namePrefix,
  editability,
  refusalNote,
  onChoose,
  onChooseDepth,
  onChooseFinish,
  shareControl,
  onCancel,
  onApply,
}: {
  readonly view: GlobalSettingsView;
  readonly namePrefix: string;
  readonly editability: Editability;
  readonly refusalNote?: string;
  readonly onChoose: (key: WholeKitchenGroupKey, tierId: string) => void;
  readonly onChooseDepth: (cabinetDepthMm: number) => void;
  readonly onChooseFinish?: (finish: Finish) => void;
  readonly shareControl?: ReactNode;
  readonly onCancel: () => void;
  readonly onApply: () => void;
}) {
  const colourGroup = view.colourGroup;
  return (
    <>
      <div className={styles.body}>
        {view.groups.map((group) => (
          <Fragment key={group.key}>
            <TierGroupSection
              group={group}
              editability={editability}
              onChoose={onChoose}
              namePrefix={namePrefix}
            />
            {/* **Immediately after the material radios and immediately before the colour block** —
                the owner's ruling of 2026-09-09: *"should be after [the material group] just before
                Color switch block"*. It stood at the foot of the body, under the depth, where a
                sentence about what changing the material costs was four sections away from the
                control it is about.
                
                Anchored to the material group rather than placed by position, for the reason the
                colour group below it is: reordering the tier groups carries the sentence with the
                material it explains, where an independent list would silently come apart. It is
                **not** conditional on the colour group — that one is absent for a material with no
                palette, and the sentence is about the material either way. */}
            {group.key === "material" ? (
              <p
                className={styles.warning}
                data-testid="global-settings-warning"
              >
                <span className={styles.warningMark} aria-hidden="true">
                  {NOTE_GLYPH}
                </span>
                {view.warning}
              </p>
            ) : null}
            {/* **After the material group and before hardware** — the owner's *"just behind the
                material"*, ADR 0099 decision 9. Rendered from inside the map rather than as a
                sibling after it, so the position is a property of the group it follows: reordering
                the tier groups carries this with the material, where two independent lists would
                silently come apart. */}
            {group.key === "material" &&
            colourGroup !== undefined &&
            onChooseFinish !== undefined ? (
              <ColourGroupSection
                group={colourGroup}
                editability={editability}
                onChoose={onChooseFinish}
              />
            ) : null}
          </Fragment>
        ))}
        <DepthGroupSection
          group={view.depthGroup}
          editability={editability}
          onChoose={onChooseDepth}
          namePrefix={namePrefix}
        />
        {/* D10: the surface's last section, mobile and desktop alike. The element itself is built by
            `global-settings.tsx`'s connected component and handed down as `shareControl` — see that
            prop's own comment for why this file never imports `<ShareDesign>` directly. */}
        {shareControl}
      </div>
      {/* ADR 0065 decision 6: the flag travels with the total, and this surface shows one. */}
      {view.overflowWarning === undefined ? null : (
        <p className={styles.overflow} data-testid="global-settings-overflow">
          {view.overflowWarning}
        </p>
      )}
      {/* **A refused press, beside the button that made it** (M6-AUD-004). Outside `.body` so it
          cannot be scrolled away from the action it is about, and above the footer for the reason
          the overflow warning is: this is what the customer has to read before pressing again. */}
      {refusalNote === undefined ? null : (
        <p className={styles.refusal} data-testid="global-settings-refusal">
          {refusalNote}
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
          {/* **Locked with the reason, never merely ignored** (§13.1, M6-AUD-001). *Renunță* beside
              it keeps its own state whatever this one is: a customer who cannot commit must still
              be able to leave. */}
          <button
            type="button"
            className={styles.apply}
            data-testid="global-settings-apply"
            disabled={editability.isReadOnly}
            {...(editability.isReadOnly
              ? { title: editability.disabledReason }
              : {})}
            onClick={onApply}
          >
            {view.applyLabel}
          </button>
        </div>
      </div>
    </>
  );
}

/**
 * **The colour group, and the control inside it is §9's own** — ADR 0099 decision 9, and the owner's
 * *"same as we have on clicking on the cabinet ... in the same way"*.
 *
 * `describeFinishSection` is the panel's projection, called here with the **pending** material's
 * declaration and the pending colour, and `FinishSectionView` is the panel's markup. Nothing about a
 * decor list, two wood swatches or a RAL picker is authored twice — which is the whole point, and
 * the drift a second colour picker in this file would be.
 *
 * **The editability the model does not hold is applied here**, exactly as it is for the tier and
 * depth groups: the projection decides what is offered, this decides whether it may be pressed. It
 * reaches the chips through the same `describeChipAvailability` §9's do, so a locked sheet greys its
 * swatches with the same sentence as everything else on it.
 *
 * `null` when the pending material declares no control (ADR 0078 decision 3) — not present and
 * empty, and not a greyed control either: there is nothing to grey.
 */
function ColourGroupSection({
  group,
  editability,
  onChoose,
}: {
  readonly group: ColourGroupView;
  readonly editability: Editability;
  readonly onChoose: (finish: Finish) => void;
}) {
  const content = useContent();
  const section = describeFinishSection(
    lookUpMaterial(group.materialTierId),
    group.selected,
    editability,
    content,
  );
  if (section === undefined) return null;
  return (
    <section
      className={styles.group}
      data-testid="global-settings-colour-group"
      data-material={group.materialTierId}
    >
      <h3 className={styles.heading}>{group.heading}</h3>
      <FinishSectionView section={section} onPick={onChoose} />
      {/* Why there is no amount beside a colour (ADR 0071 decision 1), and what a global colour
          leaves alone — the owner's own priority, said rather than discovered by trying it. */}
      <p
        className={styles.groupAnchor}
        data-testid="global-settings-colour-note"
      >
        {group.note}
      </p>
      <p
        className={styles.warning}
        data-testid="global-settings-colour-warning"
      >
        <span className={styles.warningMark} aria-hidden="true">
          {NOTE_GLYPH}
        </span>
        {group.warning}
      </p>
    </section>
  );
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
  editability,
  onChoose,
}: {
  readonly group: DepthGroupView;
  readonly namePrefix: string;
  readonly editability: Editability;
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
          {...(editability.isReadOnly ? { "data-disabled": "true" } : {})}
          data-testid="global-settings-depth-option"
        >
          <input
            type="radio"
            className={styles.radio}
            name={`${namePrefix}-cabinet-depth`}
            value={option.cabinetDepthMm}
            checked={option.isSelected}
            disabled={editability.isReadOnly}
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
      <p
        className={styles.groupAnchor}
        data-testid="global-settings-depth-note"
      >
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
  editability,
  onChoose,
}: {
  readonly group: TierGroupView;
  readonly namePrefix: string;
  readonly editability: Editability;
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
        <p className={styles.groupAnchor} data-testid="global-settings-anchor">
          {group.anchor}
        </p>
      )}
      {group.options.map((option) => (
        <label
          key={option.tierId}
          className={styles.option}
          data-selected={option.isSelected}
          {...(editability.isReadOnly ? { "data-disabled": "true" } : {})}
          data-testid="global-settings-option"
        >
          <input
            type="radio"
            className={styles.radio}
            name={`${namePrefix}-${group.key}`}
            value={option.tierId}
            checked={option.isSelected}
            disabled={editability.isReadOnly}
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
