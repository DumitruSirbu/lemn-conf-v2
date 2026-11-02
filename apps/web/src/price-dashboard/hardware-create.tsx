"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, type FormEvent } from "react";

import { FormNotice, TextField } from "@/account/account-form-parts";
import type { ContentTranslator } from "@/i18n/content";
import type { AppLocale } from "@/i18n/routing";
import { StaffShell, type StaffShellContext } from "@/staff/staff-shell";

import { pendingPriceCountOf } from "./cabinet-list-model";
import type { HardwarePageInput } from "./hardware-model";
import { hardwareClassPathOf, hardwarePathOf } from "./hardware-paths";
import { HARDWARE_RATE_WORDS } from "./hardware-rate-words";
import styles from "./hardware.module.css";
import editStyles from "./price-edit.module.css";
import type { PriceDraftClient } from "./price-draft-client";
import {
  createdTextRefusalWords,
  creationFailureWords,
  leiRefusalWords,
} from "./price-input-words";
import { PriceUnitField } from "./price-unit-field";
import {
  useHardwareCreation,
  type CreationFeedback,
  type HardwareCreation,
  type RateEntry,
  type TextEntry,
} from "./use-hardware-creation";
import { usePriceDraft } from "./use-price-draft";

// A new class of hardware (frame D4C): Romanian name and description, and a price for each mechanism. It is created in "De
// publicat", inactive; the customer is offered it only after it is published and switched on.

export interface HardwareCreateScreenProps {
  readonly locale: AppLocale;
  readonly context: StaffShellContext;
  readonly page: HardwarePageInput;
  /** The routes the draft is written through; the fetching client when left out. */
  readonly client?: PriceDraftClient | undefined;
}

export function HardwareCreateScreen({
  locale,
  context,
  page,
  client,
}: HardwareCreateScreenProps) {
  const draft = usePriceDraft({ initial: page.state, client });
  const creation = useHardwareCreation({ draft });
  const shell = {
    ...context,
    pendingPriceCount: pendingPriceCountOf(draft.state.draft),
  };
  return (
    <StaffShell locale={locale} page="hardware" context={shell}>
      <HardwareCreate locale={locale} creation={creation} />
    </StaffShell>
  );
}

function HardwareCreate({
  locale,
  creation,
}: {
  readonly locale: AppLocale;
  readonly creation: HardwareCreation;
}) {
  const translate = useTranslations();
  return (
    <section className={styles.page} data-testid="hardware-create">
      <div className={styles.heading}>
        <a className={styles.back} href={hardwarePathOf(locale)}>
          {translate("priceDashboard.hardware.title")}
        </a>
        <h1 className={styles.title}>
          {translate("priceDashboard.hardware.newTitle")}
        </h1>
        <span className={styles.chips}>
          <span className={styles.chip} data-testid="hardware-chip">
            {translate("priceDashboard.chips.inactive")}
          </span>
        </span>
      </div>
      {creation.feedback.kind === "created" ? (
        <Created locale={locale} tierId={tierIdOf(creation.feedback)} />
      ) : (
        <CreateForm locale={locale} creation={creation} />
      )}
    </section>
  );
}

function tierIdOf(
  feedback: Extract<CreationFeedback, { readonly kind: "created" }>,
): string | undefined {
  return feedback.created.kind === "hardware"
    ? feedback.created.tierId
    : undefined;
}

/** The class is in "De publicat": where it is, and the way to its own page. */
function Created({
  locale,
  tierId,
}: {
  readonly locale: AppLocale;
  readonly tierId: string | undefined;
}) {
  const translate = useTranslations();
  const noticeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    noticeRef.current?.focus();
  }, []);
  return (
    <>
      <FormNotice tone="success" ref={noticeRef}>
        {translate("priceDashboard.hardware.createdNotice")}
      </FormNotice>
      <div className={styles.actions}>
        {tierId === undefined ? null : (
          <a
            className={styles.linkAction}
            href={hardwareClassPathOf(locale, tierId)}
          >
            {translate("priceDashboard.common.edit")}
          </a>
        )}
        <a className={styles.linkAction} href={hardwarePathOf(locale)}>
          {translate("priceDashboard.hardware.title")}
        </a>
      </div>
    </>
  );
}

