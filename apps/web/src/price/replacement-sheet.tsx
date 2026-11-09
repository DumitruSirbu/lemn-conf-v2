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
  type MouseEvent,
  type RefObject,
} from "react";

import { trapTab, useModalFocus } from "@/components/use-modal-focus";
import { useContent } from "@/i18n/use-content";
import { Link } from "@/i18n/navigation";
import { describeEditability } from "@/store/editability";
import { useConfiguratorStore } from "@/store/configurator-store";

import {
  describeApplyRefusal,
  describeChooser,
  describeConfirmationLines,
  describeReplacementSheet,
  isChoosableKind,
  rememberRows,
  resolveReplacementSheetCopy,
  type ChooserView,
  type ReplacementRowView,
  type ReplacementSheetView,
  type SheetVocabulary,
} from "./replacement-sheet-model";
import styles from "./replacement-sheet.module.css";
import type {
  PriceNotice,
  ReplacementChange,
  SettlingReplacement,
} from "./use-price-notice";
import { useWholeKitchenTierOffer } from "./use-priced-design";
import { isTierOffered } from "./whole-kitchen-tiers";

// The forced-replacement sheet (frames C4A-C4D). Which rows it holds, and every sentence, are `replacement-sheet-model.ts`'s;
// the one `GET` and the wait for the save are `use-price-notice.ts`'s. This file holds the sheet's own state (which row is
// being chosen, what has been applied) and draws it.
//
// **A modal that can be left only by ‹.** The sheet makes the rest of the screen inert (`useModalFocus`), and the top bar's
// own ‹ is part of that screen. So ‹ is drawn in the sheet's head too, as the same link asking the same question
// (`BackConfirmation`). Escape and the scrim do nothing.

const NOTHING_TO_DISMISS = (): void => undefined;
const NO_ROWS: readonly ReplacementRequired[] = [];

type Step =
  | { readonly kind: "list" }
  | {
      readonly kind: "choose";
      readonly row: ReplacementRequired;
      readonly pickedTierId: string | undefined;
      readonly refusal: string | undefined;
    };

const LIST_STEP: Step = { kind: "list" };

/** The back link's question, passed in by the screen that owns it. */
export interface LeaveKitchen {
  readonly href: string;
  readonly onClick: (event: MouseEvent<HTMLAnchorElement>) => void;
}

export interface ReplacementSheetState {
  /** A choice is owed. The bar says so, "Continuă" is off, and the sheet is open. */
  readonly isPending: boolean;
  readonly priceLine: string;
  readonly view: ReplacementSheetView;
  readonly chooser: ChooserView | undefined;
  readonly pickedTierId: string | undefined;
  readonly refusal: string | undefined;
  readonly isReadOnly: boolean;
  readonly disabledReason: string;
  readonly choose: (row: ReplacementRowView) => void;
  readonly pick: (tierId: string) => void;
  readonly stepBack: () => void;
  readonly apply: () => void;
  readonly confirmationLines: readonly string[];
  readonly dismissConfirmation: () => void;
}

/**
 * Everything the sheet and its neighbours need, in one place so the screen can read `isPending` for the bar and the
 * review control and pass the rest to the sheet. Open exactly where the notice hook's `GET` runs (`isReplacementAllowed`):
 * the share view, a page whose write access is not settled to `true`, and a page with no book get no sheet and no flash.
 */
