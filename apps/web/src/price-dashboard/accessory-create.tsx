"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, type FormEvent } from "react";

import {
  FormHint,
  FormNotice,
  InlineRefusal,
  TextField,
} from "@/account/account-form-parts";
import type { ContentTranslator } from "@/i18n/content";
import type { AppLocale } from "@/i18n/routing";
import { StaffShell, type StaffShellContext } from "@/staff/staff-shell";

import { deriveAccessories, type AccessoryPageInput } from "./accessory-model";
import { accessoriesPathOf, accessoryPathOf } from "./accessory-paths";
import { AccessoryUnavailableScreen, cabinetNameOf } from "./accessory-parts";
import styles from "./accessory.module.css";
import { pendingPriceCountOf } from "./cabinet-list-model";
import type { CreationFeedback, TextEntry } from "./creation-entries";
import type { PriceDraftClient } from "./price-draft-client";
import editStyles from "./price-edit.module.css";
import {
  createdTextRefusalWords,
  creationFailureWords,
  leiRefusalWords,
} from "./price-input-words";
import { PriceUnitField } from "./price-unit-field";
import {
  useAccessoryCreation,
  type AccessoryCreationForm,
} from "./use-accessory-creation";
import { usePriceDraft } from "./use-price-draft";

// A new linked accessory (frame D6B): Romanian name and description, the cabinet type it follows, and its price per unit.
// It is created in "De publicat", inactive; the customer's kitchen earns it only after it is published and switched on.
// The cabinet types offered are the rows the manufacturer supplies, as the domain lists them.

export interface AccessoryCreateScreenProps {
  readonly locale: AppLocale;
  readonly context: StaffShellContext;
  readonly page: AccessoryPageInput;
  /** The routes the draft is written through; the fetching client when left out. */
  readonly client?: PriceDraftClient | undefined;
}

export function AccessoryCreateScreen({
  locale,
  context,
  page,
  client,
}: AccessoryCreateScreenProps) {
  const draft = usePriceDraft({ initial: page.state, client });
  const creation = useAccessoryCreation({ draft });
  const derivation = useMemo(
    () => deriveAccessories(draft.state),
    [draft.state],
  );
  if (derivation.kind === "unreadable") {
    return <AccessoryUnavailableScreen locale={locale} context={context} />;
  }
  const shell = {
    ...context,
    pendingPriceCount: pendingPriceCountOf(draft.state.draft),
  };
  return (
    <StaffShell locale={locale} page="accessories" context={shell}>
      <AccessoryCreate
        locale={locale}
        creation={creation}
        linkTargets={derivation.linkTargetBuildIds}
        cabinetNames={page.cabinetNames}
      />
    </StaffShell>
  );
}

function AccessoryCreate({
  locale,
  creation,
  linkTargets,
  cabinetNames,
}: {
  readonly locale: AppLocale;
  readonly creation: AccessoryCreationForm;
  readonly linkTargets: readonly string[];
  readonly cabinetNames: Readonly<Record<string, string>>;
}) {
  const translate = useTranslations();
  return (
    <section className={styles.page} data-testid="accessory-create">
      <div className={styles.heading}>
        <a className={styles.back} href={accessoriesPathOf(locale)}>
          {translate("priceDashboard.accessories.title")}
        </a>
        <h1 className={styles.title}>
          {translate("priceDashboard.accessories.newTitle")}
        </h1>
        <span className={styles.chips}>
          <span className={styles.chip} data-testid="accessory-chip">
            {translate("priceDashboard.chips.inactive")}
          </span>
        </span>
      </div>
      {creation.feedback.kind === "created" ? (
        <Created locale={locale} feedback={creation.feedback} />
      ) : (
        <CreateForm
          locale={locale}
          creation={creation}
          linkTargets={linkTargets}
          cabinetNames={cabinetNames}
        />
      )}
    </section>
  );
}

/** The accessory is in "De publicat": where it is, and the way to its own page. */
function Created({
  locale,
  feedback,
}: {
  readonly locale: AppLocale;
  readonly feedback: Extract<CreationFeedback, { readonly kind: "created" }>;
}) {
  const translate = useTranslations();
  const noticeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    noticeRef.current?.focus();
  }, []);
  const { created } = feedback;
  return (
    <>
      <FormNotice tone="success" ref={noticeRef}>
        {translate("priceDashboard.accessories.createdNotice")}
      </FormNotice>
      <div className={styles.actions}>
        {created.kind === "accessory" ? (
          <a
            className={styles.linkAction}
            href={accessoryPathOf(locale, created.accessoryId)}
          >
            {translate("priceDashboard.common.edit")}
          </a>
        ) : null}
        <a className={styles.linkAction} href={accessoriesPathOf(locale)}>
          {translate("priceDashboard.accessories.title")}
        </a>
      </div>
    </>
  );
}