function CreateForm({
  locale,
  creation,
}: {
  readonly locale: AppLocale;
  readonly creation: HardwareCreation;
}) {
  const translate = useTranslations();
  const cannotWriteId = useId();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void creation.create();
  };
  return (
    <form
      className={styles.editColumns}
      aria-busy={creation.isCreating}
      noValidate
      onSubmit={submit}
    >
      <div className={styles.editColumn}>
        <NameFields creation={creation} />
        <p className={styles.hint}>
          {translate("priceDashboard.hardware.activeHintNew")}
        </p>
      </div>
      <div className={styles.editColumn}>
        <h2 className={styles.cardTitle}>
          {translate("priceDashboard.hardware.pricesHeading")}
        </h2>
        <p className={styles.intro}>
          {translate("priceDashboard.hardware.pricesHint")}
        </p>
        <div className={styles.fields}>
          {creation.rates.map((entry) => (
            <RateEntryField
              key={entry.field}
              entry={entry}
              creation={creation}
            />
          ))}
        </div>
        <p className={styles.intro}>
          {translate("priceDashboard.hardware.newPricesNote")}
        </p>
        <FailureNotice feedback={creation.feedback} />
        <div className={styles.actions}>
          <button
            type="submit"
            className={editStyles.action}
            data-tone="primary"
            disabled={!creation.canCreate}
            aria-describedby={creation.canWrite ? undefined : cannotWriteId}
          >
            {translate("priceDashboard.hardware.createAction")}
          </button>
          <a className={styles.linkAction} href={hardwarePathOf(locale)}>
            {translate("priceDashboard.common.cancel")}
          </a>
        </div>
        {creation.canWrite ? null : (
          <p id={cannotWriteId} className={styles.hint}>
            {translate("priceDashboard.lifecycle.cannotJudge")}
          </p>
        )}
      </div>
    </form>
  );
}

function NameFields({ creation }: { readonly creation: HardwareCreation }) {
  const translate = useTranslations();
  return (
    <>
      <TextField
        label={translate("priceDashboard.hardware.nameLabel")}
        name="name"
        type="text"
        autoComplete="off"
        autoCapitalize="words"
        spellCheck
        value={creation.name.text}
        onChange={creation.typeName}
        {...errorProps(translate, creation.name)}
      />
      <TextField
        label={translate("priceDashboard.hardware.descriptionLabel")}
        name="description"
        type="text"
        autoComplete="off"
        spellCheck
        value={creation.description.text}
        onChange={creation.typeDescription}
        hint={translate("priceDashboard.common.createdTextNote")}
        {...errorProps(translate, creation.description)}
      />
    </>
  );
}

/** The refusal of what has been typed, and only of what has: an empty field is not scolded before it is touched. */
function errorProps(
  translate: ContentTranslator,
  entry: TextEntry,
): { readonly error?: string } {
  return !entry.isTouched || entry.judgement.ok
    ? {}
    : { error: createdTextRefusalWords(translate, entry.judgement.code) };
}

function RateEntryField({
  entry,
  creation,
}: {
  readonly entry: RateEntry;
  readonly creation: HardwareCreation;
}) {
  const translate = useTranslations();
  const { field, reading } = entry;
  const hintWords = HARDWARE_RATE_WORDS[field].hint;
  const error =
    entry.isTouched && reading.kind === "refused"
      ? leiRefusalWords(translate, reading.refusal)
      : undefined;
  return (
    <PriceUnitField
      label={translate(HARDWARE_RATE_WORDS[field].label)}
      unit={translate(HARDWARE_RATE_WORDS[field].unit)}
      inputMode="decimal"
      value={entry.text}
      hint={hintWords === undefined ? undefined : translate(hintWords)}
      error={error}
      onChange={(text) => {
        creation.typeRate(field, text);
      }}
    />
  );
}

/** What the server's answer to the creation says, where nothing was written. */
function FailureNotice({ feedback }: { readonly feedback: CreationFeedback }) {
  const translate = useTranslations();
  if (feedback.kind !== "failed") return null;
  return (
    <FormNotice tone="error">
      {creationFailureWords(translate, feedback.failure)}
    </FormNotice>
  );
}