export function useReplacementSheet(
  priceNotice: PriceNotice,
): ReplacementSheetState {
  const content = useContent();
  const translate = useTranslations();
  const copy = useMemo(
    () => resolveReplacementSheetCopy(translate),
    [translate],
  );
  const offer = useWholeKitchenTierOffer();
  const design = useConfiguratorStore((state) => state.design);
  const catalog = useConfiguratorStore((state) => state.catalog);
  const canWrite = useConfiguratorStore((state) => state.canWrite);
  const saveStatus = useConfiguratorStore((state) => state.saveStatus);
  const applyWholeKitchenSettings = useConfiguratorStore(
    (state) => state.applyWholeKitchenSettings,
  );

  const live = priceNotice.owedReplacements;
  const [seen, setSeen] = useState<readonly ReplacementRequired[]>(NO_ROWS);
  const [step, setStep] = useState<Step>(LIST_STEP);
  const [settling, setSettling] = useState<SettlingReplacement | undefined>();
  const shown = rememberRows(seen, live);

  useEffect(() => {
    if (live.length > 0) {
      setSeen(shown);
      return;
    }
    // Nothing is owed any more: the customer's last choice, or availability coming back before any choice was made.
    if (settling !== undefined) priceNotice.beginSettling(settling);
    setSettling(undefined);
    setSeen(NO_ROWS);
    setStep(LIST_STEP);
  }, [live.length, shown, settling, priceNotice.beginSettling]);

  const vocabulary: SheetVocabulary = { content, copy, offer };
  const view = describeReplacementSheet({
    seen: shown,
    live,
    design,
    accessoryNames: priceNotice.removedAccessoryNames,
    vocabulary,
  });
  const chooser =
    step.kind === "choose"
      ? describeChooser({ row: step.row, design, catalog, vocabulary })
      : undefined;
  const editability = describeEditability(
    { canWrite, saveStatus },
    content.panel,
  );

  function apply(): void {
    if (step.kind !== "choose" || chooser === undefined) return;
    if (step.pickedTierId === undefined || editability.isReadOnly) return;
    const outcome = applyPick({ row: step.row, tierId: step.pickedTierId });
    if (!outcome.committed) {
      setStep({ ...step, refusal: outcome.refusal });
      return;
    }
    setSettling({
      revisionAtChoice: useConfiguratorStore.getState().revision,
      changes: withChange(settling?.changes, outcome.change),
    });
    setStep(LIST_STEP);
  }

  function applyPick({
    row,
    tierId,
  }: {
    readonly row: ReplacementRequired;
    readonly tierId: string;
  }): AppliedPick {
    const kind = row.item.kind;
    if (!isTierOffered(offer) || (kind !== "material" && kind !== "hardware")) {
      return { committed: false, refusal: undefined };
    }
    const outcome = applyWholeKitchenSettings({
      ...(kind === "material"
        ? { materialTierId: tierId }
        : { hardwareTierId: tierId }),
      availableMaterialTierIds: offer.material.tierIds,
      availableHardwareTierIds: offer.hardware.tierIds,
    });
    if (!outcome.committed) {
      return {
        committed: false,
        refusal: describeApplyRefusal({
          kind,
          reason: outcome.reason,
          design,
          content,
        }),
      };
    }
    const name = chooser?.options.find((o) => o.tierId === tierId)?.name;
    return { committed: true, change: { kind, name: name ?? "" } };
  }

  return {
    isPending: live.length > 0,
    priceLine: copy.priceAfterChoosing,
    view,
    chooser,
    pickedTierId: step.kind === "choose" ? step.pickedTierId : undefined,
    refusal: step.kind === "choose" ? step.refusal : undefined,
    isReadOnly: editability.isReadOnly,
    disabledReason: editability.disabledReason,
    choose: (row) => {
      const target = shown.find((candidate) =>
        isSameItem(candidate.item, row.item),
      );
      if (target !== undefined && isChoosableKind(row.kind)) {
        setStep({
          kind: "choose",
          row: target,
          pickedTierId: undefined,
          refusal: undefined,
        });
      }
    },
    pick: (tierId) => {
      setStep((current) =>
        current.kind === "choose"
          ? { ...current, pickedTierId: tierId, refusal: undefined }
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
        : describeConfirmationLines({
            changes: priceNotice.confirmation.changes,
            alsoUpdated: priceNotice.confirmation.alsoUpdated,
            copy,
          }),
    dismissConfirmation: priceNotice.dismissConfirmation,
  };
}

type AppliedPick =
  | { readonly committed: true; readonly change: ReplacementChange }
  | { readonly committed: false; readonly refusal: string | undefined };

/** The latest choice of each kind: choosing again for a row replaces what was said about it. */
function withChange(
  earlier: readonly ReplacementChange[] | undefined,
  change: ReplacementChange,
): readonly ReplacementChange[] {
  return [
    ...(earlier ?? []).filter(({ kind }) => kind !== change.kind),
    change,
  ];
}

/** The modal. Mounted only while a choice is owed, so its modal behaviour lives exactly as long as the sheet. */
export function ReplacementSheet({
  sheet,
  leave,
}: {
  readonly sheet: ReplacementSheetState;
  readonly leave: LeaveKitchen;
}) {
  if (!sheet.isPending) return null;
  return <OpenReplacementSheet sheet={sheet} leave={leave} />;
}

function OpenReplacementSheet({
  sheet,
  leave,
}: {
  readonly sheet: ReplacementSheetState;
  readonly leave: LeaveKitchen;
}) {
  const content = useContent();
  const hostRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const firstChooseRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const isChoosing = sheet.chooser !== undefined;

  useModalFocus({
    hostRef,
    initialFocusRef: firstChooseRef,
    focusFallbackRef: surfaceRef,
    dismiss: NOTHING_TO_DISMISS,
  });
  useRefocusOnStepChange(isChoosing, firstChooseRef, surfaceRef);

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

/** The focused control follows the step: the first "Alege" on the list, the first option in a chooser. Not on open, which
 *  `useModalFocus` has already done. */
function useRefocusOnStepChange(
  isChoosing: boolean,
  firstChooseRef: RefObject<HTMLButtonElement | null>,
  surfaceRef: RefObject<HTMLDivElement | null>,
): void {
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const first = isChoosing
      ? surfaceRef.current?.querySelector<HTMLElement>(
          "[data-option]:not([disabled])",
        )
      : firstChooseRef.current;
    (first ?? surfaceRef.current)?.focus();
  }, [isChoosing, firstChooseRef, surfaceRef]);
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
        <span className={styles.rowValue} data-testid="replacement-row-value">
          {row.valueText}
        </span>
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
  readonly chooser: ChooserView;
  readonly bodyId: string;
}) {
  const content = useContent();
  const isApplyOff = sheet.pickedTierId === undefined || sheet.isReadOnly;
  return (
    <>
      <div className={styles.body}>
        <p id={bodyId} className={styles.lead}>
          {chooser.appliesTo}
        </p>
        <div
          role="group"
          aria-label={chooser.heading}
          className={styles.options}
        >
          {chooser.options.map((option) => (
            <button
              key={`${option.tierId}:${String(option.isStruck)}`}
              type="button"
              data-option=""
              className={styles.option}
              data-selected={
                option.tierId === sheet.pickedTierId && !option.isStruck
              }
              data-struck={option.isStruck}
              disabled={option.isStruck}
              aria-pressed={
                option.isStruck
                  ? undefined
                  : option.tierId === sheet.pickedTierId
              }
              onClick={() => {
                sheet.pick(option.tierId);
              }}
            >
              <span className={styles.optionName}>{option.name}</span>
              <span className={styles.optionDescription}>
                {option.isStruck ? chooser.struckNote : option.description}
              </span>
            </button>
          ))}
        </div>
        <p className={styles.hint}>{chooser.hint}</p>
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
