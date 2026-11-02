"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef } from "react";

import type { HardwareRateField } from "@lemnaria/configurator-domain";

import type { ContentTranslator } from "@/i18n/content";
import type { AppLocale } from "@/i18n/routing";
import { useContent } from "@/i18n/use-content";
import { StaffShell, type StaffShellContext } from "@/staff/staff-shell";

import { pendingPriceCountOf } from "./cabinet-list-model";
import { formatLei } from "./format-lei";
import {
  hardwareClassOf,
  type HardwareClassFacts,
  type HardwarePageInput,
  type ReadyHardware,
} from "./hardware-model";
import { hardwareNameOf } from "./hardware-names";
import {
  ClassChips,
  hardwareItemOf,
  HardwareUnavailableScreen,
} from "./hardware-list";
import { hardwarePathOf } from "./hardware-paths";
import styles from "./hardware.module.css";
import { ItemDeskNotice, ItemDialogs } from "./item-dialogs";
import type { ItemLifecycleClient } from "./item-lifecycle-client";
import { deleteStandOf, isItemOn, switchStandOf } from "./item-lifecycle-model";
import { offReasonWords } from "./item-lifecycle-words";
import type { PriceDraftClient } from "./price-draft-client";
import { leiRefusalWords, saveFailureWords } from "./price-input-words";
import editStyles from "./price-edit.module.css";
import { PriceUnitField } from "./price-unit-field";
import { publishPathOf } from "./publish-paths";
import { useFocusAfterCancel } from "./use-focus-after-cancel";
import { useHardwareDesk, type HardwareDesk } from "./use-hardware-desk";
import {
  useHardwareRateEditing,
  type HardwareRateEditing,
  type RateFieldState,
} from "./use-hardware-rate-editing";

// One hardware class (frame D4B): its words, whether customers may choose it, its four rates, and its deletion. A rate is
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
          <ClassWords facts={facts} name={name} />
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

/** The class's name and description. A catalogue row's are the catalogue's and a created row's are authored Romanian; this
 *  page edits neither. */
function ClassWords({
  facts,
  name,
}: {
  readonly facts: HardwareClassFacts;
  readonly name: string;
}) {
  const translate = useTranslations();
  const content = useContent();
  const description = content.bookText(
    facts.description.authored,
    facts.description.key,
  );
  return (
    <>
      <div className={styles.words}>
        <span className={styles.wordsLabel}>
          {translate("priceDashboard.hardware.nameLabel")}
        </span>
        <span className={styles.wordsValue}>{name}</span>
      </div>
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
  const { context } = availability;
  const item = hardwareItemOf(facts);
  const isOn = isItemOn(item, context);
  const stand = switchStandOf(item, context);
  const switchReason =
    stand.kind === "off" ? offReasonWords(translate, stand.reason) : undefined;
  const deleteStand = deleteStandOf(
    { kind: "hardware", tierId: facts.tierId },
    context,
  );
  const deleteReason =
    deleteStand.kind === "off"
      ? offReasonWords(translate, deleteStand.reason)
      : undefined;
  return (
    <>
      <ActiveSwitch
        isOn={isOn}
        reason={switchReason}
        hint={translate(
          facts.isCreated
            ? "priceDashboard.hardware.activeHintNew"
            : "priceDashboard.hardware.activeHint",
        )}
        onToggle={() => {
          availability.requestSwitch(item);
        }}
      />
      <div className={styles.danger}>
        <h2 className={styles.cardTitle}>
          {translate("priceDashboard.hardware.deleteHeading")}
        </h2>
        <p className={styles.hint}>
          {translate("priceDashboard.hardware.deleteHint")}
        </p>
        <DeleteAction
          reason={deleteReason}
          onPress={() => {
            availability.requestDeletion({
              kind: "hardware",
              tierId: facts.tierId,
            });
          }}
        />
      </div>
    </>
  );
}

function ActiveSwitch({
  isOn,
  reason,
  hint,
  onToggle,
}: {
  readonly isOn: boolean;
  /** Why the switch is off; absent, it can be pressed. */
  readonly reason: string | undefined;
  readonly hint: string;
  readonly onToggle: () => void;
}) {
  const translate = useTranslations();
  const hintId = useId();
  const isOff = reason !== undefined;
  return (
    <>
      <button
        type="button"
        role="switch"
        className={styles.switch}
        aria-checked={isOn}
        aria-disabled={isOff ? true : undefined}
        aria-describedby={hintId}
        onClick={isOff ? undefined : onToggle}
      >
        <span>{translate("priceDashboard.hardware.activeLabel")}</span>
        <span className={styles.switchState}>
          {translate(
            isOn
              ? "priceDashboard.chips.active"
              : "priceDashboard.chips.inactive",
          )}
        </span>
      </button>
      <p id={hintId} className={styles.hint}>
        {reason ?? hint}
      </p>
    </>
  );
}

function DeleteAction({
  reason,
  onPress,
}: {
  readonly reason: string | undefined;
  readonly onPress: () => void;
}) {
  const translate = useTranslations();
  const reasonId = useId();
  const isOff = reason !== undefined;
  return (
    <>
      <button
        type="button"
        className={editStyles.action}
        aria-disabled={isOff ? true : undefined}
        aria-describedby={isOff ? reasonId : undefined}
        onClick={isOff ? undefined : onPress}
      >
        {translate("priceDashboard.hardware.deleteAction")}
      </button>
      {isOff ? (
        <p id={reasonId} className={styles.hint}>
          {reason}
        </p>
      ) : null}
    </>
  );
}

const RATE_LABELS = {
  perHingeMinor: "priceDashboard.hardware.priceHinge",
  perDrawerMinor: "priceDashboard.hardware.priceSlide",
  perPushToOpenMinor: "priceDashboard.hardware.pricePush",
  perLiftMinor: "priceDashboard.hardware.priceLift",
} as const satisfies Record<HardwareRateField, string>;

const RATE_UNITS = {
  perHingeMinor: "priceDashboard.units.perHinge",
  perDrawerMinor: "priceDashboard.units.perSlidePair",
  perPushToOpenMinor: "priceDashboard.units.perMechanism",
  perLiftMinor: "priceDashboard.units.perMechanism",
} as const satisfies Record<HardwareRateField, string>;

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
      label={translate(RATE_LABELS[rate.field])}
      unit={translate(RATE_UNITS[rate.field])}
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
  const note = whatTheRateIsChargedFor(translate, rate.field);
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

function whatTheRateIsChargedFor(
  translate: ContentTranslator,
  field: HardwareRateField,
): string | undefined {
  switch (field) {
    case "perDrawerMinor":
      return translate("priceDashboard.hardware.priceSlideHint");
    case "perLiftMinor":
      return translate("priceDashboard.hardware.priceLiftHint");
    default:
      return undefined;
  }
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
