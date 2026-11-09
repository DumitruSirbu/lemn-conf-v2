"use client";

import {
  isSameItem,
  type ReplacementRequired,
} from "@lemnaria/configurator-domain";
import { useTranslations } from "next-intl";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type RefObject,
} from "react";

import { trapTab, useModalFocus } from "@/components/use-modal-focus";
import type { Content } from "@/i18n/content";
import { useContent } from "@/i18n/use-content";
import { Link } from "@/i18n/navigation";
import { describeEditability } from "@/store/editability";
import {
  useConfiguratorStore,
  type ConfiguratorState,
} from "@/store/configurator-store";

import {
  appearanceReplacementOf,
  colourRevertedBy,
  describeApplyRefusal,
  describeConfirmationLines,
  describeReplacementSheet,
  describeRowChooser,
  optionIdOf,
  rememberRows,
  replacedItemKey,
  resolveReplacementSheetCopy,
  type AppearanceOptionView,
  type ChosenNames,
  type ReplacementRowView,
  type ReplacementSheetView,
  type SheetChooser,
  type SheetChooserOption,
  type SheetVocabulary,
} from "./replacement-sheet-model";
import styles from "./replacement-sheet.module.css";
import type {
  AwaitedReplacement,
  PriceNotice,
  ReplacementChange,
} from "./use-price-notice";
import { useWholeKitchenTierOffer } from "./use-priced-design";
import {
  isTierOffered,
  type WholeKitchenTierOffer,
} from "./whole-kitchen-tiers";
import type { WholeKitchenSettingsRequest } from "@/store/whole-kitchen-apply";

// The forced-replacement sheet (frames C4A-C4D). Which rows it holds, and every sentence, are `replacement-sheet-model.ts`'s;
// the one `GET` and the wait for the save are `use-price-notice.ts`'s. This file holds the sheet's own state (which row is
// being chosen, what has been applied) and draws it.
//
// A modal that can be left only by ‹. The sheet makes the rest of the screen inert (`useModalFocus`), and the top bar's own
// ‹ is part of that screen. So ‹ is drawn in the sheet's head too, as the same link asking the same question
// (`BackConfirmation`). Escape and the scrim do nothing.

const NOTHING_TO_DISMISS = (): void => undefined;
const NO_ROWS: readonly ReplacementRequired[] = [];

type Step =
  | { readonly kind: "list" }
  | {
      readonly kind: "choose";
      readonly row: ReplacementRequired;
      readonly pickedOptionId: string | undefined;
      readonly refusal: string | undefined;
    };

const LIST_STEP: Step = { kind: "list" };

/** The back link's question, passed in by the screen that owns it. */
export interface LeaveKitchen {
  readonly href: string;
  readonly onClick: (event: MouseEvent<HTMLAnchorElement>) => void;
}

export interface ReplacementSheetState {
  /** A choice is owed. The bar says so, the review control is off, and the sheet is open. */
  readonly isPending: boolean;
  readonly priceLine: string;
  readonly view: ReplacementSheetView;
  readonly chooser: SheetChooser | undefined;
  readonly pickedOptionId: string | undefined;
  readonly refusal: string | undefined;
  readonly isReadOnly: boolean;
  readonly disabledReason: string;
  readonly choose: (row: ReplacementRowView) => void;
  readonly pick: (optionId: string) => void;
  readonly stepBack: () => void;
  readonly apply: () => void;
  readonly confirmationLines: readonly string[];
  readonly dismissConfirmation: () => void;
}

/**
 * Everything the sheet and its neighbours need, in one place so the screen can read `isPending` for the bar and the
 * review control and pass the rest to the sheet. Open exactly where the notice hook's `GET` runs (`owedReplacements` is
 * empty elsewhere): the share view, a page whose write access is not settled to `true`, and a page with no book get no
 * sheet and no flash.
 */
