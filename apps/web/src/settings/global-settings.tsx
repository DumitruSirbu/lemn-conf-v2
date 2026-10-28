"use client";

// The whole-kitchen settings: a sheet on mobile, a popover on desktop, one set of markup with the
// shell decided in `global-settings.module.css`. It renders a value and decides nothing.
//
// Modal on both viewports (scrim, `aria-modal`, focus trap, rest of the screen inert), unlike
// `price-breakdown.tsx`: this surface holds uncommitted state, and an operable background would
// change the design under a pending choice.
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

import {
  trapTab,
  useBackgroundInert,
  useEscapeToDismiss,
} from "@/components/use-modal-focus";
import { FinishSectionView } from "@/panel/editor-panel";
import { describeFinishSection } from "@/panel/panel-model";
import {
  NO_PRICE_BOOK_DETAIL,
  UnreadablePriceBookError,
} from "@/price/price-book-root";
import {
  useDeepCabinetPercent,
  usePricedDesign,
  useWholeKitchenTierOffer,
} from "@/price/use-priced-design";
import { ShareDesign } from "@/share/share-design";
import { useConfiguratorStore } from "@/store/configurator-store";
import { describeEditability, type Editability } from "@/store/editability";
import { useContent } from "@/i18n/use-content";

import { ConfirmStep } from "./confirmation-dialog";
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

/** Decorative caret, hidden from the accessibility tree: `aria-expanded` states the surface's state. */
const DISCLOSURE_GLYPH = "⌃";

const CLOSED_GLYPH = "▾";

const NOTE_GLYPH = "i";

interface GlobalSettingsProps {
  /** How many settings the pill names, decided by `configure/use-top-bar-fit.ts` and not here
   *  (ADR 0104 decision 3). */
  readonly visibleCount: number;
}

