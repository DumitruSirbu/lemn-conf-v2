"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import type { ContentTranslator } from "@/i18n/content";
import type { AppLocale } from "@/i18n/routing";
import { useContent } from "@/i18n/use-content";
import { StaffShell, type StaffShellContext } from "@/staff/staff-shell";
import { TextField } from "@/account/account-form-parts";

import { pendingPriceCountOf } from "./cabinet-list-model";
import { formatLei } from "./format-lei";
import {
  hardwareClassOf,
  type HardwareClassFacts,
  type HardwarePageInput,
  type ReadyHardware,
} from "./hardware-model";
import { hardwareNameOf } from "./hardware-names";
import { ActionThatMayBeOff } from "./action-that-may-be-off";
import {
  ClassChips,
  hardwareItemOf,
  HardwareUnavailableScreen,
  reasonsOf,
} from "./hardware-parts";
import { hardwarePathOf } from "./hardware-paths";
import { HARDWARE_RATE_WORDS } from "./hardware-rate-words";
import styles from "./hardware.module.css";
import { ItemDeskNotice, ItemDialogs } from "./item-dialogs";
import type { ItemLifecycleClient } from "./item-lifecycle-client";
import { isItemOn } from "./item-lifecycle-model";
import type { PriceDraftClient } from "./price-draft-client";
import {
  createdTextRefusalWords,
  leiRefusalWords,
  priceWriteFailureWords,
  saveFailureWords,
} from "./price-input-words";
import editStyles from "./price-edit.module.css";
import { PriceUnitField } from "./price-unit-field";
import { publishPathOf } from "./publish-paths";
import {
  useHardwareClassNameEditing,
  type HardwareClassNameEditing,
} from "./use-hardware-class-name-editing";
import { useFocusAfterCancel } from "./use-focus-after-cancel";
import { useHardwareDesk, type HardwareDesk } from "./use-hardware-desk";
import {
  useHardwareRateEditing,
  type HardwareRateEditing,
  type RateFieldState,
} from "./use-hardware-rate-editing";

// One hardware class (frame D4B): its words, whether customers may choose it, every rate, and its deletion. A rate is
// sent to "De publicat" only on Save; whether the class is on applies at once, through the dialogs, and never joins the draft.

export interface HardwareEditScreenProps {
  readonly locale: AppLocale;
  readonly context: StaffShellContext;
  readonly page: HardwarePageInput;
  readonly tierId: string;
  /** The routes the draft is written through; the fetching client when left out. */
  readonly client?: PriceDraftClient | undefined;
  /** Where a switch is written and the saved kitchens are counted; the page's own stand-in when left out. */
  readonly lifecycleClient?: ItemLifecycleClient | undefined;
}

export function HardwareEditScreen({
  locale,
  context,
  page,
  tierId,
  client,
  lifecycleClient,
}: HardwareEditScreenProps) {
  const desk = useHardwareDesk({ page, client, lifecycleClient });
  const { derivation } = desk;
  if (derivation.kind !== "ready") {
    return <HardwareUnavailableScreen locale={locale} context={context} />;
  }
  const shell = {
    ...context,
    pendingPriceCount: pendingPriceCountOf(desk.draft.state.draft),
  };
  const facts = hardwareClassOf(derivation, tierId);
  if (facts === undefined) {
    return (
      <StaffShell locale={locale} page="hardware" context={shell}>
        <ClassRemoved locale={locale} />
      </StaffShell>
    );
  }
  return (
    <StaffShell locale={locale} page="hardware" context={shell}>
      <HardwareEdit
        key={tierId}
        locale={locale}
        desk={desk}
        derivation={derivation}
        facts={facts}
      />
    </StaffShell>
  );
}

/** The class is no longer in the draft: it was created there and has just been deleted, so nothing is left to publish. */
function ClassRemoved({ locale }: { readonly locale: AppLocale }) {
  const translate = useTranslations();
  const noticeRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    noticeRef.current?.focus();
  }, []);
  return (
    <section className={styles.page} data-testid="hardware-removed">
      <a className={styles.back} href={hardwarePathOf(locale)}>
        {translate("priceDashboard.hardware.title")}
      </a>
      <p ref={noticeRef} tabIndex={-1} className={styles.notice} role="status">
        {translate("priceDashboard.hardware.createdRemoved")}
      </p>
    </section>
  );
}