export function useReplacementSheet(
  priceNotice: PriceNotice,
): ReplacementSheetState {
  const content = useContent();
  const copy = useReplacementSheetCopy();
  const offer = useWholeKitchenTierOffer();
  const design = useConfiguratorStore((state) => state.design);
  const catalog = useConfiguratorStore((state) => state.catalog);
  const canWrite = useConfiguratorStore((state) => state.canWrite);
  const saveStatus = useConfiguratorStore((state) => state.saveStatus);
  const applyWholeKitchenSettings = useConfiguratorStore(
    (state) => state.applyWholeKitchenSettings,
  );
  const session = useReplacementSession(priceNotice);
  const { live, shown, step, setStep } = session;

  const vocabulary: SheetVocabulary = { content, copy, offer };
  const chooser =
    step.kind === "choose"
      ? describeRowChooser({ row: step.row, design, catalog, vocabulary })
      : undefined;
  const editability = describeEditability(
    { canWrite, saveStatus },
    content.panel,
  );

  function apply(): void {
    if (step.kind !== "choose" || chooser === undefined) return;
    if (step.pickedOptionId === undefined || editability.isReadOnly) return;
    if (!isTierOffered(offer)) return;
    const outcome = commitChoice({
      row: step.row,
      chooser,
      optionId: step.pickedOptionId,
      offer,
      applyWholeKitchenSettings,
      content,
    });
    if (outcome.committed) {
      session.recordChoice(outcome.change, outcome.revertedColour);
    } else {
      setStep({ ...step, refusal: outcome.refusal });
    }
  }

  return {
    isPending: live.length > 0,
    priceLine: copy.priceAfterChoosing,
    view: describeReplacementSheet({
      seen: shown,
      live,
      design,
      accessoryNames: priceNotice.removedAccessoryNames,
      vocabulary,
      chosenNames: session.chosenNames,
    }),
    chooser,
    pickedOptionId: step.kind === "choose" ? step.pickedOptionId : undefined,
    refusal: step.kind === "choose" ? step.refusal : undefined,
    isReadOnly: editability.isReadOnly,
    disabledReason: editability.disabledReason,
    choose: (row) => {
      if (!row.isChoosable) return;
      const target = rowToChooseFrom(row, live, shown);
      if (target !== undefined) {
        setStep({
          kind: "choose",
          row: target,
          pickedOptionId: undefined,
          refusal: undefined,
        });
      }
    },
    pick: (optionId) => {
      setStep((current) =>
        current.kind === "choose"
          ? { ...current, pickedOptionId: optionId, refusal: undefined }
          : current,
      );
    },
    stepBack: () => {
      setStep(LIST_STEP);
    },
    apply,
    confirmationLines:
      priceNotice.confirmation === undefined
        ? []
        : describeConfirmationLines({ ...priceNotice.confirmation, copy }),
    dismissConfirmation: priceNotice.dismissConfirmation,
  };
}

/** The row as the domain lists it now where it is still owed, because its options can have moved since it was first shown
 *  (a colour owed under a material the sheet has just replaced); a resolved row is chosen again from what was shown. */
function rowToChooseFrom(
  row: ReplacementRowView,
  live: readonly ReplacementRequired[],
  shown: readonly ReplacementRequired[],
): ReplacementRequired | undefined {
  const matches = (candidate: ReplacementRequired): boolean =>
    isSameItem(candidate.item, row.item);
  return live.find(matches) ?? shown.find(matches);
}

function useReplacementSheetCopy() {
  const translate = useTranslations();
  return useMemo(() => resolveReplacementSheetCopy(translate), [translate]);
}

interface ReplacementSession {
  /** What is still owed. */
  readonly live: readonly ReplacementRequired[];
  /** Every row shown since the sheet opened, so a resolved row stays drawn. */
  readonly shown: readonly ReplacementRequired[];
  readonly step: Step;
  readonly setStep: (step: Step | ((current: Step) => Step)) => void;
  /** What the customer's own choices were called, by item, for the rows they resolved. */
  readonly chosenNames: ChosenNames;
  /** The customer's choice was applied: back to the list, and its save is waited for once nothing more is owed. A material
   *  change that reset a stored colour brings the colour it returned to. */
  readonly recordChoice: (
    change: ReplacementChange,
    revertedColour: string | undefined,
  ) => void;
}

/**
 * The sheet's state across choices: the rows seen, the step, and the changes made. When nothing is owed any more, by the
 * last choice or by availability coming back before any, the state is cleared; after a choice the notice hook is told to
 * wait for its save.
 */
function useReplacementSession(priceNotice: PriceNotice): ReplacementSession {
  const live = priceNotice.owedReplacements;
  const { awaitReplacementSave } = priceNotice;
  const [seen, setSeen] = useState<readonly ReplacementRequired[]>(NO_ROWS);
  const [step, setStep] = useState<Step>(LIST_STEP);
  const [choice, setChoice] = useState<AwaitedReplacement | undefined>();
  const shown = rememberRows(seen, live);
  const chosenNames = useMemo(() => namesOf(choice?.changes ?? []), [choice]);

  useEffect(() => {
    if (live.length > 0) {
      setSeen(shown);
      return;
    }
    if (choice !== undefined) awaitReplacementSave(choice);
    setChoice(undefined);
    setSeen(NO_ROWS);
    setStep(LIST_STEP);
  }, [live.length, shown, choice, awaitReplacementSave]);

  return {
    live,
    shown,
    step,
    setStep,
    chosenNames,
    recordChoice: (change, revertedColour) => {
      const revisionAtChoice = useConfiguratorStore.getState().revision;
      setChoice((earlier) => ({
        revisionAtChoice,
        changes: withChange(earlier?.changes ?? [], change),
        revertedColour: revertedColour ?? earlier?.revertedColour,
      }));
      setStep(LIST_STEP);
    },
  };
}

