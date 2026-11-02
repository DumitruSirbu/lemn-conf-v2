"use client";

import { useTranslations } from "next-intl";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { formatLeiAmount } from "./format-lei";
import type { CabinetAnchorField } from "./cabinet-list-model";
import { PriceUnitField } from "./price-unit-field";
import {
  leiRefusalWords,
  priceWriteFailureWords,
  type FailedFieldWrite,
} from "./price-input-words";
import { readLeiInput } from "./price-field-input";
import styles from "./price-edit.module.css";
import type { FieldWriteResult } from "./use-price-draft";

// Frame D2C: the price at the default size changes in the table. A press on the price opens its field; Enter sends the
// value to "De publicat", Escape closes the field and sends nothing. A value that is not an amount is never sent: the
// field keeps it, says why under itself and stays open. So does a value the server refused, in the same place.

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
  const isOpen = typed !== undefined;

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (isFocusOwed) {
      buttonRef.current?.focus();
      setIsFocusOwed(false);
    }
  }, [isOpen, isFocusOwed]);

  const close = () => {
    setTyped(undefined);
    setRefusal(undefined);
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

  const reading = readLeiInput(typed);
  const error =
    reading.kind === "refused"
      ? leiRefusalWords(translate, reading.refusal)
      : refusal === undefined
        ? undefined
        : priceWriteFailureWords(translate, refusal);

  const save = async () => {
    if (reading.kind !== "amount" || editing.isBusy) return;
    if (reading.minor === field.pendingMinor) {
      close();
      return;
    }
    const result = await editing.saveAnchor(field, reading.minor);
    if (result.kind === "saved") close();
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
        setTyped(next);
        setRefusal(undefined);
      }}
      onKeyDown={onKeyDown}
    />
  );
}

/** The amount as a person types it back: the grouping spaces of `formatLeiAmount` left out. */
function plainLeiOf(minor: number): string {
  return formatLeiAmount(minor).replace(/\s/g, "");
}
