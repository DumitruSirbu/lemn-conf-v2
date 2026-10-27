"use client";

import { useTranslations } from "next-intl";
import { useId, type RefObject } from "react";

import type { PublishTextRefusalCode } from "./price-dashboard-wire-contract";
import styles from "./publish.module.css";

// The provisional switch is a draft change like any price; the checkbox that guards turning it off is asked at publish.

const HELP_KEYS = [
  "priceDashboard.publish.helpPrices",
  "priceDashboard.publish.helpActivation",
  "priceDashboard.publish.helpNotice",
  "priceDashboard.publish.helpApproximate",
] as const;

export interface VersionNameFieldProps {
  readonly name: string;
  readonly refusal: PublishTextRefusalCode | undefined;
  readonly onChange: (name: string) => void;
}

export function VersionNameField({
  name,
  refusal,
  onChange,
}: VersionNameFieldProps) {
  const translate = useTranslations();
  const inputId = useId();
  const hintId = useId();
  const refusalId = useId();
  return (
    <div className={styles.panelBlock}>
      <label className={styles.fieldLabel} htmlFor={inputId}>
        {translate("priceDashboard.publish.versionNameLabel")}
      </label>
      <input
        id={inputId}
        type="text"
        className={styles.textInput}
        value={name}
        autoComplete="off"
        aria-invalid={refusal === undefined ? undefined : true}
        aria-describedby={
          refusal === undefined ? hintId : `${hintId} ${refusalId}`
        }
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      <p id={hintId} className={styles.hint}>
        {translate("priceDashboard.publish.versionNameHint")}
      </p>
      {refusal === undefined ? null : (
        <p id={refusalId} role="alert" className={styles.refusal}>
          <RefusalWords code={refusal} />
        </p>
      )}
    </div>
  );
}

function RefusalWords({ code }: { readonly code: PublishTextRefusalCode }) {
  const translate = useTranslations();
  switch (code) {
    case "TEXT_EMPTY":
      return translate("priceDashboard.publish.versionNameEmpty");
    case "TEXT_TOO_LONG":
      return translate("priceDashboard.publish.versionNameTooLong");
    case "TEXT_FORBIDDEN_CHARACTER":
      return translate("priceDashboard.publish.versionNameForbidden");
  }
}

export interface ProvisionalSwitchProps {
  readonly isProvisional: boolean;
  /** The draft changes the flag: the book that would be published differs from the active one on it. */
  readonly isChanged: boolean;
  readonly isBusy: boolean;
  readonly onToggle: () => void;
}

export function ProvisionalSwitch({
  isProvisional,
  isChanged,
  isBusy,
  onToggle,
}: ProvisionalSwitchProps) {
  const translate = useTranslations();
  const labelId = useId();
  const hintId = useId();
  return (
    <div className={styles.switchBlock} data-changed={isChanged}>
      <div className={styles.switchRow}>
        <span id={labelId} className={styles.fieldLabel}>
          {translate("priceDashboard.publish.provisionalLabel")}
        </span>
        <button
          type="button"
          role="switch"
          className={styles.switch}
          aria-checked={isProvisional}
          aria-labelledby={labelId}
          aria-describedby={hintId}
          aria-disabled={isBusy ? true : undefined}
          onClick={isBusy ? undefined : onToggle}
        />
      </div>
      <p id={hintId} className={styles.hint}>
        {translate("priceDashboard.publish.provisionalHint")}
      </p>
      <span className={styles.switchState}>
        {isProvisional
          ? translate("priceDashboard.publish.provisionalOn")
          : translate("priceDashboard.publish.provisionalOff")}
      </span>
      {isChanged ? (
        <span className={styles.changeFlag}>
          {translate("priceDashboard.publish.provisionalChanges")}
        </span>
      ) : null}
    </div>
  );
}

export function PublishHelp() {
  const translate = useTranslations();
  return (
    <section className={styles.help}>
      <h2 className={styles.helpTitle}>
        {translate("priceDashboard.publish.helpTitle")}
      </h2>
      <ul className={styles.helpList}>
        {HELP_KEYS.map((key) => (
          <li key={key}>{translate(key)}</li>
        ))}
      </ul>
    </section>
  );
}

export interface PublishButtonProps {
  readonly buttonRef: RefObject<HTMLButtonElement | null>;
  readonly changeCount: number;
  readonly canPublish: boolean;
  readonly isBusy: boolean;
  readonly onPress: () => void;
}

/** Off, and out of reach, while the draft would change nothing (D7D): it stays in the Tab ring, so its state is read. */
export function PublishButton({
  buttonRef,
  changeCount,
  canPublish,
  isBusy,
  onPress,
}: PublishButtonProps) {
  const translate = useTranslations();
  const isOff = !canPublish || isBusy;
  return (
    <div className={styles.actionBar}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.primary}
        aria-disabled={isOff ? true : undefined}
        aria-busy={isBusy ? true : undefined}
        onClick={isOff ? undefined : onPress}
      >
        {isBusy
          ? translate("priceDashboard.publish.publishing")
          : translate("priceDashboard.publish.publishAction", {
              count: changeCount,
            })}
      </button>
    </div>
  );
}