function namesOf(changes: readonly ReplacementChange[]): ChosenNames {
  return new Map(changes.map(({ itemKey, name }) => [itemKey, name]));
}

type AppliedChoice =
  | {
      readonly committed: true;
      readonly change: ReplacementChange;
      readonly revertedColour: string | undefined;
    }
  | { readonly committed: false; readonly refusal: string };

/** Applies one picked option through the store's one-commit path, naming it for the confirmation. A material change is
 *  checked for the colour it reset, which only the designs before and after can say. */
function commitChoice({
  row,
  chooser,
  optionId,
  offer,
  applyWholeKitchenSettings,
  content,
}: {
  readonly row: ReplacementRequired;
  readonly chooser: SheetChooser;
  readonly optionId: string;
  readonly offer: WholeKitchenTierOffer;
  readonly applyWholeKitchenSettings: ConfiguratorState["applyWholeKitchenSettings"];
  readonly content: Content;
}): AppliedChoice {
  const option = chooser.options.find(
    (candidate) => optionIdOf(candidate) === optionId && !candidate.isStruck,
  );
  if (option === undefined) {
    throw new Error("The picked option is not one the chooser offers");
  }
  const request = requestOf(row, option, offer);
  const { kind } = chooser;
  const before = useConfiguratorStore.getState().design;
  const outcome = applyWholeKitchenSettings(request);
  if (!outcome.committed) {
    return {
      committed: false,
      refusal: describeApplyRefusal({
        kind,
        reason: outcome.reason,
        design: before,
        content,
      }),
    };
  }
  return {
    committed: true,
    change: { itemKey: replacedItemKey(row.item), kind, name: option.name },
    revertedColour:
      kind === "material"
        ? colourRevertedBy({
            before,
            after: useConfiguratorStore.getState().design,
            content,
          })
        : undefined,
  };
}

/** One press asks for one thing: a tier of its group, or a replacement of the colour or handle. The offered tier lists
 *  travel with it, as every press carries them. */
function requestOf(
  row: ReplacementRequired,
  option: SheetChooserOption,
  offer: WholeKitchenTierOffer,
): WholeKitchenSettingsRequest {
  const offered = {
    availableMaterialTierIds: offer.material.tierIds,
    availableHardwareTierIds: offer.hardware.tierIds,
  };
  if ("tierId" in option) {
    return row.item.kind === "material"
      ? { materialTierId: option.tierId, ...offered }
      : { hardwareTierId: option.tierId, ...offered };
  }
  return { replacement: replacementOf(row, option), ...offered };
}

function replacementOf(
  row: ReplacementRequired,
  option: AppearanceOptionView,
): NonNullable<WholeKitchenSettingsRequest["replacement"]> {
  const replacement = appearanceReplacementOf(row, option);
  if (replacement === undefined) {
    throw new Error(
      "The picked colour or handle replaces nothing the row names",
    );
  }
  return replacement;
}

/** The latest choice for each item: choosing a row again replaces what was said about it, and a second row of the same
 *  kind (a colour for the kitchen and another for a cabinet) is a line of its own. */
function withChange(
  earlier: readonly ReplacementChange[],
  change: ReplacementChange,
): readonly ReplacementChange[] {
  return [
    ...earlier.filter(({ itemKey }) => itemKey !== change.itemKey),
    change,
  ];
}

/** The modal. Mounted only while a choice is owed, so its modal behaviour lives exactly as long as the sheet. */
export function ReplacementSheet({
  sheet,
  leave,
  returnFocusRef,
}: {
  readonly sheet: ReplacementSheetState;
  readonly leave: LeaveKitchen;
  /** Where focus goes when the sheet closes and nothing that had it on open can take it back. */
  readonly returnFocusRef: RefObject<HTMLElement | null>;
}) {
  if (!sheet.isPending) return null;
  return (
    <OpenReplacementSheet
      sheet={sheet}
      leave={leave}
      returnFocusRef={returnFocusRef}
    />
  );
}