export function GlobalSettings({ visibleCount }: GlobalSettingsProps) {
  const content = useContent();
  const pricing = usePricedDesign();
  const offer = useWholeKitchenTierOffer();
  const deepCabinetPercent = requirePublished(useDeepCabinetPercent());
  const design = useConfiguratorStore((state) => state.design);
  const catalog = useConfiguratorStore((state) => state.catalog);
  const applyWholeKitchenSettings = useConfiguratorStore(
    (state) => state.applyWholeKitchenSettings,
  );
  const canWrite = useConfiguratorStore((state) => state.canWrite);
  const saveStatus = useConfiguratorStore((state) => state.saveStatus);

  const groups = useMemo(
    () => projectDesignForDisplay(design, catalog),
    [design, catalog],
  );

  // On `design` alone: it counts what is stored, so it must not move when the customer taps a radio.
  const chosenColourCount = useMemo(
    () => countCabinetsWearingAChosenFinish(design),
    [design],
  );

  const applied: WholeKitchenChoice = design.settings ?? {};
  const [isOpen, setIsOpen] = useState(false);
  // Whether a confirmation is owed is `view.materialResetConfirm`'s presence; this records only that
  // the customer has been asked and has not answered.
  const [isConfirming, setIsConfirming] = useState(false);
  // Chosen and not yet applied; re-seeded on every open through `resolveOpeningChoice`, so a tier the
  // book has withdrawn opens as the fallback the sheet displays.
  const [pending, setPending] = useState<WholeKitchenChoice>({});
  /** The last press this sheet refused. Not read from the store: `lastRejection` cannot be told apart
   *  from a refusal already on screen when the sheet opened. */
  const [refusal, setRefusal] = useState<ApplyRefusal | undefined>(undefined);

  const editability = describeEditability(
    { canWrite, saveStatus },
    content.panel,
  );

  const anchorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const surfaceId = useId();

  // The count above cannot answer this: a kitchen whose cabinets all follow one global colour counts
  // zero chosen colours and still loses that colour (ADR 0099 decision 7).
  const globalFinishWouldBeLost =
    pending.materialTierId !== undefined &&
    wouldDiscardTheGlobalFinish(design, pending.materialTierId);

  const view = describeGlobalSettings({
    content,
    pricing,
    offer,
    deepCabinetPercent,
    groups,
    applied,
    pending,
    chosenColourCount,
    globalFinishWouldBeLost,
  });
  const rung = describePillRung(view.pill, visibleCount);

  const close = useCallback(() => {
    setIsOpen(false);
    setIsConfirming(false);
    // Back to what opened it, on cancel and apply alike, so a keyboard customer carries on from there.
    triggerRef.current?.focus();
  }, []);

  /** Escape and the scrim dismiss one step: the confirm step goes back to choosing with the pending
   *  choices intact and nothing written, `lastRejection` included (ADR 0086 decision 5). */
  const dismiss = useCallback(() => {
    if (isConfirming) {
      setIsConfirming(false);
      return;
    }
    close();
  }, [isConfirming, close]);

  /**
   * Refocus the dialog on every step change, not only on open: the steps are different component
   * types at one position, so the focused button unmounts, focus falls to `<body>` and the dialog's
   * `onKeyDown` trap stops firing. Shift+Tab would then reach `global-settings-trigger`, which
   * `useBackgroundInert` leaves live, and Enter re-opens the sheet and discards the pending choice.
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

  /** With a confirmation owed the whole press is withheld, not only the material half (ADR 0081
   *  decision 2). Not the only door into the commit: `applyPending` carries its own read-only guard. */
  function requestApply(): void {
    if (editability.isReadOnly) return;
    if (view.materialResetConfirm === undefined) {
      applyPending();
      return;
    }
    setIsConfirming(true);
  }

  /**
   * Writes only what the customer changed, so an untouched *Aplică* leaves the document as it was.
   * One press is one commit: `applyWholeKitchenSettings` preflights all settings and commits once or
   * not at all, and on a refusal the sheet stays open, naming the setting that refused.
   *
   * The read-only guard lives here as well as on `requestApply`: the confirm step's *Schimbă
   * materialul* calls this directly, and a save can come back `unauthorized` while its question is up.
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
      // Absent stays absent: an untouched colour must leave a document with no global colour as found.
      ...(pending.finish === undefined ? {} : { finish: pending.finish }),
      availableMaterialTierIds: offer.material.tierIds,
      availableHardwareTierIds: offer.hardware.tierIds,
    });
    if (!outcome.committed) {
      setRefusal({
        setting: outcome.setting,
        // A depth rebuild never refuses with a `sides`-carrying code (`content.ts`'s `SIDE_CARRIERS`),
        // so the direction cannot change the sentence; it is passed so a future code need not depend on that.
        message: content.rejection(
          outcome.reason,
          cornerDirectionOf(design.room),
        ),
      });
      // The confirm step reaches here too; leaving it up would hide the refusal behind the question.
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
      {/* The pill is the trigger (ADR 0104 decision 2). Its accessible name states every setting, even
          those `+N` hides. The locked reason is the button's own description: a sentence added to
          this row pushes the trigger off a 390 px screen. */}
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
        {/* The swatch colour is the adapter's value for the applied finish, published as a custom
            property so the pill, §9's chips and the 3D paint from one colour. */}
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
            {/* Only the first label may ellipsise; at every other rung a label that does not fit is
                counted, not cut. */}
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
        {/* The caret flips when open; whether it shows at all is `global-settings.module.css`'s call. */}
        <span className={styles.caret} aria-hidden="true">
          {isOpen ? DISCLOSURE_GLYPH : CLOSED_GLYPH}
        </span>
      </button>
      {isOpen ? (
        <>
          {/* Drawn on both shells; a click dismisses like Escape and writes nothing. */}
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

/** The sheet itself, given a view: no store, no pricing, no open state. */
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
  /** Whether this browser may write, decided by `store/editability.ts`. Required: an optional prop
   *  defaulted to writable, and dropping it from the production call site went unnoticed. */
  readonly editability: Editability;
  /** The sentence a refused press left; absent, never empty, when nothing was refused. */
  readonly refusalNote?: string;
  /** The confirm step's view and handlers, or nothing; its presence is which step this is. */
  readonly confirming?: MaterialResetConfirmStep;
  readonly onChoose: (key: WholeKitchenGroupKey, tierId: string) => void;
  /** Separate from `onChoose`: a depth is not a tier id and carries no group key. */
  readonly onChooseDepth: (cabinetDepthMm: number) => void;
  /** Moves the sheet's pending colour, never a cabinet's (ADR 0099 decision 2). Its absence hides
   *  the colour group rather than greying it, since the surface could not satisfy a press. */
  readonly onChooseFinish?: (finish: Finish) => void;
  /** A slot for the share control, so a fixture can render the dialog with no store or i18n
   *  provider; absent, the choosing step ends one section sooner. */
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
      {/* The head follows the step (ADR 0086 decision 6): `appliesTo` goes on the confirm step, whose
          sentence counts a different set of cabinets. */}
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
      {/* §13.1's reason belongs to the dialog, not a step: the confirm step replaces the choosing
          step's body, and the reason must stay on screen while the customer is asked to commit. */}
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
            {/* Anchored to the material group, not to a position, so reordering the groups carries it.
                Not conditional on the colour group, which is absent for a material with no palette. */}
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
            {/* After the material group (ADR 0099 decision 9), rendered inside the map so reordering
                the tier groups carries it. */}
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
        {/* The surface's last section, built by the connected component and passed as `shareControl`. */}
        {shareControl}
      </div>
      {/* ADR 0065 decision 6: the overflow flag travels with the total. */}
      {view.overflowWarning === undefined ? null : (
        <p className={styles.overflow} data-testid="global-settings-overflow">
          {view.overflowWarning}
        </p>
      )}
      {/* Outside `.body` so it cannot scroll away from the button that was refused. */}
      {refusalNote === undefined ? null : (
        <p className={styles.refusal} data-testid="global-settings-refusal">
          {refusalNote}
        </p>
      )}
      <div className={styles.footer}>
        {/* Absent, never zero, when the design cannot be priced (e.g. a withdrawn tier). */}
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
          {/* *Renunță* stays enabled when this is locked: a customer who cannot commit can still leave. */}
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
 * The colour group reuses §9's panel projection and markup (ADR 0099 decision 9), called with the
 * pending material and colour; nothing about the pickers is authored twice. Editability is applied
 * here, not in the model. `null` when the pending material declares no control (ADR 0078 decision 3).
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
      {/* Why there is no amount beside a colour (ADR 0071 decision 1). */}
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

/** The depth group: the tier groups' native radios, with a note and a warning instead of an anchor
 *  and a delta. `view.depthGroup.shape` is read, never derived here: the shape rule lives in the
 *  model (ADR 0056). Both shapes render the same radios; the toggle's layout is CSS. */
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
      {/* What choosing the deep depth adds, worded from the published rule. */}
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
    // `role="radiogroup"` over `<fieldset>`: a `<legend>` does not take part in flex layout.
    <section
      role="radiogroup"
      aria-labelledby={headingId}
      className={styles.group}
      data-testid="global-settings-group"
    >
      <h3 id={headingId} className={styles.heading}>
        {group.heading}
      </h3>
      {/* What this group's amounts are measured against; only rendered when there are amounts. */}
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

/** The sheet cannot open without a book (the tier offer refuses first), so a missing percentage is raised, not answered
 *  with a 0 % that would say the depth is free. */
function requirePublished(deepCabinetPercent: number | undefined): number {
  if (deepCabinetPercent === undefined)
    throw new UnreadablePriceBookError(NO_PRICE_BOOK_DETAIL);
  return deepCabinetPercent;
}