function HardwareEdit({
  locale,
  desk,
  derivation,
  facts,
}: {
  readonly locale: AppLocale;
  readonly desk: HardwareDesk;
  readonly derivation: ReadyHardware;
  readonly facts: HardwareClassFacts;
}) {
  const translate = useTranslations();
  const content = useContent();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { availability } = desk;
  const name = content.bookText(facts.name.authored, facts.name.key);
  const editing = useHardwareRateEditing({
    tierId: facts.tierId,
    rates: facts.rates,
    draft: desk.draft,
  });
  const renaming = useHardwareClassNameEditing({
    tierId: facts.tierId,
    currentName: facts.name.authored,
    publishedName: facts.activeName,
    draft: desk.draft,
  });
  return (
    <section className={styles.page} data-testid="hardware-edit">
      <div className={styles.heading}>
        <a className={styles.back} href={hardwarePathOf(locale)}>
          {translate("priceDashboard.hardware.title")}
        </a>
        <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
          {name}
        </h1>
        <ClassChips facts={facts} context={availability.context} />
      </div>
      <ItemDeskNotice desk={availability} />
      <div className={styles.editColumns}>
        <div className={styles.editColumn}>
          <ClassWords facts={facts} name={name} renaming={renaming} />
          {facts.isDeletionPending ? (
            <p className={styles.notice} role="status">
              {translate("priceDashboard.hardware.deleteNotice")}
            </p>
          ) : (
            <Lifecycle facts={facts} desk={desk} />
          )}
        </div>
        {facts.isDeletionPending ? null : (
          <div className={styles.editColumn}>
            <RateFields locale={locale} editing={editing} />
          </div>
        )}
      </div>
      <ItemDialogs
        desk={availability}
        nameOf={(item) => hardwareNameOf(derivation, content.bookText, item)}
        returnFocusFallbackRef={headingRef}
      />
    </section>
  );
}

/** The class's name and description. A catalogue row's are the catalogue's and read-only; a created row's name is
 *  authored Romanian and can be reworded here, its description is shown only. */
function ClassWords({
  facts,
  name,
  renaming,
}: {
  readonly facts: HardwareClassFacts;
  readonly name: string;
  readonly renaming: HardwareClassNameEditing;
}) {
  const translate = useTranslations();
  const content = useContent();
  const description = content.bookText(
    facts.description.authored,
    facts.description.key,
  );
  const canRename = !facts.isKeyed && !facts.isDeletionPending;
  return (
    <>
      {canRename ? (
        <CreatedName renaming={renaming} />
      ) : (
        <div className={styles.words}>
          <span className={styles.wordsLabel}>
            {translate("priceDashboard.hardware.nameLabel")}
          </span>
          <span className={styles.wordsValue}>{name}</span>
        </div>
      )}
      <div className={styles.words}>
        <span className={styles.wordsLabel}>
          {translate("priceDashboard.hardware.descriptionLabel")}
        </span>
        <span className={styles.wordsValue}>{description}</span>
      </div>
      <p className={styles.hint}>
        {translate(
          facts.isKeyed
            ? "priceDashboard.common.keyedTextNote"
            : "priceDashboard.common.createdTextNote",
        )}
      </p>
    </>
  );
}

/** The name of a created class as a field with its button; where the client cannot take it, the name is text with the
 *  reason. */