function OpenReplacementSheet({
  sheet,
  leave,
  returnFocusRef,
}: {
  readonly sheet: ReplacementSheetState;
  readonly leave: LeaveKitchen;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
}) {
  const content = useContent();
  const hostRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const firstChooseRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useModalFocus({
    hostRef,
    initialFocusRef: firstChooseRef,
    focusFallbackRef: surfaceRef,
    dismiss: NOTHING_TO_DISMISS,
    returnFocus: { fallbackRef: returnFocusRef },
  });

  return (
    <div className={styles.host} ref={hostRef}>
      <div className={styles.scrim} aria-hidden="true" />
      <div
        ref={surfaceRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        className={styles.surface}
        data-testid="replacement-sheet"
        onKeyDown={trapTab}
      >
        <span className={styles.grabber} aria-hidden="true" />
        <div className={styles.head}>
          <Link
            className={styles.leave}
            href={leave.href}
            aria-label={content.configure.back}
            data-testid="replacement-sheet-leave"
            onClick={leave.onClick}
          >
            <span aria-hidden="true">‹</span>
          </Link>
          <h2 id={titleId} className={styles.title}>
            {sheet.chooser?.heading ?? sheet.view.title}
          </h2>
        </div>
        {sheet.chooser === undefined ? (
          <ListStep
            sheet={sheet}
            bodyId={bodyId}
            firstChooseRef={firstChooseRef}
          />
        ) : (
          <ChooserStep sheet={sheet} chooser={sheet.chooser} bodyId={bodyId} />
        )}
      </div>
    </div>
  );
}

function ListStep({
  sheet,
  bodyId,
  firstChooseRef,
}: {
  readonly sheet: ReplacementSheetState;
  readonly bodyId: string;
  readonly firstChooseRef: RefObject<HTMLButtonElement | null>;
}) {
  const { view } = sheet;
  useEffect(() => {
    firstChooseRef.current?.focus();
  }, [firstChooseRef]);
  const firstOpenKey = view.rows.find(
    (row) => !row.isResolved && row.isChoosable,
  )?.key;
  return (
    <>
      <div className={styles.body}>
        <p id={bodyId} className={styles.lead} data-testid="replacement-body">
          {view.body}
        </p>
        <ul className={styles.rows}>
          {view.rows.map((row) => (
            <ReplacementRow
              key={row.key}
              row={row}
              buttonLabel={row.isResolved ? view.changeLabel : view.chooseLabel}
              onChoose={sheet.choose}
              {...(row.key === firstOpenKey
                ? { buttonRef: firstChooseRef }
                : {})}
            />
          ))}
          {view.infoLines.map((line) => (
            <li
              key={line}
              className={styles.info}
              data-testid="replacement-info"
            >
              <span className={styles.infoGlyph} aria-hidden="true" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <p className={styles.hint}>{view.exitHint}</p>
      </div>
    </>
  );
}

function ReplacementRow({
  row,
  buttonLabel,
  onChoose,
  buttonRef,
}: {
  readonly row: ReplacementRowView;
  readonly buttonLabel: string;
  readonly onChoose: (row: ReplacementRowView) => void;
  readonly buttonRef?: RefObject<HTMLButtonElement | null>;
}) {
  const kindId = useId();
  const buttonId = useId();
  return (
    <li
      className={styles.row}
      data-testid="replacement-row"
      data-resolved={row.isResolved}
    >
      <div
        className={styles.rowText}
        {...(row.isResolved
          ? {}
          : { role: "group", "aria-label": row.announcement })}
      >
        <span id={kindId} className={styles.rowKind}>
          {row.kindLabel}
        </span>
        {row.valueText === undefined ? null : (
          <span className={styles.rowValue} data-testid="replacement-row-value">
            {row.valueText}
          </span>
        )}
        {row.statusText === "" ? null : (
          <span className={styles.rowStatus}>{row.statusText}</span>
        )}
      </div>
      {row.isChoosable ? (
        <button
          type="button"
          ref={buttonRef}
          className={row.isResolved ? styles.secondary : styles.primary}
          data-testid="replacement-choose"
          id={buttonId}
          aria-labelledby={`${buttonId} ${kindId}`}
          onClick={() => {
            onChoose(row);
          }}
        >
          {buttonLabel}
        </button>
      ) : null}
    </li>
  );
}

function ChooserStep({
  sheet,
  chooser,
  bodyId,
}: {
  readonly sheet: ReplacementSheetState;
  readonly chooser: SheetChooser;
  readonly bodyId: string;
}) {
  const content = useContent();
  const firstOptionRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    firstOptionRef.current?.focus();
  }, []);
  const firstOptionId = firstChoosableOptionId(chooser);
  const isApplyOff = sheet.pickedOptionId === undefined || sheet.isReadOnly;
  return (
    <>
      <div className={styles.body}>
        <p id={bodyId} className={styles.lead}>
          {"appliesTo" in chooser ? chooser.appliesTo : chooser.hint}
        </p>
        <div
          role="group"
          aria-label={chooser.heading}
          className={styles.options}
        >
          {chooser.options.map((option) => (
            <ChooserOption
              key={`${optionIdOf(option)}:${String(option.isStruck)}`}
              option={option}
              struckNote={chooser.struckNote}
              isPicked={optionIdOf(option) === sheet.pickedOptionId}
              onPick={sheet.pick}
              {...(!option.isStruck && optionIdOf(option) === firstOptionId
                ? { buttonRef: firstOptionRef }
                : {})}
            />
          ))}
        </div>
        {"appliesTo" in chooser ? (
          <p className={styles.hint}>{chooser.hint}</p>
        ) : null}
        {sheet.refusal === undefined ? null : (
          <p className={styles.refusal} role="alert">
            {sheet.refusal}
          </p>
        )}
      </div>
      <div className={styles.footer}>
        <p className={styles.footerPrice}>{chooser.priceLine}</p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            data-testid="replacement-chooser-back"
            onClick={sheet.stepBack}
          >
            {content.globalSettings.cancel}
          </button>
          <button
            type="button"
            className={styles.primary}
            data-testid="replacement-apply"
            disabled={isApplyOff}
            {...(sheet.isReadOnly ? { title: sheet.disabledReason } : {})}
            onClick={sheet.apply}
          >
            {content.globalSettings.apply}
          </button>
        </div>
      </div>
    </>
  );
}

/** One option: nothing is picked on open, and a struck one is the kitchen's own switched-off item, shown and never taken. */
function ChooserOption({
  option,
  struckNote,
  isPicked,
  onPick,
  buttonRef,
}: {
  readonly option: SheetChooserOption;
  readonly struckNote: string;
  readonly isPicked: boolean;
  readonly onPick: (optionId: string) => void;
  readonly buttonRef?: RefObject<HTMLButtonElement | null>;
}) {
  const detail = option.isStruck
    ? struckNote
    : "description" in option
      ? option.description
      : undefined;
  return (
    <button
      type="button"
      ref={buttonRef}
      data-option=""
      className={styles.option}
      data-selected={isPicked && !option.isStruck}
      data-struck={option.isStruck}
      disabled={option.isStruck}
      aria-pressed={option.isStruck ? undefined : isPicked}
      onClick={() => {
        onPick(optionIdOf(option));
      }}
    >
      <span className={styles.optionName}>
        {"swatch" in option && option.swatch !== undefined ? (
          <span
            className={styles.optionSwatch}
            aria-hidden="true"
            data-wood={option.swatch.isWood}
            style={{ "--swatch-colour": option.swatch.colour } as CSSProperties}
          />
        ) : null}
        {option.name}
      </span>
      {detail === undefined ? null : (
        <span className={styles.optionDescription}>{detail}</span>
      )}
    </button>
  );
}

function firstChoosableOptionId(chooser: SheetChooser): string | undefined {
  const first = chooser.options.find((option) => !option.isStruck);
  return first === undefined ? undefined : optionIdOf(first);
}

/** Frame C4C: what changed, in the screen's own words, with the prices sentence merged in when the second `GET` said so.
 *  The region is mounted before its first line so the lines are announced. It goes by itself after a while. */
export function ReplacementConfirmation({
  lines,
  onElapsed,
}: {
  readonly lines: readonly string[];
  readonly onElapsed: () => void;
}) {
  const hasLines = lines.length > 0;
  useEffect(() => {
    if (!hasLines) return undefined;
    const timer = setTimeout(onElapsed, CONFIRMATION_VISIBLE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [hasLines, onElapsed]);

  return (
    <div
      role="status"
      className={styles.confirmationRegion}
      data-testid="replacement-confirmation-region"
    >
      {hasLines ? (
        <div
          className={styles.confirmation}
          data-testid="replacement-confirmation"
        >
          {lines.map((line) => (
            <span key={line} className={styles.confirmationLine}>
              {line}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Past the five-second floor for a message that goes on its own, as the account toast's is. */
const CONFIRMATION_VISIBLE_MS = 8_000;
