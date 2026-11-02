"use client";

import { useId, type KeyboardEvent, type ReactNode, type Ref } from "react";

import { FormHint, InlineRefusal } from "@/account/account-form-parts";

import styles from "./price-edit.module.css";

// A number the manufacturer types, with its label above it and its unit inside the box. A field that is refused says
// why under itself (`role="alert"`), is `aria-invalid`, and names the sentence in `aria-describedby`, so the reason is
// read with the field and never only seen.

/** The unit of a percentage field: a symbol, the same in both languages. */
export const PERCENT_UNIT = "%";

export interface PriceUnitFieldProps {
  readonly label: string;
  /** What the number counts, drawn inside the box: "lei", "%". */
  readonly unit: string;
  readonly value: string;
  readonly inputMode: "decimal" | "numeric" | "text";
  readonly onChange: (value: string) => void;
  readonly onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  readonly hint?: ReactNode;
  /** The refusal's sentence. Its presence marks the field invalid; it never repeats the value. */
  readonly error?: string | undefined;
  /** The field holds a change that awaits publication. */
  readonly isPending?: boolean;
  readonly inputRef?: Ref<HTMLInputElement>;
}

export function PriceUnitField({
  label,
  unit,
  value,
  inputMode,
  onChange,
  onKeyDown,
  hint,
  error,
  isPending = false,
  inputRef,
}: PriceUnitFieldProps) {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const describedBy =
    [hint === undefined ? "" : hintId, error === undefined ? "" : errorId]
      .filter((id) => id !== "")
      .join(" ") || undefined;
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>
      <div
        className={styles.control}
        data-invalid={error !== undefined}
        data-warm={isPending && error === undefined}
      >
        <input
          ref={inputRef}
          id={inputId}
          className={styles.input}
          type="text"
          inputMode={inputMode}
          autoComplete="off"
          spellCheck={false}
          value={value}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={describedBy}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          onKeyDown={onKeyDown}
        />
        <span className={styles.unit}>{unit}</span>
      </div>
      {hint === undefined ? null : <FormHint id={hintId}>{hint}</FormHint>}
      {error === undefined ? null : (
        <InlineRefusal id={errorId}>{error}</InlineRefusal>
      )}
    </div>
  );
}