function CreatedName({
  renaming,
}: {
  readonly renaming: HardwareClassNameEditing;
}) {
  const translate = useTranslations();
  if (!renaming.canWrite) {
    return (
      <div className={styles.words}>
        <span className={styles.wordsLabel}>
          {translate("priceDashboard.hardware.nameLabel")}
        </span>
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
        label={translate("priceDashboard.hardware.nameLabel")}
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
          {translate("priceDashboard.hardware.renameAction")}
        </button>
      </div>
    </>
  );
}

/** What the typed name reads as, then what the server's answer to its Save says. */
function nameErrorProps(
  translate: ContentTranslator,
  { judgement, isTouched, failure }: HardwareClassNameEditing,
): { readonly error?: string } {
  if (isTouched && !judgement.ok) {
    return { error: createdTextRefusalWords(translate, judgement.code) };
  }
  return failure === undefined
    ? {}
    : { error: priceWriteFailureWords(translate, failure) };
}

/** Whether customers may choose the class, and its deletion. */
function Lifecycle({
  facts,
  desk,
}: {
  readonly facts: HardwareClassFacts;
  readonly desk: HardwareDesk;
}) {
  const translate = useTranslations();
  const { availability } = desk;
  const item = hardwareItemOf(facts);
  const { switchReason, deleteReason } = reasonsOf({
    translate,
    facts,
    context: availability.context,
  });
  const isOn = isItemOn(item, availability.context);
  return (
    <>
      <ActionThatMayBeOff
        reason={switchReason}
        restingNote={translate(
          facts.isCreated
            ? "priceDashboard.hardware.activeHintNew"
            : "priceDashboard.hardware.activeHint",
        )}
        switchState={isOn}
        buttonClassName={styles.switch}
        noteClassName={styles.hint}
        noteTag="p"
        onPress={() => {
          availability.requestSwitch(item);
        }}
      >
        <span>{translate("priceDashboard.hardware.activeLabel")}</span>
        <span className={styles.switchState}>
          {translate(
            isOn
              ? "priceDashboard.chips.active"
              : "priceDashboard.chips.inactive",
          )}
        </span>
      </ActionThatMayBeOff>
      <div className={styles.danger}>
        <h2 className={styles.cardTitle}>
          {translate("priceDashboard.hardware.deleteHeading")}
        </h2>
        <p className={styles.hint}>
          {translate("priceDashboard.hardware.deleteHint")}
        </p>
        <ActionThatMayBeOff
          reason={deleteReason}
          buttonClassName={editStyles.action}
          noteClassName={styles.hint}
          noteTag="p"
          onPress={() => {
            availability.requestDeletion(item);
          }}
        >
          {translate("priceDashboard.hardware.deleteAction")}
        </ActionThatMayBeOff>
      </div>
    </>
  );
}

function RateFields({
  locale,
  editing,
}: {
  readonly locale: AppLocale;
  readonly editing: HardwareRateEditing;
}) {
  const translate = useTranslations();
  const fieldsRef = useRef<HTMLDivElement>(null);
  const cancel = useFocusAfterCancel(editing.cancel, fieldsRef);
  return (
    <>
      <h2 className={styles.cardTitle}>
        {translate("priceDashboard.hardware.pricesHeading")}
      </h2>
      <p className={styles.intro}>
        {translate("priceDashboard.hardware.pricesHint")}
      </p>
      <div ref={fieldsRef} tabIndex={-1} className={styles.fields}>
        {editing.states.map((state) => (
          <RateField key={state.rate.field} state={state} editing={editing} />
        ))}
      </div>
      <SaveBar locale={locale} editing={editing} onCancel={cancel} />
    </>
  );
}

function RateField({
  state,
  editing,
}: {
  readonly state: RateFieldState;
  readonly editing: HardwareRateEditing;
}) {
  const translate = useTranslations();
  const { rate } = state;
  const error = errorOf(translate, state, editing);
  const hint = error === undefined ? hintOf(translate, rate) : undefined;
  return (
    <PriceUnitField
      label={translate(HARDWARE_RATE_WORDS[rate.field].label)}
      unit={translate(HARDWARE_RATE_WORDS[rate.field].unit)}
      inputMode="decimal"
      value={state.text}
      hint={hint}
      error={error}
      isPending={rate.pendingMinor !== rate.activeMinor || state.isChanged}
      onChange={(text) => {
        editing.type(rate.field, text);
      }}
    />
  );
}

/** Beside the field: what is active now, then what the rate is charged for, where the frame says so. A class only the draft
 *  knows has no active rate. */
function hintOf(
  translate: ContentTranslator,
  rate: RateFieldState["rate"],
): string | undefined {
  const noteWords = HARDWARE_RATE_WORDS[rate.field].hint;
  const note = noteWords === undefined ? undefined : translate(noteWords);
  if (rate.activeMinor === undefined) return note;
  const amount = formatLei(
    rate.activeMinor,
    translate("priceDashboard.units.currency"),
  );
  return note === undefined
    ? translate("priceDashboard.common.activeValue", { amount })
    : translate("priceDashboard.common.activeValueWithHint", {
        amount,
        hint: note,
      });
}

/** What a typed value reads as, and where the server's answer to the write last tried is told: under its own field. */
function errorOf(
  translate: ContentTranslator,
  { rate, reading }: RateFieldState,
  { feedback }: HardwareRateEditing,
): string | undefined {
  if (reading.kind === "refused") {
    return leiRefusalWords(translate, reading.refusal);
  }
  if (feedback.kind === "failed" && feedback.fieldKey === rate.field) {
    return saveFailureWords(translate, feedback);
  }
  return undefined;
}

function SaveBar({
  locale,
  editing,
  onCancel,
}: {
  readonly locale: AppLocale;
  readonly editing: HardwareRateEditing;
  readonly onCancel: () => void;
}) {
  const translate = useTranslations();
  const savedNoticeRef = useRef<HTMLDivElement>(null);
  const isSaved = editing.feedback.kind === "saved" && !editing.isChanged;
  const mustFix = editing.states.some(
    (state) => state.reading.kind === "refused",
  );
  useEffect(() => {
    // Save leaves the page with the notice that replaces it; focus lost with it goes to the notice, not the body.
    if (isSaved && document.activeElement === document.body) {
      savedNoticeRef.current?.focus();
    }
  }, [isSaved]);
  if (isSaved) {
    return (
      <div
        ref={savedNoticeRef}
        tabIndex={-1}
        className={styles.saved}
        role="status"
      >
        <p>{translate("priceDashboard.common.priceSavedNotice")}</p>
        <a className={styles.savedLink} href={publishPathOf(locale)}>
          {translate("priceDashboard.nav.publish")}
        </a>
      </div>
    );
  }
  return (
    <div className={styles.actions}>
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
      {editing.isChanged || mustFix || editing.feedback.kind === "failed" ? (
        <button type="button" className={editStyles.action} onClick={onCancel}>
          {translate("priceDashboard.common.cancel")}
        </button>
      ) : null}
      {mustFix ? (
        <p className={styles.fixToSave}>
          {translate("priceDashboard.errors.fixToSave")}
        </p>
      ) : null}
    </div>
  );
}
