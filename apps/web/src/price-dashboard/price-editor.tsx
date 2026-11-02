"use client";

import { useTranslations } from "next-intl";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { PriceUnitField } from "./price-unit-field";
import {
  leiRefusalWords,
  priceWriteFailureWords,
  type FailedFieldWrite,
} from "./price-input-words";
import { plainLeiOf, readLeiInputOverHeld } from "./price-field-input";
import styles from "./price-edit.module.css";
import { useLateAnswerGuard } from "./use-late-answer-guard";
import type { FieldWriteResult } from "./use-price-draft";

// A price that changes where it is drawn. A press on it opens its field; Enter sends the value to "De publicat", Escape
// closes the field and sends nothing. A value that is not an amount is never sent: the field keeps it, says why under
// itself and stays open. So does a value the server refused, in the same place, unless the person has since closed the
// field, opened it again or typed over the text: an answer to a value no longer in the field is ignored. A price already
// held, the active one or the draft's, is never refused for its size, so a stored price that is not a whole ten of lei
// can be opened, closed and typed back. Below 900 px the figure is plain text: a phone changes a price on the cabinet's
// own page.

export interface PriceEditorProps {
  /** The open field's label. */
  readonly label: string;
  /** The name of the button that opens the field. */
  readonly openAriaLabel: string;
  readonly activeMinor: number;
  readonly pendingMinor: number;
  readonly isBusy: boolean;
  readonly save: (minor: number) => Promise<FieldWriteResult>;
  /** The price as the surface draws it. */
  readonly figure: string;
  /** What stands beside the figure while the field is closed. */
  readonly basis?: ReactNode;
}

export function PriceEditor({
  label,
  openAriaLabel,
  activeMinor,
  pendingMinor,
  isBusy,
  save: sendAmount,
  figure,
  basis,
}: PriceEditorProps) {
  const translate = useTranslations();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState<string | undefined>(undefined);
  const [refusal, setRefusal] = useState<FailedFieldWrite | undefined>(
    undefined,
  );
  const [isFocusOwed, setIsFocusOwed] = useState(false);
  const { moveOn: markMoved, begin } = useLateAnswerGuard();
  const isOpen = typed !== undefined;

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (isFocusOwed) {
      if (isFocusFreeToReturn(buttonRef.current)) buttonRef.current?.focus();
      setIsFocusOwed(false);
    }
  }, [isOpen, isFocusOwed]);

  const moveOn = () => {
    markMoved();
    setRefusal(undefined);
  };

  const close = () => {
    moveOn();
    setTyped(undefined);
    setIsFocusOwed(true);
  };

  if (typed === undefined) {
    return (
      <>
        <button
          ref={buttonRef}
          type="button"
          className={styles.priceButton}
          aria-label={openAriaLabel}
          onClick={() => {
            moveOn();
            setTyped(plainLeiOf(pendingMinor));
          }}
        >
          <span>{figure}</span>
          <span className={styles.pencil} aria-hidden="true" />
        </button>
        <span className={styles.priceText}>{figure}</span>
        {basis}
      </>
    );
  }

  const reading = readLeiInputOverHeld(typed, [activeMinor, pendingMinor]);
  const error =
    reading.kind === "refused"
      ? leiRefusalWords(translate, reading.refusal)
      : refusal === undefined
        ? undefined
        : priceWriteFailureWords(translate, refusal);

  const submit = async () => {
    if (reading.kind !== "amount" || isBusy) return;
    if (isDraftsOwnValue(reading.minor, { activeMinor, pendingMinor })) {
      close();
      return;
    }
    const hasMoved = begin();
    const result = await sendAmount(reading.minor);
    if (result.kind === "busy" || hasMoved()) return;
    if (result.kind === "saved" || result.kind === "unchanged") close();
    else setRefusal(result);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void submit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  return (
    <div className={styles.openPrice}>
      <PriceUnitField
        label={label}
        unit={translate("priceDashboard.units.currency")}
        inputMode="decimal"
        value={typed}
        inputRef={inputRef}
        hint={translate("priceDashboard.cabinets.editHint")}
        error={error}
        isPending={pendingMinor !== activeMinor}
        onChange={(next) => {
          moveOn();
          setTyped(next);
        }}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}

/** The draft's own value is nothing to send; the active price never is, as typing it takes the draft's change out. */
function isDraftsOwnValue(
  minor: number,
  held: { readonly activeMinor: number; readonly pendingMinor: number },
): boolean {
  return minor === held.pendingMinor && minor !== held.activeMinor;
}

/** Focus returns to the price only from nowhere or from this row: a person who went to another field keeps it. */
function isFocusFreeToReturn(button: HTMLElement | null): boolean {
  const focused = document.activeElement;
  if (focused === null || focused === document.body) return true;
  return button?.closest("li")?.contains(focused) ?? false;
}
