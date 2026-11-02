"use client";

import { useTranslations } from "next-intl";

import { PRICE_STEP_MM } from "@lemnaria/configurator-domain";

import type { AppLocale } from "@/i18n/routing";
import type { ContentTranslator } from "@/i18n/content";

import styles from "./cabinet-detail.module.css";
import type { CabinetDetailFacts } from "./cabinet-detail-facts";
import type { FieldRole, FieldState } from "./cabinet-detail-fields";
import { priceSentence } from "./cabinet-price-sentence";
import { formatLei } from "./format-lei";
import { PriceUnitField } from "./price-unit-field";
import { leiRefusalWords, priceWriteFailureWords } from "./price-input-words";
import editStyles from "./price-edit.module.css";
import { publishPathOf } from "./publish-paths";
import type { CabinetPriceEditing } from "./use-cabinet-price-editing";

// The price fields, the sentence they make, and Save and Cancel. A field says why its value is wrong as it is typed and
// Save stays off while any is: a wrong value is never sent.

export function CabinetPriceFields({
  locale,
  facts,
  editing,
}: {
  readonly locale: AppLocale;
  readonly facts: CabinetDetailFacts;
  readonly editing: CabinetPriceEditing;
}) {
  const translate = useTranslations();
  const errors = errorsOf(translate, editing);
  const hasError = errors.size > 0;
  return (
    <>
      <div className={styles.fields}>
        {editing.states.map((state) => (
          <PriceField
            key={state.field.key}
            state={state}
            facts={facts}
            error={errors.get(state.field.key)}
            editing={editing}
          />
        ))}
      </div>
      <p className={styles.sentence} data-testid="cabinet-price-sentence">
        {priceSentence(translate, { facts, states: editing.states })}
      </p>
      <SaveBar locale={locale} editing={editing} hasError={hasError} />
    </>
  );
}

function PriceField({
  state,
  facts,
  error,
  editing,
}: {
  readonly state: FieldState;
  readonly facts: CabinetDetailFacts;
  readonly error: string | undefined;
  readonly editing: CabinetPriceEditing;
}) {
  const translate = useTranslations();
  const { field } = state;
  return (
    <PriceUnitField
      label={labelOf(translate, state, facts)}
      unit={translate(
        field.role === "door"
          ? "priceDashboard.units.perDoor"
          : "priceDashboard.units.currency",
      )}
      inputMode="decimal"
      value={state.text}
      hint={error === undefined ? hintOf(translate, state) : undefined}
      error={error}
      isPending={state.effectiveMinor !== field.activeMinor}
      onChange={(text) => {
        editing.type(field.key, text);
      }}
    />
  );
}

function labelOf(
  translate: ContentTranslator,
  { field }: FieldState,
  facts: CabinetDetailFacts,
): string {
  const widthMm = field.quotedAtMm ?? 0;
  const roleLabels: Record<FieldRole, () => string> = {
    anchor: () => translate("priceDashboard.cabinet.fieldAnchor", { widthMm }),
    size: () => translate("priceDashboard.cabinet.fieldAnchor", { widthMm }),
    plus: () =>
      translate("priceDashboard.cabinet.fieldPlus", { stepMm: PRICE_STEP_MM }),
    minus: () =>
      translate("priceDashboard.cabinet.fieldMinus", { stepMm: PRICE_STEP_MM }),
    door: () =>
      translate("priceDashboard.cabinet.fieldDoor", {
        atMm: facts.doorStep?.atMm ?? 0,
      }),
    height: () =>
      translate("priceDashboard.cabinet.fieldHeightStep", {
        stepMm: PRICE_STEP_MM,
      }),
  };
  return roleLabels[field.role]();
}

/** What the field's active value is, in the words of the frame; a plain "Activ: …" where the frame says no more. */
function hintOf(translate: ContentTranslator, state: FieldState): string {
  const amount = formatLei(
    state.field.activeMinor,
    translate("priceDashboard.units.currency"),
  );
  switch (state.field.role) {
    case "anchor":
      return translate("priceDashboard.cabinet.anchorHint", { amount });
    case "door":
      return translate("priceDashboard.cabinet.doorHint", { amount });
    case "height":
      return translate("priceDashboard.cabinet.heightStepHint", {
        amount,
        referenceMm: state.field.quotedAtMm ?? 0,
      });
    default:
      return translate("priceDashboard.common.activeValue", { amount });
  }
}

/** The sentence under each field that cannot be saved as it stands, by the field's key: what it reads, then what the
 *  prices it would make say, then what the server answered to the write that was last tried. */
function errorsOf(
  translate: ContentTranslator,
  editing: CabinetPriceEditing,
): ReadonlyMap<string, string> {
  const errors = new Map<string, string>();
  for (const { field, reading } of editing.states) {
    if (reading.kind === "refused") {
      errors.set(field.key, leiRefusalWords(translate, reading.refusal));
    }
  }
  const { judgement, feedback } = editing;
  if (judgement !== undefined && !errors.has(judgement.fieldKey)) {
    errors.set(judgement.fieldKey, judgementWords(translate, judgement));
  }
  if (feedback.kind === "failed" && !errors.has(feedback.fieldKey)) {
    errors.set(
      feedback.fieldKey,
      priceWriteFailureWords(translate, feedback.failure),
    );
  }
  return errors;
}

function judgementWords(
  translate: ContentTranslator,
  judgement: NonNullable<CabinetPriceEditing["judgement"]>,
): string {
  switch (judgement.kind) {
    case "not-positive-at-width":
      return translate("priceDashboard.errors.priceNotPositiveAtWidth", {
        widthMm: judgement.widthMm,
      });
    case "not-positive-at-height":
      return translate("priceDashboard.errors.priceNotPositiveAtHeight", {
        heightMm: judgement.heightMm,
      });
    case "not-positive":
      return translate("priceDashboard.errors.priceNotPositive");
    case "too-large":
      return translate("priceDashboard.errors.tooBig");
  }
}

function SaveBar({
  locale,
  editing,
  hasError,
}: {
  readonly locale: AppLocale;
  readonly editing: CabinetPriceEditing;
  readonly hasError: boolean;
}) {
  const translate = useTranslations();
  if (editing.feedback.kind === "saved" && !editing.isChanged) {
    return (
      <div className={styles.saved} role="status">
        <p className={styles.savedText}>
          {translate("priceDashboard.common.priceSavedNotice")}
        </p>
        <a className={styles.inlineLink} href={publishPathOf(locale)}>
          {translate("priceDashboard.nav.publish")}
        </a>
      </div>
    );
  }
  return (
    <div className={styles.actions}>
      <div className={styles.actionRow}>
        <button
          type="button"
          className={editStyles.action}
          data-tone="primary"
          disabled={!editing.canSave}
          onClick={() => {
            void editing.save();
          }}
        >
          {translate("priceDashboard.common.save")}
        </button>
        {editing.isChanged || hasError ? (
          <button
            type="button"
            className={editStyles.action}
            onClick={editing.cancel}
          >
            {translate("priceDashboard.common.cancel")}
          </button>
        ) : null}
      </div>
      {hasError ? (
        <p className={styles.fixToSave}>
          {translate("priceDashboard.errors.fixToSave")}
        </p>
      ) : null}
    </div>
  );
}
