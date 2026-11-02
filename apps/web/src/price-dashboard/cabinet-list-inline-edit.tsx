"use client";

import { useTranslations } from "next-intl";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import type { CabinetAnchorField } from "./cabinet-list-model";
import { PriceUnitField } from "./price-unit-field";
import {
  leiRefusalWords,
  priceWriteFailureWords,
  type FailedFieldWrite,
} from "./price-input-words";
import { plainLeiOf, readLeiInputOverHeld } from "./price-field-input";
import styles from "./price-edit.module.css";
import type { FieldWriteResult } from "./use-price-draft";

// Frame D2C: the price at the default size changes in the table. A press on the price opens its field; Enter sends the
// value to "De publicat", Escape closes the field and sends nothing. A value that is not an amount is never sent: the
// field keeps it, says why under itself and stays open. So does a value the server refused, in the same place, unless
// the person has since closed the field, opened it again or typed over the text: an answer to a value no longer in the
// field is ignored. A price already held, the active one or the draft's, is never refused for its size, so a stored
// price that is not a whole ten of lei can be opened, closed and typed back.

/** What the list is given where it can change a price: the one write, and whether another is out. */
export interface PriceEditing {
  readonly isBusy: boolean;
  readonly saveAnchor: (
    field: CabinetAnchorField,
    minor: number,
  ) => Promise<FieldWriteResult>;
}

export interface EditablePriceProps {
  readonly cabinetName: string;
  readonly widthMm: number;
  readonly field: CabinetAnchorField;
  readonly editing: PriceEditing;
  /** The price as the row draws it. */
  readonly figure: string;
  /** What stands beside the figure while the field is closed. */
  readonly basis: ReactNode;
}

export function EditablePrice({
  cabinetName,
  widthMm,
  field,
  editing,
  figure,
  basis,
}: EditablePriceProps) {
  const translate = useTranslations();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState<string | undefined>(undefined);
  const [refusal, setRefusal] = useState<FailedFieldWrite | undefined>(
    undefined,
  );
  const [isFocusOwed, setIsFocusOwed] = useState(false);
  const moveCountRef = useRef(0);
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

  /**
   * Opening, typing and closing each make an answer still on its way an answer to a field that is no longer this one.
   */
  const moveOn = () => {
    moveCountRef.current += 1;
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
          aria-label={translate("priceDashboard.cabinets.editPriceAria", {
            name: cabinetName,
          })}
          onClick={() => {
            moveOn();
            setTyped(plainLeiOf(field.pendingMinor));
          }}
        >
          <span>{figure}</span>
          <span className={styles.pencil} aria-hidden="true" />
        </button>
        {basis}
      </>
    );
  }

  const reading = readLeiInputOverHeld(typed, [
    field.activeMinor,
    field.pendingMinor,
  ]);
  const error =
    reading.kind === "refused"
      ? leiRefusalWords(translate, reading.refusal)
      : refusal === undefined
        ? undefined
        : priceWriteFailureWords(translate, refusal);

  const save = async () => {
    if (reading.kind !== "amount" || editing.isBusy) return;
    if (isDraftsOwnValue(reading.minor, field)) {
      close();
      return;
    }
    const moveCountWhenSent = moveCountRef.current;
    const result = await editing.saveAnchor(field, reading.minor);
    if (result.kind === "busy") return;
    if (moveCountRef.current !== moveCountWhenSent) return;
    if (result.kind === "saved" || result.kind === "unchanged") close();
    else setRefusal(result);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void save();
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  return (
    <PriceUnitField
      label={translate("priceDashboard.cabinets.editPriceLabel", { widthMm })}
      unit={translate("priceDashboard.units.currency")}
      inputMode="decimal"
      value={typed}
      inputRef={inputRef}
      hint={translate("priceDashboard.cabinets.editHint")}
      error={error}
      isPending={field.pendingMinor !== field.activeMinor}
      onChange={(next) => {
        moveOn();
        setTyped(next);
      }}
      onKeyDown={onKeyDown}
    />
  );
}

/** The draft's own value is nothing to send; the active price never is, as typing it takes the draft's change out. */
function isDraftsOwnValue(minor: number, field: CabinetAnchorField): boolean {
  return minor === field.pendingMinor && minor !== field.activeMinor;
}

/** Focus returns to the price only from nowhere or from this row: a person who went to another field keeps it. */
function isFocusFreeToReturn(button: HTMLElement | null): boolean {
  const focused = document.activeElement;
  if (focused === null || focused === document.body) return true;
  return button?.closest("li")?.contains(focused) ?? false;
}
