"use client";

import { useTranslations } from "next-intl";

import { TextField } from "@/account/account-form-parts";
import type { ContentTranslator } from "@/i18n/content";

import styles from "./item-screen.module.css";
import editStyles from "./price-edit.module.css";
import {
  createdTextRefusalWords,
  priceWriteFailureWords,
} from "./price-input-words";
import type { CreatedRowNameEditing } from "./use-created-row-name-editing";

// The name of a row the dashboard created, as a field with its button, on the row's own page. Where the client cannot
// take a change of the words, the name is text with the reason.

export interface CreatedNameFieldProps {
  readonly renaming: CreatedRowNameEditing;
  /** The label of the field, already in the reader's language. */
  readonly nameLabel: string;
  /** The label of the button that saves the name. */
  readonly renameLabel: string;
}

export function CreatedNameField({
  renaming,
  nameLabel,
  renameLabel,
}: CreatedNameFieldProps) {
  const translate = useTranslations();
  if (!renaming.canWrite) {
    return (
      <div className={styles.words}>
        <span className={styles.wordsLabel}>{nameLabel}</span>
        <span className={styles.wordsValue}>{renaming.text}</span>
        <p className={styles.hint}>
          {translate("priceDashboard.lifecycle.cannotJudge")}
        </p>
      </div>
    );
  }
  return (
    <>
      <TextField
        label={nameLabel}
        name="name"
        type="text"
        autoComplete="off"
        autoCapitalize="words"
        spellCheck
        value={renaming.text}
        onChange={renaming.type}
        {...nameErrorProps(translate, renaming)}
      />
      <div className={styles.actions}>
        <button
          type="button"
          className={editStyles.action}
          data-tone="primary"
          disabled={!renaming.canSave}
          onClick={() => {
            void renaming.save();
          }}
        >
          {renameLabel}
        </button>
      </div>
    </>
  );
}

/** What the typed name reads as, then what the server's answer to its Save says. */
function nameErrorProps(
  translate: ContentTranslator,
  { judgement, isTouched, failure }: CreatedRowNameEditing,
): { readonly error?: string } {
  if (isTouched && !judgement.ok) {
    return { error: createdTextRefusalWords(translate, judgement.code) };
  }
  return failure === undefined
    ? {}
    : { error: priceWriteFailureWords(translate, failure) };
}