function CreateForm({
  locale,
  creation,
  linkTargets,
  cabinetNames,
}: {
  readonly locale: AppLocale;
  readonly creation: AccessoryCreationForm;
  readonly linkTargets: readonly string[];
  readonly cabinetNames: Readonly<Record<string, string>>;
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
        <LinkField
          creation={creation}
          linkTargets={linkTargets}
          cabinetNames={cabinetNames}
        />
        <p className={styles.hint}>
          {translate("priceDashboard.accessories.activeHintNew")}
        </p>
      </div>
      <div className={styles.editColumn}>
        <h2 className={styles.cardTitle}>
          {translate("priceDashboard.accessories.priceHeading")}
        </h2>
        <p className={styles.intro}>
          {translate("priceDashboard.accessories.priceHint")}
        </p>
        <div className={styles.fields}>
          <PriceEntryField creation={creation} />
        </div>
        <FailureNotice feedback={creation.feedback} />
        <div className={styles.actions}>
          <button
            type="submit"
            className={editStyles.action}
            data-tone="primary"
            disabled={!creation.canCreate}
            aria-describedby={creation.canWrite ? undefined : cannotWriteId}
          >
            {translate("priceDashboard.accessories.createAction")}
          </button>
          <a className={styles.linkAction} href={accessoriesPathOf(locale)}>
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

function NameFields({
  creation,
}: {
  readonly creation: AccessoryCreationForm;
}) {
  const translate = useTranslations();
  return (
    <>
      <TextField
        label={translate("priceDashboard.accessories.nameLabel")}
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
        label={translate("priceDashboard.accessories.descriptionLabel")}
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

/** The cabinet type the accessory follows: required, chosen from the rows the manufacturer supplies, never preselected. */
function LinkField({
  creation,
  linkTargets,
  cabinetNames,
}: {
  readonly creation: AccessoryCreationForm;
  readonly linkTargets: readonly string[];
  readonly cabinetNames: Readonly<Record<string, string>>;
}) {
  const translate = useTranslations();
  const selectId = useId();
  const hintId = useId();
  const errorId = useId();
  const { buildId, isTouched } = creation.link;
  const isMissing = isTouched && buildId === "";
  return (
    <div className={editStyles.field}>
      <label className={editStyles.label} htmlFor={selectId}>
        {translate("priceDashboard.accessories.linkLabel")}
      </label>
      <select
        id={selectId}
        className={styles.select}
        name="link"
        value={buildId}
        aria-required="true"
        aria-invalid={isMissing ? true : undefined}
        aria-describedby={isMissing ? `${hintId} ${errorId}` : hintId}
        onChange={(event) => {
          creation.chooseLink(event.target.value);
        }}
      >
        <option value="">
          {translate("priceDashboard.accessories.linkPlaceholder")}
        </option>
        {linkTargets.map((targetBuildId) => (
          <option key={targetBuildId} value={targetBuildId}>
            {cabinetNameOf(cabinetNames, targetBuildId)}
          </option>
        ))}
      </select>
      <FormHint id={hintId}>
        {translate("priceDashboard.accessories.linkHint")}
      </FormHint>
      {isMissing ? (
        <InlineRefusal id={errorId}>
          {translate("priceDashboard.accessories.linkRequired")}
        </InlineRefusal>
      ) : null}
    </div>
  );
}

function PriceEntryField({
  creation,
}: {
  readonly creation: AccessoryCreationForm;
}) {
  const translate = useTranslations();
  const { text, reading, isTouched } = creation.price;
  return (
    <PriceUnitField
      label={translate("priceDashboard.accessories.pricePerPiece")}
      unit={translate("priceDashboard.units.currency")}
      inputMode="decimal"
      value={text}
      error={
        isTouched && reading.kind === "refused"
          ? leiRefusalWords(translate, reading.refusal)
          : undefined
      }
      onChange={creation.typePrice}
    />
  );
}

/** What the server's answer to the creation says, where nothing was written. */
function FailureNotice({ feedback }: { readonly feedback: CreationFeedback }) {
  const translate = useTranslations();
  if (feedback.kind !== "failed") return null;
  return (
    <FormNotice tone="error">
      {creationFailureWords(
        translate,
        feedback.failure,
        "priceDashboard.accessories.createRefused",
      )}
    </FormNotice>
  );
}
